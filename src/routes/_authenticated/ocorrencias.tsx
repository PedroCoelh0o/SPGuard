import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BarChart3,
  Eye,
  FileDown,
  FilePlus2,
  FolderOpen,
  Image,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  addRecoveryToLegacy,
  createProtection,
  decryptFile,
  decryptJson,
  encryptFile,
  encryptJson,
  hasRecovery,
  resetPasswordWithRecovery,
  type OcorrenciasProtection,
  unlockProtection,
} from "@/lib/ocorrencias-crypto";
import { exportOcorrenciaPDF } from "@/lib/export-ocorrencia";

export const Route = createFileRoute("/_authenticated/ocorrencias")({ component: Ocorrencias });

type Person = {
  id: string;
  nome: string;
  tipo: "Colaborador terceirizado" | "Pessoa externa" | "Outro";
  observacao?: string;
  foto?: FileInfo;
};
type FileInfo = { id: string; nome: string; tipo: string; storagePath: string; imagem?: boolean };
type Occurrence = {
  id: string;
  protocolo: string;
  data: string;
  local: string;
  area?: string;
  setor_local?: string;
  ponto_referencia?: string;
  coordenadas?: string;
  categoria: string;
  status: "Em análise" | "Encaminhada" | "Encerrada" | "Arquivada";
  relato: string;
  encaminhamentos: string;
  pessoas: Person[];
  evidencias: FileInfo[];
  historico: { data: string; texto: string }[];
  createdAt: string;
  updatedAt: string;
};
type StoredOccurrence = { id: string; payload: string; created_at: string; updated_at: string };

