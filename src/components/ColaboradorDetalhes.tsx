import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, Trash2, Camera, FileText, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { EletronicosTab } from "@/components/EletronicosTab";

type Colab = {
  id: string; empresa_id: string; nome: string; cpf: string | null; rg: string | null; matricula: string | null;
  cargo: string | null; setor: string | null; escolaridade: string | null; data_nascimento: string | null; sexo: string | null;
  turno?: string | null;
  data_admissao: string | null; data_desligamento: string | null; motivo_desligamento: string | null; status: string;
  telefone: string | null; celular: string | null; email: string | null;
  cep: string | null; rua: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null;
  foto_url: string | null;
};

type Doc = {
  id: string; colaborador_id: string; nome: string; tipo: string | null;
  storage_path: string; tamanho: number | null; created_at: string;
};

const BUCKET_FOTOS = "colaborador-fotos";
const BUCKET_DOCS = "colaborador-documentos";

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sexoLabel(s: string | null) {
  if (s === "M") return "Masculino";
  if (s === "F") return "Feminino";
  if (s === "O") return "Outro";
  return "-";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "-"}</dd>
    </div>
  );
}

export function ColaboradorDetalhes({ colab, empresaLabel, open, onOpenChange }: {
  colab: Colab | null; empresaLabel?: string; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [preview, setPreview] = useState<{ url: string; doc: Doc } | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery({
    enabled: !!colab && open,
    queryKey: ["docs", colab?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaborador_documentos")
        .select("*")
        .eq("colaborador_id", colab!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      setFotoUrl(null);
      if (!colab?.foto_url) return;
      const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(colab.foto_url, 3600);
      if (alive) setFotoUrl(data?.signedUrl ?? null);
    }
    load();
    return () => { alive = false; };
  }, [colab?.foto_url]);

  if (!colab) return null;

  async function uploadFoto(file: File) {
    if (!colab) return;
    setUploadingFoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${colab.id}/foto-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      if (colab.foto_url && colab.foto_url !== path) {
        await supabase.storage.from(BUCKET_FOTOS).remove([colab.foto_url]);
      }
      const { error: upErr } = await supabase.from("colaboradores").update({ foto_url: path }).eq("id", colab.id);
      if (upErr) throw upErr;
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(path, 3600);
      setFotoUrl(data?.signedUrl ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingFoto(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  }

  async function uploadDoc(file: File) {
    if (!colab) return;
    setUploadingDoc(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${colab.id}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from(BUCKET_DOCS).upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { error: insErr } = await supabase.from("colaborador_documentos").insert({
        colaborador_id: colab.id,
        nome: file.name,
        tipo: file.type || null,
        storage_path: path,
        tamanho: file.size,
        uploaded_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      toast.success("Documento enviado");
      qc.invalidateQueries({ queryKey: ["docs", colab.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingDoc(false);
      if (docRef.current) docRef.current.value = "";
    }
  }

  async function downloadDoc(d: Doc) {
    const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(d.storage_path, 60, { download: d.nome });
    if (error || !data) { toast.error(error?.message ?? "Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function viewDoc(d: Doc) {
    const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(d.storage_path, 300);
    if (error || !data) { toast.error(error?.message ?? "Erro ao gerar link"); return; }
    setPreview({ url: data.signedUrl, doc: d });
  }

  async function deleteDoc(d: Doc) {
    if (!confirm(`Excluir "${d.nome}"?`)) return;
    const { error: sErr } = await supabase.storage.from(BUCKET_DOCS).remove([d.storage_path]);
    if (sErr) { toast.error(sErr.message); return; }
    const { error } = await supabase.from("colaborador_documentos").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Documento excluído");
    qc.invalidateQueries({ queryKey: ["docs", colab!.id] });
  }

  const initials = colab.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const endereco = [colab.rua, colab.numero].filter(Boolean).join(", ");
  const cidadeUf = [colab.cidade, colab.estado].filter(Boolean).join(" - ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha do colaborador</DialogTitle>
          <DialogDescription>Dados completos, documentos e foto</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-32 w-32">
              {fotoUrl ? <AvatarImage src={fotoUrl} alt={colab.nome} /> : null}
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            {canWrite && (
              <>
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFoto(f); }}
                />
                <Button size="sm" variant="outline" onClick={() => fotoRef.current?.click()} disabled={uploadingFoto}>
                  {uploadingFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {colab.foto_url ? "Trocar foto" : "Enviar foto"}
                </Button>
              </>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <h3 className="text-xl font-semibold">{colab.nome}</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant={colab.status === "ativo" ? "default" : "destructive"}>
                {colab.status === "ativo" ? "Ativo" : "Desligado"}
              </Badge>
              {empresaLabel && <span className="text-sm text-muted-foreground">{empresaLabel}</span>}
            </div>
          </div>
        </div>

        <Tabs defaultValue="pessoal" className="mt-4">
          <TabsList>
            <TabsTrigger value="pessoal">Pessoais</TabsTrigger>
            <TabsTrigger value="trab">Trabalhistas</TabsTrigger>
            <TabsTrigger value="contato">Contato</TabsTrigger>
            <TabsTrigger value="end">Endereço</TabsTrigger>
            <TabsTrigger value="docs">Documentos</TabsTrigger>
            <TabsTrigger value="eletr">Eletrônicos</TabsTrigger>
          </TabsList>

          <TabsContent value="eletr">
            <EletronicosTab colaboradorId={colab.id} colaboradorNome={colab.nome} />
          </TabsContent>

          <TabsContent value="pessoal">
            <Card><CardContent className="p-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome" value={colab.nome} />
                <Field label="CPF" value={colab.cpf} />
                <Field label="RG" value={colab.rg} />
                <Field label="Matrícula" value={colab.matricula} />
                <Field label="Data de Nascimento" value={formatDate(colab.data_nascimento)} />
                <Field label="Sexo" value={sexoLabel(colab.sexo)} />
                <Field label="Escolaridade" value={colab.escolaridade} />
              </dl>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="trab">
            <Card><CardContent className="p-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Empresa" value={empresaLabel || "-"} />
                <Field label="Cargo" value={colab.cargo} />
                <Field label="Setor" value={colab.setor} />
                <Field label="Data de Admissão" value={formatDate(colab.data_admissao)} />
                <Field label="Data de Desligamento" value={formatDate(colab.data_desligamento)} />
                <Field label="Status" value={colab.status === "ativo" ? "Ativo" : "Desligado"} />
                <Field label="Motivo do Desligamento" value={colab.motivo_desligamento} />
              </dl>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="contato">
            <Card><CardContent className="p-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Telefone" value={colab.telefone} />
                <Field label="Celular" value={colab.celular} />
                <Field label="E-mail" value={colab.email} />
              </dl>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="end">
            <Card><CardContent className="p-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="CEP" value={colab.cep} />
                <Field label="Endereço" value={endereco || "-"} />
                <Field label="Bairro" value={colab.bairro} />
                <Field label="Cidade / UF" value={cidadeUf || "-"} />
              </dl>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="docs">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Documentos</h4>
                {canWrite && (
                  <>
                    <input
                      ref={docRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }}
                    />
                    <Button size="sm" onClick={() => docRef.current?.click()} disabled={uploadingDoc}>
                      {uploadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Enviar documento
                    </Button>
                  </>
                )}
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tamanho</TableHead>
                      <TableHead>Enviado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                    ) : docs.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum documento anexado.</TableCell></TableRow>
                    ) : docs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.nome}</TableCell>
                        <TableCell>{formatSize(d.tamanho)}</TableCell>
                        <TableCell>{formatDate(d.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" aria-label={`Visualizar ${d.nome}`} title="Visualizar" onClick={() => viewDoc(d)}><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label={`Baixar ${d.nome}`} title="Baixar" onClick={() => downloadDoc(d)}><Download className="h-4 w-4" /></Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" aria-label={`Excluir ${d.nome}`} title="Excluir" onClick={() => deleteDoc(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </DialogContent>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.doc.nome ?? "Documento"}</DialogTitle>
            <DialogDescription>Pré-visualização do documento</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-md border overflow-hidden bg-muted">
            {preview && (
              (preview.doc.tipo?.startsWith("image/") ? (
                <img src={preview.url} alt={preview.doc.nome} className="w-full h-full object-contain bg-black/5" />
              ) : (
                <iframe src={preview.url} title={preview.doc.nome} className="w-full h-full" />
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            {preview && (
              <Button variant="outline" onClick={() => downloadDoc(preview.doc)}>
                <Download className="h-4 w-4" /> Baixar
              </Button>
            )}
            <Button onClick={() => setPreview(null)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