const categories = [
  "Pesca não autorizada",
  "Caça não autorizada",
  "Extração irregular",
  "Desvio de insumos",
  "Revista veicular",
  "Invasão",
  "Outro",
];
const statuses: Occurrence["status"][] = ["Em análise", "Encaminhada", "Encerrada", "Arquivada"];
const now = () => new Date().toISOString();
const chartText = "var(--color-foreground)";
const axisTick = { fontSize: 11, fill: chartText };
const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid hsl(0 0% 50% / 0.4)",
  borderRadius: "8px",
  color: "var(--color-popover-foreground)",
  fontSize: "12px",
} as const;
const tooltipLabelStyle = { color: "var(--color-popover-foreground)", fontWeight: 600 } as const;
const tooltipItemStyle = { color: "var(--color-popover-foreground)" } as const;
const emptyOccurrence = (): Occurrence => ({
  id: crypto.randomUUID(),
  protocolo: `OC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  data: new Date().toISOString().slice(0, 10),
  local: "",
  area: "",
  setor_local: "",
  ponto_referencia: "",
  coordenadas: "",
  categoria: "",
  status: "Em análise",
  relato: "",
  encaminhamentos: "",
  pessoas: [],
  evidencias: [],
  historico: [{ data: now(), texto: "Registro criado" }],
  createdAt: now(),
  updatedAt: now(),
});

function countBy(items: Occurrence[], get: (item: Occurrence) => string) {
  return Array.from(
    items
      .reduce(
        (map, item) =>
          map.set(get(item) || "Não informado", (map.get(get(item) || "Não informado") ?? 0) + 1),
        new Map<string, number>(),
      )
      .entries(),
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

function Ocorrencias() {
  const [protection, setProtection] = useState<OcorrenciasProtection | null | undefined>(undefined);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryWord, setRecoveryWord] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [legacyPassword, setLegacyPassword] = useState("");
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ativos");
  const [draft, setDraft] = useState<Occurrence>(emptyOccurrence);
  const [personDraft, setPersonDraft] = useState<Person>({
    id: "",
    nome: "",
    tipo: "Pessoa externa",
    observacao: "",
  });
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{
    title: string;
    url: string;
    kind: "image" | "pdf";
    temporary?: boolean;
  } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [includePersonPhotos, setIncludePersonPhotos] = useState(false);
  const [includeEvidencePhotos, setIncludeEvidencePhotos] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Occurrence | null>(null);
  const [personEditing, setPersonEditing] = useState<Person | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const evidenceInput = useRef<HTMLInputElement>(null);

  const loadProtection = async () => {
    const { data, error } = await supabase
      .from("ocorrencias_protecao" as never)
      .select("*")
      .eq("id", "principal");
    if (error) toast.error(error.message);
    setProtection(((data ?? [])[0] as OcorrenciasProtection | undefined) ?? null);
  };
  useEffect(() => {
    void loadProtection();
  }, []);
  const load = async (activeKey = key) => {
    if (!activeKey) return;
    setLoading(true);
    try {
      const rows = await fetchAllRows<StoredOccurrence>(
        () =>
          supabase
            .from("ocorrencias" as never)
            .select("*")
            .order("updated_at", { ascending: false }) as never,
      );
      const parsed = await Promise.all(
        rows.map(async (row) => ({
          ...(await decryptJson<Occurrence>(row.payload, activeKey)),
          id: row.id,
        })),
      );
      setItems(parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (error) {
      toast.error("Não foi possível abrir os registros protegidos: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (key) void load(key);
  }, [key]);
  const setup = async () => {
    if (password !== confirmation) return toast.error("As senhas não coincidem");
    if (recoveryWord !== recoveryConfirmation)
      return toast.error("As palavras de recuperação não coincidem");
    try {
      const result = await createProtection(password, recoveryWord);
      const { error } = await supabase
        .from("ocorrencias_protecao" as never)
        .upsert([result.protection] as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
      setKey(result.key);
      setProtection(result.protection);
      setPassword("");
      setConfirmation("");
      setRecoveryWord("");
      setRecoveryConfirmation("");
      toast.success("Proteção e palavra de recuperação criadas localmente.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const unlock = async () => {
    if (!protection) return;
    try {
      const result = await unlockProtection(protection, password);
      setKey(result.key);
      if (result.legacy) setLegacyPassword(password);
      setPassword("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const resetPassword = async () => {
    if (!protection) return;
    if (password !== confirmation) return toast.error("As senhas não coincidem");
    try {
      const result = await resetPasswordWithRecovery(protection, recoveryWord, password);
      const { error } = await supabase
        .from("ocorrencias_protecao" as never)
        .upsert([result.protection] as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
      setKey(result.key);
      setProtection(result.protection);
      setPassword("");
      setConfirmation("");
      setRecoveryWord("");
      setForgotPassword(false);
      setRecoveryOpen(false);
      toast.success("Senha redefinida sem alterar os registros protegidos.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const enrollLegacyRecovery = async () => {
    if (!protection || !legacyPassword)
      return toast.error("Desbloqueie a área usando a senha atual novamente");
    if (recoveryWord !== recoveryConfirmation)
      return toast.error("As palavras de recuperação não coincidem");
    try {
      const result = await addRecoveryToLegacy(protection, legacyPassword, recoveryWord);
      const { error } = await supabase
        .from("ocorrencias_protecao" as never)
        .upsert([result.protection] as never, { onConflict: "id" });
      if (error) throw new Error(error.message);
      setKey(result.key);
      setProtection(result.protection);
      setLegacyPassword("");
      setRecoveryWord("");
      setRecoveryConfirmation("");
      toast.success("Palavra de recuperação ativada. Seus registros permanecem protegidos.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const persist = async (item: Occurrence) => {
    if (!key) return;
    const updated = { ...item, updatedAt: now() };
    const { error } = await supabase.from("ocorrencias" as never).upsert(
      [
        {
          id: updated.id,
          payload: await encryptJson(updated, key),
          created_at: updated.createdAt,
          updated_at: updated.updatedAt,
        },
      ] as never,
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    setItems((old) => [updated, ...old.filter((x) => x.id !== updated.id)]);
    setSelected(updated.id);
    return updated;
  };
  const saveNew = async () => {
    if (!draft.local.trim() || !draft.categoria.trim() || !draft.relato.trim())
      return toast.error("Informe local, categoria e relato factual");
    try {
      await persist(draft);
      setNewOpen(false);
      setDraft(emptyOccurrence());
      toast.success("Ocorrência registrada localmente");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const selectedItem = items.find((item) => item.id === selected) ?? null;
  const shown = useMemo(
    () =>
      items.filter((item) => {
        const text =
          `${item.protocolo} ${item.local} ${item.categoria} ${item.relato}`.toLowerCase();
        return (
          (!filter || text.includes(filter.toLowerCase())) &&
          (statusFilter === "todos" || statusFilter === "ativos"
            ? statusFilter !== "ativos" || item.status !== "Arquivada"
            : item.status === statusFilter)
        );
      }),
    [items, filter, statusFilter],
  );
  const stats = useMemo(
    () =>
      countBy(
        items.filter((item) => item.status !== "Arquivada"),
        (item) => item.categoria,
      ),
    [items],
  );
  useEffect(() => {
    if (!selectedItem || !key) return;
    let valid = true;
    const urls: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const person of selectedItem.pessoas)
        if (person.foto) {
          try {
            const { data } = await supabase.storage
              .from("ocorrencia-evidencias")
              .createSignedUrl(person.foto.storagePath, 60);
            if (!data) continue;
            const raw = await fetch(data.signedUrl);
            const blob = await decryptFile(await raw.blob(), key, person.foto.tipo);
            URL.revokeObjectURL(data.signedUrl);
            const url = URL.createObjectURL(blob);
            urls.push(url);
            next[person.id] = url;
          } catch {
            /* arquivo indisponível permanece sem miniatura */
          }
        }
      if (valid) setPhotos(next);
    })();
    return () => {
      valid = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [selectedItem?.id, selectedItem?.updatedAt, key]);
  const upload = async (file: File, occurrenceId: string, kind: "pessoa" | "evidencia") => {
    if (!key) throw new Error("Área bloqueada");
    if (file.size > 50 * 1024 * 1024) throw new Error("O arquivo excede 50 MB");
    const id = crypto.randomUUID();
    const path = `${occurrenceId}/${id}.bin`;
    const encrypted = await encryptFile(file, key);
    const sent = await supabase.storage
      .from("ocorrencia-evidencias")
      .upload(path, new File([encrypted], `${id}.bin`, { type: "application/octet-stream" }));
    if (sent.error) throw new Error(sent.error.message);
    const { error } = await supabase.from("ocorrencia_arquivos" as never).upsert(
      [
        {
          id,
          ocorrencia_id: occurrenceId,
          storage_path: path,
          created_at: now(),
          updated_at: now(),
        },
      ] as never,
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return {
      id,
      nome: file.name,
      tipo: file.type || "application/octet-stream",
      storagePath: path,
      imagem: kind === "pessoa" || file.type.startsWith("image/"),
    } as FileInfo;
  };
  const addPerson = async () => {
    if (!selectedItem || !personDraft.nome.trim()) return toast.error("Informe o nome da pessoa");
    const person = { ...personDraft, id: crypto.randomUUID() };
    try {
      await persist({
        ...selectedItem,
        pessoas: [...selectedItem.pessoas, person],
        historico: [
          ...selectedItem.historico,
          { data: now(), texto: `Pessoa vinculada: ${person.nome}` },
        ],
      });
      setPersonDraft({ id: "", nome: "", tipo: "Pessoa externa", observacao: "" });
      toast.success("Pessoa vinculada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const uploadPersonPhoto = async (file?: File) => {
    if (!selectedItem || !file || !photoTarget) return;
    const person = selectedItem.pessoas.find((item) => item.id === photoTarget);
    if (!person) return toast.error("Pessoa não encontrada");
    try {
      const photo = await upload(file, selectedItem.id, "pessoa");
      const preview = URL.createObjectURL(file);
      setPhotos((old) => ({ ...old, [person.id]: preview }));
      await persist({
        ...selectedItem,
        pessoas: selectedItem.pessoas.map((p) => (p.id === person.id ? { ...p, foto: photo } : p)),
      });
      toast.success(`Foto protegida e vinculada a ${person.nome}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (photoInput.current) photoInput.current.value = "";
      setPhotoTarget(null);
    }
  };
  const uploadEvidence = async (files?: FileList | null) => {
    if (!selectedItem || !files?.length) return;
    try {
      const added = await Promise.all(
        [...files].map((file) => upload(file, selectedItem.id, "evidencia")),
      );
      await persist({
        ...selectedItem,
        evidencias: [...selectedItem.evidencias, ...added],
        historico: [
          ...selectedItem.historico,
          { data: now(), texto: `${added.length} arquivo(s) anexado(s)` },
        ],
      });
      toast.success("Evidência(s) protegida(s) localmente");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (evidenceInput.current) evidenceInput.current.value = "";
    }
  };
  const deleteEvidence = async (file: FileInfo) => {
    if (!selectedItem || !window.confirm(`Excluir permanentemente o arquivo "${file.nome}"?`))
      return;
    try {
      const removed = await supabase.storage
        .from("ocorrencia-evidencias")
        .remove([file.storagePath]);
      if (removed.error) throw new Error(removed.error.message);
      const { error } = await supabase
        .from("ocorrencia_arquivos" as never)
        .delete()
        .eq("id", file.id)
        .permanently();
      if (error) throw new Error(error.message);
      await persist({
        ...selectedItem,
        evidencias: selectedItem.evidencias.filter((item) => item.id !== file.id),
        historico: [
          ...selectedItem.historico,
          { data: now(), texto: `Arquivo excluído: ${file.nome}` },
        ],
      });
      toast.success("Arquivo excluído");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const openFile = async (file: FileInfo) => {
    if (!key) return;
    try {
      const { data } = await supabase.storage
        .from("ocorrencia-evidencias")
        .createSignedUrl(file.storagePath, 60);
      if (!data) throw new Error("Arquivo não encontrado");
      const response = await fetch(data.signedUrl);
      const blob = await decryptFile(await response.blob(), key, file.tipo);
      URL.revokeObjectURL(data.signedUrl);
      const url = URL.createObjectURL(blob);
      if (file.imagem) setViewer({ title: file.nome, url, kind: "image", temporary: true });
      else if (file.tipo.toLowerCase().includes("pdf"))
        setViewer({ title: file.nome, url, kind: "pdf", temporary: true });
      else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.nome;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const exportSelected = async () => {
    if (!selectedItem || !key) return;
    try {
      const imageFiles = [
        ...(includePersonPhotos
          ? selectedItem.pessoas.flatMap((p) =>
              p.foto ? [{ title: `Foto de ${p.nome}`, file: p.foto }] : [],
            )
          : []),
        ...(includeEvidencePhotos
          ? selectedItem.evidencias
              .filter((f) => f.imagem)
              .map((file) => ({ title: `Evidência: ${file.nome}`, file }))
          : []),
      ];
      const images: { titulo: string; dataUrl: string }[] = [];
      for (const image of imageFiles) {
        const { data } = await supabase.storage
          .from("ocorrencia-evidencias")
          .createSignedUrl(image.file.storagePath, 60);
        if (!data) continue;
        const response = await fetch(data.signedUrl);
        const blob = await decryptFile(await response.blob(), key, image.file.tipo);
        URL.revokeObjectURL(data.signedUrl);
        images.push({ titulo: image.title, dataUrl: await blobToJpeg(blob) });
      }
      exportOcorrenciaPDF(selectedItem, images);
      setExportOpen(false);
      toast.success("PDF gerado localmente");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const startEditing = () => {
    if (!selectedItem) return;
    setEditDraft({
      ...selectedItem,
      pessoas: [...selectedItem.pessoas],
      evidencias: [...selectedItem.evidencias],
      historico: [...selectedItem.historico],
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!editDraft || !selectedItem) return;
    if (!editDraft.local.trim() || !editDraft.categoria.trim() || !editDraft.relato.trim())
      return toast.error("Informe local, categoria e relato factual");
    try {
      await persist({
        ...editDraft,
        historico: [
          ...selectedItem.historico,
          { data: now(), texto: "Informações gerais editadas" },
        ],
      });
      setEditing(false);
      setEditDraft(null);
      toast.success("Ocorrência atualizada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const savePersonEdit = async () => {
    if (!selectedItem || !personEditing || !personEditing.nome.trim())
      return toast.error("Informe o nome da pessoa");
    try {
      await persist({
        ...selectedItem,
        pessoas: selectedItem.pessoas.map((person) =>
          person.id === personEditing.id ? personEditing : person,
        ),
        historico: [
          ...selectedItem.historico,
          { data: now(), texto: `Informações da pessoa atualizadas: ${personEditing.nome}` },
        ],
      });
      setPersonEditing(null);
      toast.success("Pessoa atualizada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (protection === undefined)
    return <p className="text-sm text-muted-foreground">Carregando proteção local…</p>;
  if (!protection || !key)
    return (
      <AccessCard
        initial={!protection}
        forgot={forgotPassword}
        password={password}
        confirmation={confirmation}
        recoveryWord={recoveryWord}
        recoveryConfirmation={recoveryConfirmation}
        setPassword={setPassword}
        setConfirmation={setConfirmation}
        setRecoveryWord={setRecoveryWord}
        setRecoveryConfirmation={setRecoveryConfirmation}
        onSubmit={!protection ? setup : unlock}
        onForgot={() => setForgotPassword((value) => !value)}
        onReset={resetPassword}
      />
    );
  if (!hasRecovery(protection))
    return (
      <RecoveryEnrollment
        recoveryWord={recoveryWord}
        confirmation={recoveryConfirmation}
        setRecoveryWord={setRecoveryWord}
        setConfirmation={setRecoveryConfirmation}
        onSave={enrollLegacyRecovery}
      />
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" /> Ocorrências e Apurações
          </h1>
          <p className="text-sm text-muted-foreground">
            Registros factuais protegidos no computador. Esta área não usa internet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRecoveryOpen(true)}>
            <KeyRound /> Alterar senha
          </Button>
          <Button
            onClick={() => {
              setDraft(emptyOccurrence());
              setNewOpen(true);
            }}
          >
            <Plus /> Nova ocorrência
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric title="Em análise" total={items.filter((i) => i.status === "Em análise").length} />
        <Metric
          title="Encaminhadas"
          total={items.filter((i) => i.status === "Encaminhada").length}
        />
        <Metric title="Arquivadas" total={items.filter((i) => i.status === "Arquivada").length} />
      </div>
      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              className="pl-9"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Pesquisar por protocolo, local, categoria ou relato…"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativas (sem arquivadas)</SelectItem>
              <SelectItem value="todos">Todas</SelectItem>
              {statuses.map((status) => (
                <SelectItem value={status} key={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registros ({shown.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 font-medium">Protocolo</th>
                    <th className="p-3 font-medium">Local</th>
                    <th className="p-3 font-medium">Categoria</th>
                    <th className="p-3 font-medium">Envolvido</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="p-4 text-muted-foreground" colSpan={5}>
                        Carregando…
                      </td>
                    </tr>
                  ) : shown.length === 0 ? (
                    <tr>
                      <td className="p-4 text-muted-foreground" colSpan={5}>
                        Nenhuma ocorrência encontrada.
                      </td>
                    </tr>
                  ) : (
                    shown.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelected(item.id)}
                        className="cursor-pointer border-t hover:bg-accent"
                      >
                        <td className="p-3">
                          <strong>{item.protocolo}</strong>
                          <p className="mt-1 text-xs text-muted-foreground">{item.data}</p>
                        </td>
                        <td className="p-3 font-medium">{item.local || "Local não informado"}</td>
                        <td className="p-3">{item.categoria || "Sem categoria"}</td>
                        <td className="p-3">
                          <span className="line-clamp-2">
                            {item.pessoas.length
                              ? item.pessoas.map((person) => person.nome).join(", ")
                              : "Não informado"}
                          </span>
                        </td>
                        <td className="p-3">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex gap-2 items-center">
              <BarChart3 className="h-4 w-4" /> Ocorrências por categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[620px] overflow-y-auto pr-2">
              {stats.length ? (
                <ResponsiveContainer width="100%" height={Math.max(160, stats.length * 38)}>
                  <BarChart data={stats} layout="vertical" margin={{ left: 16, right: 24 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(0 0% 50% / 0.4)"
                      opacity={0.5}
                    />
                    <XAxis type="number" allowDecimals={false} tick={axisTick} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={170}
                      interval={0}
                      tick={axisTick}
                    />
                    <Tooltip
                      shared={false}
                      cursor={false}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      formatter={(value: number) => [value, "Total"]}
                    />
                    <Bar dataKey="total" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Os indicadores aparecerão conforme houver registros.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova ocorrência</DialogTitle>
          </DialogHeader>
          <OccurrenceForm value={draft} onChange={setDraft} />
          <div className="flex justify-end">
            <Button onClick={saveNew}>
              <FilePlus2 /> Registrar localmente
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setEditing(false);
            setEditDraft(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar ocorrência" : selectedItem.protocolo}</DialogTitle>
              </DialogHeader>
              {editing && editDraft ? (
                <>
                  <OccurrenceForm value={editDraft} onChange={setEditDraft} />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(false);
                        setEditDraft(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={() => void saveEdit()}>Salvar alterações</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={selectedItem.status}
                      onValueChange={async (value) => {
                        const status = value as Occurrence["status"];
                        try {
                          await persist({
                            ...selectedItem,
                            status,
                            historico: [
                              ...selectedItem.historico,
                              { data: now(), texto: `Status alterado para ${status}` },
                            ],
                          });
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={startEditing}>
                      <Pencil /> Editar
                    </Button>
                    <Button variant="outline" onClick={() => setExportOpen(true)}>
                      <FileDown /> Exportar PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void persist({
                          ...selectedItem,
                          status: selectedItem.status === "Arquivada" ? "Em análise" : "Arquivada",
                          historico: [
                            ...selectedItem.historico,
                            {
                              data: now(),
                              texto:
                                selectedItem.status === "Arquivada"
                                  ? "Registro reaberto"
                                  : "Registro arquivado",
                            },
                          ],
                        })
                      }
                    >
                      <Archive /> {selectedItem.status === "Arquivada" ? "Reabrir" : "Arquivar"}
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 text-sm">
                    <Info label="Categoria" value={selectedItem.categoria} />
                    <Info label="Local" value={selectedItem.local} />
                    <Info label="Área" value={selectedItem.area ?? ""} />
                    <Info label="Setor" value={selectedItem.setor_local ?? ""} />
                    <Info label="Ponto de referência" value={selectedItem.ponto_referencia ?? ""} />
                    <Info label="Coordenadas" value={selectedItem.coordenadas ?? ""} />
                    <Info label="Data" value={selectedItem.data} />
                    <Info label="Status" value={selectedItem.status} />
                  </div>
                  <Info label="Relato factual" value={selectedItem.relato} block />
                  <Info
                    label="Ações e encaminhamentos"
                    value={selectedItem.encaminhamentos}
                    block
                  />
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex gap-2 items-center">
                        <Users className="h-4 w-4" /> Pessoas vinculadas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedItem.pessoas.map((person) => (
                        <div key={person.id} className="flex items-center gap-3 rounded border p-2">
                          {photos[person.id] ? (
                            <button
                              type="button"
                              onClick={() =>
                                setViewer({
                                  title: person.nome,
                                  url: photos[person.id],
                                  kind: "image",
                                })
                              }
                            >
                              <img
                                className="h-14 w-14 rounded object-cover"
                                src={photos[person.id]}
                                alt={person.nome}
                              />
                            </button>
                          ) : (
                            <div className="h-14 w-14 rounded bg-muted grid place-items-center">
                              <Image className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <strong>{person.nome}</strong>
                            <p className="text-xs text-muted-foreground">
                              {person.tipo}
                              {person.observacao ? ` · ${person.observacao}` : ""}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Editar informações da pessoa"
                            onClick={() => setPersonEditing({ ...person })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Adicionar ou trocar foto"
                            onClick={() => {
                              setPhotoTarget(person.id);
                              photoInput.current?.click();
                            }}
                          >
                            <Image />
                          </Button>
                        </div>
                      ))}
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input
                          placeholder="Nome da pessoa"
                          value={personDraft.nome}
                          onChange={(e) => setPersonDraft({ ...personDraft, nome: e.target.value })}
                        />
                        <Select
                          value={personDraft.tipo}
                          onValueChange={(tipo) =>
                            setPersonDraft({ ...personDraft, tipo: tipo as Person["tipo"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Colaborador terceirizado">
                              Colaborador terceirizado
                            </SelectItem>
                            <SelectItem value="Pessoa externa">Pessoa externa</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={addPerson}>
                          <Plus /> Vincular
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          ref={photoInput}
                          onChange={(e) => void uploadPersonPhoto(e.target.files?.[0])}
                          type="file"
                          accept="image/*"
                          className="hidden"
                        />
                        <span className="text-xs text-muted-foreground self-center">
                          Use o ícone de imagem em cada pessoa; clique na foto para ampliá-la.
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Arquivos e evidências</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <input
                        ref={evidenceInput}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => void uploadEvidence(e.target.files)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => evidenceInput.current?.click()}
                      >
                        <FolderOpen /> Anexar arquivo
                      </Button>
                      {selectedItem.evidencias.map((file) => (
                        <div
                          key={file.id}
                          className="flex w-full items-center justify-between gap-2 rounded border p-2 text-left text-sm"
                        >
                          <span>{file.nome}</span>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                file.imagem || file.tipo.toLowerCase().includes("pdf")
                                  ? "Visualizar"
                                  : "Baixar"
                              }
                              onClick={() => void openFile(file)}
                            >
                              <Eye />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              title="Excluir arquivo"
                              onClick={() => void deleteEvidence(file)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Histórico</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedItem.historico
                        .slice()
                        .reverse()
                        .map((entry) => (
                          <p className="text-xs py-1" key={`${entry.data}${entry.texto}`}>
                            <span className="text-muted-foreground">
                              {new Date(entry.data).toLocaleString("pt-BR")}
                            </span>{" "}
                            — {entry.texto}
                          </p>
                        ))}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!personEditing} onOpenChange={(open) => !open && setPersonEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar pessoa vinculada</DialogTitle>
          </DialogHeader>
          {personEditing && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={personEditing.nome}
                  onChange={(e) => setPersonEditing({ ...personEditing, nome: e.target.value })}
                />
              </div>
              <div>
                <Label>Tipo de vínculo</Label>
                <Select
                  value={personEditing.tipo}
                  onValueChange={(tipo) =>
                    setPersonEditing({ ...personEditing, tipo: tipo as Person["tipo"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colaborador terceirizado">
                      Colaborador terceirizado
                    </SelectItem>
                    <SelectItem value="Pessoa externa">Pessoa externa</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea
                  value={personEditing.observacao ?? ""}
                  onChange={(e) =>
                    setPersonEditing({ ...personEditing, observacao: e.target.value })
                  }
                  placeholder="Informação objetiva relacionada à ocorrência."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPersonEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => void savePersonEdit()}>Salvar alterações</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!viewer}
        onOpenChange={(open) => {
          if (!open) {
            if (viewer?.temporary) URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }
        }}
      >
        <DialogContent className={viewer?.kind === "pdf" ? "max-w-5xl" : "max-w-3xl"}>
          <DialogHeader>
            <DialogTitle>{viewer?.title}</DialogTitle>
          </DialogHeader>
          {viewer?.kind === "image" ? (
            <img
              src={viewer.url}
              alt={viewer.title}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            viewer && (
              <iframe
                src={viewer.url}
                title={viewer.title}
                className="h-[70vh] w-full rounded border bg-white"
              />
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar ocorrência em PDF</DialogTitle>
          </DialogHeader>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePersonPhotos}
              onChange={(e) => setIncludePersonPhotos(e.target.checked)}
            />{" "}
            Incluir fotos das pessoas
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeEvidencePhotos}
              onChange={(e) => setIncludeEvidencePhotos(e.target.checked)}
            />{" "}
            Incluir imagens de evidências
          </label>
          <p className="text-xs text-muted-foreground">
            Arquivos não visuais serão listados no relatório; fotos e imagens podem aumentar o
            tamanho do PDF.
          </p>
          <Button onClick={() => void exportSelected()}>Gerar PDF</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha da área</DialogTitle>
          </DialogHeader>
          <RecoveryFields
            password={password}
            confirmation={confirmation}
            recoveryWord={recoveryWord}
            setPassword={setPassword}
            setConfirmation={setConfirmation}
            setRecoveryWord={setRecoveryWord}
          />
          <p className="text-xs text-muted-foreground">
            A palavra de recuperação confirma sua identidade. A nova senha não altera nem remove os
            registros, fotos ou evidências.
          </p>
          <Button onClick={() => void resetPassword()}>Salvar nova senha</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccessCard({
  initial,
  forgot,
  password,
  confirmation,
  recoveryWord,
  recoveryConfirmation,
  setPassword,
  setConfirmation,
  setRecoveryWord,
  setRecoveryConfirmation,
  onSubmit,
  onForgot,
  onReset,
}: {
  initial: boolean;
  forgot: boolean;
  password: string;
  confirmation: string;
  recoveryWord: string;
  recoveryConfirmation: string;
  setPassword: (v: string) => void;
  setConfirmation: (v: string) => void;
  setRecoveryWord: (v: string) => void;
  setRecoveryConfirmation: (v: string) => void;
  onSubmit: () => void;
  onForgot: () => void;
  onReset: () => void;
}) {
  const recoveryMode = !initial && forgot;
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2">
            <LockKeyhole />{" "}
            {initial
              ? "Proteger Ocorrências e Apurações"
              : recoveryMode
                ? "Redefinir senha"
                : "Desbloquear Ocorrências e Apurações"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {initial
              ? "Defina uma senha exclusiva e uma palavra de recuperação. Registros, fotos e evidências serão cifrados antes de serem gravados no computador."
              : recoveryMode
                ? "Informe sua palavra de recuperação e escolha uma nova senha. Os dados protegidos serão preservados."
                : "Informe a senha exclusiva desta área. Os demais módulos do SPGuard continuam sem login."}
          </p>
          {recoveryMode ? (
            <RecoveryFields
              password={password}
              confirmation={confirmation}
              recoveryWord={recoveryWord}
              setPassword={setPassword}
              setConfirmation={setConfirmation}
              setRecoveryWord={setRecoveryWord}
            />
          ) : (
            <>
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                autoFocus
              />
              {initial && (
                <>
                  <Label>Confirmar senha</Label>
                  <Input
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <Label>Palavra de recuperação</Label>
                  <Input
                    type="password"
                    value={recoveryWord}
                    onChange={(e) => setRecoveryWord(e.target.value)}
                  />
                  <Label>Confirmar palavra de recuperação</Label>
                  <Input
                    type="password"
                    value={recoveryConfirmation}
                    onChange={(e) => setRecoveryConfirmation(e.target.value)}
                  />
                </>
              )}
            </>
          )}
          <Button className="w-full" onClick={recoveryMode ? onReset : onSubmit}>
            <KeyRound />{" "}
            {initial ? "Criar proteção" : recoveryMode ? "Redefinir senha" : "Desbloquear"}
          </Button>
          {!initial && (
            <Button variant="link" className="w-full" onClick={onForgot}>
              {recoveryMode ? "Voltar para senha" : "Esqueci minha senha"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Senha: mínimo de 12 caracteres. Palavra de recuperação: de 7 a 16 caracteres. Guarde-as
            separadamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
function RecoveryFields({
  password,
  confirmation,
  recoveryWord,
  setPassword,
  setConfirmation,
  setRecoveryWord,
}: {
  password: string;
  confirmation: string;
  recoveryWord: string;
  setPassword: (v: string) => void;
  setConfirmation: (v: string) => void;
  setRecoveryWord: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Palavra de recuperação</Label>
        <Input
          type="password"
          value={recoveryWord}
          onChange={(e) => setRecoveryWord(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <Label>Nova senha</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <Label>Confirmar nova senha</Label>
        <Input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </div>
    </div>
  );
}
function RecoveryEnrollment({
  recoveryWord,
  confirmation,
  setRecoveryWord,
  setConfirmation,
  onSave,
}: {
  recoveryWord: string;
  confirmation: string;
  setRecoveryWord: (v: string) => void;
  setConfirmation: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2">
            <KeyRound /> Ativar recuperação de senha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Esta versão passou a permitir redefinir a senha sem perder as ocorrências. Crie uma
            palavra de recuperação entre 7 e 16 caracteres para finalizar a proteção.
          </p>
          <Label>Palavra de recuperação</Label>
          <Input
            type="password"
            value={recoveryWord}
            onChange={(e) => setRecoveryWord(e.target.value)}
            autoFocus
          />
          <Label>Confirmar palavra de recuperação</Label>
          <Input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button className="w-full" onClick={onSave}>
            Ativar recuperação
          </Button>
          <p className="text-xs text-muted-foreground">
            Guarde essa palavra separadamente da senha. Ela não é armazenada em texto pelo SPGuard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({ title, total }: { title: string; total: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{total}</p>
      </CardContent>
    </Card>
  );
}
function StatusBadge({ status }: { status: Occurrence["status"] }) {
  const styles: Record<Occurrence["status"], string> = {
    "Em análise": "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    Encaminhada: "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300",
    Encerrada: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    Arquivada: "border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };
  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  );
}
function Info({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={block ? "rounded border p-3" : ""}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{value || "-"}</p>
    </div>
  );
}
function OccurrenceForm({
  value,
  onChange,
}: {
  value: Occurrence;
  onChange: (next: Occurrence) => void;
}) {
  const set = (field: keyof Occurrence, val: string) => onChange({ ...value, [field]: val });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <Label>Protocolo</Label>
        <Input value={value.protocolo} onChange={(e) => set("protocolo", e.target.value)} />
      </div>
      <div>
        <Label>Data</Label>
        <Input type="date" value={value.data} onChange={(e) => set("data", e.target.value)} />
      </div>
      <div>
        <Label>Local</Label>
        <Input value={value.local} onChange={(e) => set("local", e.target.value)} />
      </div>
      <div>
        <Label>Categoria</Label>
        <Input
          list="categorias-ocorrencia"
          value={value.categoria}
          onChange={(e) => set("categoria", e.target.value)}
        />
        <datalist id="categorias-ocorrencia">
          {categories.map((c) => (
            <option value={c} key={c} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>Área</Label>
        <Input
          value={value.area ?? ""}
          onChange={(e) => set("area", e.target.value)}
          placeholder="Ex.: Portaria, mina, alojamento"
        />
      </div>
      <div>
        <Label>Setor</Label>
        <Input
          value={value.setor_local ?? ""}
          onChange={(e) => set("setor_local", e.target.value)}
          placeholder="Setor ou frente de trabalho"
        />
      </div>
      <div>
        <Label>Ponto de referência</Label>
        <Input
          value={value.ponto_referencia ?? ""}
          onChange={(e) => set("ponto_referencia", e.target.value)}
          placeholder="Ex.: próximo ao portão 2"
        />
      </div>
      <div>
        <Label>Coordenadas (opcional)</Label>
        <Input
          value={value.coordenadas ?? ""}
          onChange={(e) => set("coordenadas", e.target.value)}
          placeholder="Ex.: -18.12345, -43.12345"
        />
      </div>
      <div className="md:col-span-2">
        <Label>Relato factual</Label>
        <Textarea
          value={value.relato}
          onChange={(e) => set("relato", e.target.value)}
          placeholder="Descreva somente os fatos observados: o que ocorreu, quem comunicou, data, horário, local e circunstâncias. Evite conclusões ou acusações sem comprovação."
        />
      </div>
      <div className="md:col-span-2">
        <Label>Ações e encaminhamentos</Label>
        <Textarea
          value={value.encaminhamentos}
          onChange={(e) => set("encaminhamentos", e.target.value)}
          placeholder="Registre as providências adotadas, responsáveis, comunicações realizadas, documentos consultados e os próximos passos necessários."
        />
      </div>
    </div>
  );
}
async function blobToJpeg(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const max = 1400;
    const scale = Math.min(1, max / image.width, max / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
