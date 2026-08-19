import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Settings,
  FolderOpen,
  Save,
  RotateCcw,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getSavedDirName,
  isFsSupported,
  pickAndSaveDir,
  saveBackupNow,
  saveEncryptedFullBackup,
  saveFullBackupNow,
  restoreBackup,
  restoreEncryptedFullBackup,
  restoreFullBackup,
} from "@/lib/local-backup";
import {
  createEntradaFile,
  syncFromEntrada,
  getLastSync,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  ENTRADA_FILE,
  getSyncHistory,
  clearSyncHistory,
  logSyncResult,
  logSyncError,
  type SyncLog,
  type SyncProgress,
  type SyncResult,
  type EntidadeStat,
} from "@/lib/entrada-sync";
import {
  getNetworkConflicts,
  isNetworkAutoSyncEnabled,
  resolveNetworkConflict,
  setNetworkAutoSyncEnabled,
  syncLocalNetwork,
  type NetworkConflict,
} from "@/lib/rede-local-sync";

const STATUS_LABEL: Record<SyncLog["status"], string> = {
  ok: "Sucesso",
  parcial: "Com inconsistências",
  erro: "Falha",
};
const STATUS_CLASS: Record<SyncLog["status"], string> = {
  ok: "text-primary",
  parcial: "text-amber-600 dark:text-amber-400",
  erro: "text-destructive",
};

function StatLinha({ titulo, s }: { titulo: string; s?: EntidadeStat }) {
  if (!s) return null;
  const exemplos = [
    ...s.exemplosInseridos.map((e) => `+ ${e}`),
    ...s.exemplosAtualizados.map((e) => `~ ${e}`),
    ...s.exemplosIgnorados.map((e) => `! ${e}`),
  ].slice(0, 5);
  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-medium">{titulo}:</span>
        <Badge className="bg-emerald-600">Inseridos {s.inseridos}</Badge>
        <Badge className="bg-blue-600">Atualizados {s.atualizados}</Badge>
        {s.ignorados > 0 && <Badge variant="destructive">Ignorados {s.ignorados}</Badge>}
      </div>
      {exemplos.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-muted-foreground">
          {exemplos.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConfiguracoesDialog() {
  const [open, setOpen] = useState(false);
  const [dirName, setDirName] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFull, setSavingFull] = useState(false);
  const [savingEncrypted, setSavingEncrypted] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [encryptedAction, setEncryptedAction] = useState<"create" | "restore" | null>(null);
  const [encryptedPassword, setEncryptedPassword] = useState("");
  const [encryptedConfirmation, setEncryptedConfirmation] = useState("");
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [preview, setPreview] = useState<SyncResult | null>(null);
  const [auto, setAuto] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [history, setHistory] = useState<SyncLog[]>([]);
  const [networking, setNetworking] = useState(false);
  const [networkAuto, setNetworkAuto] = useState(false);
  const [networkConflicts, setNetworkConflicts] = useState<NetworkConflict[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const fullFileRef = useRef<HTMLInputElement>(null);
  const encryptedFileRef = useRef<HTMLInputElement>(null);
  const supported = isFsSupported();

  useEffect(() => {
    if (!open) return;
    getSavedDirName().then(setDirName);
    setAuto(isAutoSyncEnabled());
    setLastSync(getLastSync());
    setHistory(getSyncHistory());
    setNetworkAuto(isNetworkAutoSyncEnabled());
    setNetworkConflicts(getNetworkConflicts());
  }, [open]);

  async function doNetworkSync() {
    setNetworking(true);
    try {
      const result = await syncLocalNetwork();
      setNetworkConflicts(result.conflicts);
      if (result.conflicts.length) {
        toast.warning("Sincronização concluída com divergências preservadas", {
          description: "Escolha qual versão manter nos itens mostrados abaixo. Nenhuma informação foi substituída automaticamente.",
          duration: 12000,
        });
      } else {
        toast.success(result.created ? "Pasta de sincronização criada e dados enviados" : "Sincronização concluída", {
          description: `${result.sent} alteração(ões) enviada(s), ${result.received} recebida(s) e ${result.files} arquivo(s) sincronizado(s).`,
        });
      }
      if (result.warnings.length) toast.warning("Alguns registros exigem conferência", { description: result.warnings.slice(0, 2).join(" | ") });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error("Não foi possível sincronizar", { description: (e as Error).message, duration: 10000 });
    } finally { setNetworking(false); }
  }

  async function chooseConflict(conflict: NetworkConflict, choice: "local" | "network") {
    setNetworking(true);
    try {
      await resolveNetworkConflict(conflict, choice);
      setNetworkConflicts(getNetworkConflicts());
      toast.success(choice === "local" ? "Mantidos os dados deste notebook" : "Mantidos os dados da pasta compartilhada");
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setNetworking(false); }
  }

  async function doCreateEntrada() {
    setCreating(true);
    try {
      const r = await createEntradaFile();
      toast.success(
        r.created ? `Planilha criada em ${r.path}` : `A planilha já existe em ${r.path}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function doValidate() {
    setValidating(true);
    setPreview(null);
    setProgress({ fase: "lendo", atual: 0, total: 0, label: "Lendo a planilha..." });
    try {
      const r = await syncFromEntrada({ dryRun: true, onProgress: setProgress });
      setPreview(r);
      if (r.erros.length) {
        toast.warning(`${r.erros.length} inconsistência(s) encontrada(s) na validação`, {
          description: r.erros.slice(0, 3).join(" | "),
          duration: 12000,
        });
      } else {
        toast.success("Validação concluída sem inconsistências");
      }
    } catch (e) {
      const msg = (e as Error).message || "Falha ao ler a planilha de entrada";
      toast.error("Falha na validação da planilha", { description: msg, duration: 10000 });
    } finally {
      setValidating(false);
      setProgress(null);
    }
  }

  async function doSync() {
    setSyncing(true);
    setProgress({ fase: "lendo", atual: 0, total: 0, label: "Lendo a planilha..." });
    try {
      const r = await syncFromEntrada({ onProgress: setProgress });
      logSyncResult("manual", r);
      setLastSync(getLastSync());
      setPreview(null);
      toast.success(
        `Atualização concluída: ${r.detalhe.colaboradores.inseridos + r.detalhe.eletronicos.inseridos} inserido(s), ` +
          `${r.detalhe.colaboradores.atualizados + r.detalhe.eletronicos.atualizados} atualizado(s), ` +
          `${r.detalhe.colaboradores.ignorados + r.detalhe.eletronicos.ignorados} ignorado(s)`,
        { duration: 8000 },
      );
      if (r.erros.length) {
        toast.warning(`${r.erros.length} inconsistência(s) na planilha`, {
          description: r.erros.slice(0, 3).join(" | "),
          duration: 12000,
        });
      }
    } catch (e) {
      const msg = (e as Error).message || "Falha ao ler a planilha de entrada";
      logSyncError("manual", msg);
      toast.error("Falha na leitura da planilha", { description: msg, duration: 10000 });
    } finally {
      setSyncing(false);
      setProgress(null);
      setHistory(getSyncHistory());
    }
  }

  async function pick() {
    if (picking) return;
    setPicking(true);
    try {
      const name = await pickAndSaveDir();
      setDirName(name);
      toast.success(`Pasta selecionada: ${name}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/seleção de pasta cancelada|aborted/i.test(msg)) {
        toast.info("Seleção de pasta cancelada");
      } else {
        toast.error(msg || "Não foi possível selecionar a pasta");
      }
    } finally {
      setPicking(false);
    }
  }

  async function doSave() {
    setSaving(true);
    try {
      const r = await saveBackupNow();
      toast.success(`Dados salvos em ${r.path} (${r.total} registros)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function doSaveFull() {
    setSavingFull(true);
    try {
      const r = await saveFullBackupNow();
      toast.success(`Backup completo salvo em ${r.path}`, {
        description: `${r.total} registros e ${r.documentos} documento(s).`,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingFull(false);
    }
  }

  function closeEncryptedDialog() {
    if (savingEncrypted || restoring) return;
    setEncryptedAction(null);
    setEncryptedPassword("");
    setEncryptedConfirmation("");
    setEncryptedFile(null);
    setRestoreConfirmed(false);
  }

  function openEncryptedCreate() {
    setEncryptedPassword("");
    setEncryptedConfirmation("");
    setEncryptedFile(null);
    setRestoreConfirmed(false);
    setEncryptedAction("create");
  }

  function openEncryptedRestore(file: File) {
    setEncryptedPassword("");
    setEncryptedConfirmation("");
    setEncryptedFile(file);
    setRestoreConfirmed(false);
    setEncryptedAction("restore");
  }

  async function doSaveEncrypted(password: string) {
    setSavingEncrypted(true);
    try {
      const r = await saveEncryptedFullBackup(password);
      toast.success(`Backup criptografado salvo em ${r.path}`, {
        description: `${r.total} registros e ${r.documentos} documento(s). A senha não foi salva no SPGuard.`,
      });
      setEncryptedAction(null);
      setEncryptedPassword("");
      setEncryptedConfirmation("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingEncrypted(false);
    }
  }

  async function doRestore(file?: File) {
    if (
      !confirm(
        "Restaurar dados do backup? O SPGuard identifica colaboradores pelo CPF para atualizar o cadastro correto e evita duplicidades.",
      )
    )
      return;
    setRestoring(true);
    try {
      const r = await restoreBackup(file);
      toast.success(
        `Restaurado: ${r.empresas} empresas, ${r.colaboradores} colaboradores, ${r.eletronicos} eletrônicos`,
        r.colaboradoresIgnorados || r.eletronicosIgnorados
          ? {
              description: `${r.colaboradoresIgnorados} colaborador(es) duplicado(s) e ${r.eletronicosIgnorados} eletrônico(s) sem vínculo válido foram ignorados.`,
            }
          : undefined,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doRestoreFull(file?: File) {
    if (!file) return;
    if (
      !confirm(
        "Restaurar o backup completo? O SPGuard identifica colaboradores pelo CPF para atualizar o cadastro correto e evita duplicidades.",
      )
    )
      return;
    setRestoring(true);
    try {
      const r = await restoreFullBackup(file);
      toast.success(
        `Restaurado: ${r.empresas} empresas, ${r.colaboradores} colaboradores e ${r.documentos} documento(s)`,
        r.documentosIgnorados
          ? {
              description: `${r.documentosIgnorados} documento(s) sem arquivo ou vínculo válido foram ignorados.`,
            }
          : undefined,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
      if (fullFileRef.current) fullFileRef.current.value = "";
    }
  }

  async function doRestoreEncrypted(file: File, password: string) {
    setRestoring(true);
    try {
      const r = await restoreEncryptedFullBackup(file, password);
      toast.success(
        `Restaurado: ${r.empresas} empresas, ${r.colaboradores} colaboradores e ${r.documentos} documento(s)`,
        r.documentosIgnorados
          ? {
              description: `${r.documentosIgnorados} documento(s) sem arquivo ou vínculo válido foram ignorados.`,
            }
          : undefined,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
      if (encryptedFileRef.current) encryptedFileRef.current.value = "";
    }
  }

  async function submitEncryptedDialog() {
    if (encryptedAction === "create") {
      if (encryptedPassword.length < 12) {
        toast.error("A senha precisa ter pelo menos 12 caracteres");
        return;
      }
      if (encryptedPassword !== encryptedConfirmation) {
        toast.error("As senhas não conferem");
        return;
      }
      await doSaveEncrypted(encryptedPassword);
      return;
    }

    if (!encryptedFile) {
      toast.error("Selecione um arquivo de backup criptografado");
      return;
    }
    if (!encryptedPassword) {
      toast.error("Digite a senha do backup");
      return;
    }
    if (!restoreConfirmed) {
      toast.error("Confirme a restauração antes de continuar");
      return;
    }
    await doRestoreEncrypted(encryptedFile, encryptedPassword);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Configurações">
            <Settings className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
            <DialogDescription>Armazenamento local dos dados em planilha .xlsx</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!supported ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Seu navegador não suporta acesso a pastas locais. Use um navegador baseado em
                Chromium (Chrome, Edge, Brave).
              </div>
            ) : (
              <>
                <div className="rounded-md border p-3 space-y-3">
                  <div className="text-sm font-medium">Dados em planilha (.xlsx)</div>
                  <p className="text-xs text-muted-foreground">
                    Salve ou restaure o arquivo <strong>spguard-dados.xlsx</strong>, com Empresas,
                    Colaboradores e Eletrônicos.
                  </p>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <div className="mb-1 text-xs text-muted-foreground">Pasta selecionada</div>
                    <div className="font-mono text-sm">
                      {dirName
                        ? `${dirName}/SPGuard/spguard-dados.xlsx`
                        : "Nenhuma pasta selecionada"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={pick} disabled={picking}>
                      <FolderOpen className="h-4 w-4" />{" "}
                      {picking ? "Abrindo..." : "Selecionar pasta"}
                    </Button>
                    <Button onClick={doSave} disabled={!dirName || saving}>
                      <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar dados agora"}
                    </Button>
                  </div>
                  <div className="border-t pt-3">
                    <div className="mb-2 text-sm font-medium">Restaurar dados da planilha</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => doRestore()}
                        disabled={!dirName || restoring}
                      >
                        <RotateCcw className="h-4 w-4" />{" "}
                        {restoring ? "Restaurando..." : "Restaurar da pasta"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => fileRef.current?.click()}
                        disabled={restoring}
                      >
                        Escolher arquivo...
                      </Button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) doRestore(f);
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao salvar, o app cria a pasta <strong>SPGuard</strong> dentro da pasta
                    selecionada. Ao restaurar, registros com o mesmo ID são atualizados pelo
                    conteúdo da planilha.
                  </p>
                </div>

                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Sincronização local entre notebooks</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Usa a pasta compartilhada selecionada para unir os dados, documentos, fotos e evidências quando o notebook estiver na rede da empresa. Não utiliza internet.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={networkAuto}
                        onCheckedChange={(checked) => { setNetworkAuto(checked); setNetworkAutoSyncEnabled(checked); }}
                        disabled={!dirName || networking}
                      />
                      Atualizar ao abrir
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={doNetworkSync} disabled={!dirName || networking || saving || restoring}>
                      <RefreshCw className={`h-4 w-4 ${networking ? "animate-spin" : ""}`} />
                      {networking ? "Sincronizando..." : "Sincronizar agora"}
                    </Button>
                    <span className="text-xs text-muted-foreground">Todos os notebooks devem selecionar a mesma pasta da Segurança.</span>
                  </div>
                  {networkConflicts.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
                      <div className="font-medium text-amber-700 dark:text-amber-300">Divergências aguardando decisão ({networkConflicts.length})</div>
                      <p>As duas versões foram preservadas. Escolha a que deverá ser distribuída aos demais notebooks.</p>
                      <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                        {networkConflicts.map((conflict) => (
                          <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-500/30 p-2">
                            <span><strong>{conflict.table.replaceAll("_", " ")}</strong> — registro {conflict.recordId.slice(0, 8)}</span>
                            <span className="flex gap-1">
                              <Button size="sm" variant="outline" disabled={networking} onClick={() => chooseConflict(conflict, "local")}>Manter deste notebook</Button>
                              <Button size="sm" variant="secondary" disabled={networking} onClick={() => chooseConflict(conflict, "network")}>Manter da rede</Button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {supported && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Backup completo com documentos</div>
                <p className="text-xs text-muted-foreground">
                  Cria <strong>spguard-backup-completo.zip</strong> com os dados, observações e
                  todos os documentos anexados às fichas. O arquivo é criado somente na pasta
                  selecionada.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={doSaveFull}
                    disabled={!dirName || savingFull || saving || savingEncrypted}
                  >
                    <Save className="h-4 w-4" />{" "}
                    {savingFull ? "Preparando documentos..." : "Criar backup completo (.zip)"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => fullFileRef.current?.click()}
                    disabled={restoring || savingFull || savingEncrypted}
                  >
                    <RotateCcw className="h-4 w-4" /> Restaurar backup completo
                  </Button>
                  <input
                    ref={fullFileRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) doRestoreFull(f);
                    }}
                  />
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  Este ZIP não possui senha. Para proteger o conteúdo, utilize a opção criptografada
                  abaixo.
                </p>
              </div>
            )}

            {supported && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-sm font-medium">Backup criptografado com senha</div>
                <p className="text-xs text-muted-foreground">
                  Cria <strong>spguard-backup-criptografado.spguard</strong> com dados e documentos
                  protegidos. Sem a senha, o arquivo não pode ser aberto ou restaurado.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={openEncryptedCreate}
                    disabled={!dirName || savingEncrypted || savingFull || saving}
                  >
                    <Save className="h-4 w-4" />{" "}
                    {savingEncrypted ? "Criptografando..." : "Criar backup com senha"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => encryptedFileRef.current?.click()}
                    disabled={restoring || savingEncrypted || savingFull}
                  >
                    <RotateCcw className="h-4 w-4" /> Restaurar backup com senha
                  </Button>
                  <input
                    ref={encryptedFileRef}
                    type="file"
                    accept=".spguard,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) openEncryptedRestore(f);
                    }}
                  />
                </div>
                <p className="text-xs text-destructive">
                  A senha não é armazenada pelo SPGuard. Se for esquecida, não será possível
                  restaurar este backup.
                </p>
              </div>
            )}

            {supported && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Planilha de entrada manual</div>
                <p className="text-xs text-muted-foreground">
                  Cria <strong>{ENTRADA_FILE}</strong> na pasta <strong>SPGuard</strong> com as abas{" "}
                  <strong>Colaboradores</strong> e <strong>Eletronicos</strong> para você preencher
                  manualmente. O app lê esse arquivo e atualiza o sistema automaticamente a cada 1
                  hora.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={doCreateEntrada}
                    disabled={!dirName || creating}
                  >
                    <FileSpreadsheet className="h-4 w-4" />{" "}
                    {creating ? "Criando..." : "Criar planilha de entrada"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={doValidate}
                    disabled={!dirName || validating || syncing}
                  >
                    <CheckCircle2 className="h-4 w-4" />{" "}
                    {validating ? "Validando..." : "Validar planilha"}
                  </Button>
                  <Button onClick={doSync} disabled={!dirName || syncing || validating}>
                    <RefreshCw className="h-4 w-4" />{" "}
                    {syncing
                      ? "Atualizando..."
                      : preview
                        ? "Confirmar atualização"
                        : "Atualizar agora"}
                  </Button>
                </div>

                {progress && (
                  <div className="space-y-1">
                    <Progress
                      value={
                        progress.total ? Math.round((progress.atual / progress.total) * 100) : 5
                      }
                    />
                    <p className="text-xs text-muted-foreground">{progress.label}</p>
                  </div>
                )}

                {preview && (
                  <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                    <div className="flex items-center gap-1 font-medium">
                      {preview.erros.length ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                      Prévia da atualização (nada foi gravado ainda)
                    </div>
                    <StatLinha titulo="Colaboradores" s={preview.detalhe.colaboradores} />
                    <StatLinha titulo="Eletrônicos" s={preview.detalhe.eletronicos} />
                    {preview.erros.length > 0 && (
                      <div>
                        <div className="mt-1 font-medium text-destructive">
                          Inconsistências ({preview.erros.length})
                        </div>
                        <ul className="list-disc pl-4 text-muted-foreground">
                          {preview.erros.slice(0, 8).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                          {preview.erros.length > 8 && (
                            <li>+{preview.erros.length - 8} outra(s)</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <p className="pt-1 text-muted-foreground">
                      Revise acima e clique em <strong>Confirmar atualização</strong> para aplicar
                      no sistema. Linhas com inconsistência são ignoradas.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-sm">
                    Atualização automática a cada 1 hora
                    <div className="text-xs text-muted-foreground">
                      {lastSync
                        ? `Última: ${new Date(lastSync).toLocaleString("pt-BR")}`
                        : "Ainda não sincronizado"}
                    </div>
                  </div>
                  <Switch
                    checked={auto}
                    onCheckedChange={(v) => {
                      setAuto(v);
                      setAutoSyncEnabled(v);
                    }}
                    aria-label="Ativar atualização automática"
                  />
                </div>
              </div>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Histórico de execuções</div>
                {history.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Limpar histórico"
                    title="Limpar histórico"
                    onClick={() => {
                      clearSyncHistory();
                      setHistory([]);
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Limpar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Registro das últimas leituras da planilha (manuais e automáticas), com falhas e
                inconsistências.
              </p>
              {history.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  Nenhuma execução registrada ainda.
                </div>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {history.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="rounded border bg-muted/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-medium ${STATUS_CLASS[h.status]}`}>
                          {STATUS_LABEL[h.status]}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(h.at).toLocaleString("pt-BR")} ·{" "}
                          {h.origem === "manual" ? "Manual" : "Automático"}
                        </span>
                      </div>
                      {h.status !== "erro" && (
                        <>
                          <div className="text-muted-foreground">
                            {h.colaboradores} colaborador(es) · {h.eletronicos} eletrônico(s)
                          </div>
                          <StatLinha titulo="Colaboradores" s={h.detalhe?.colaboradores} />
                          <StatLinha titulo="Eletrônicos" s={h.detalhe?.eletronicos} />
                        </>
                      )}

                      {h.mensagem && <div className="text-destructive">{h.mensagem}</div>}
                      {h.erros.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                          {h.erros.slice(0, 5).map((e, j) => (
                            <li key={j}>{e}</li>
                          ))}
                          {h.erros.length > 5 && <li>+{h.erros.length - 5} outra(s)</li>}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={encryptedAction !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeEncryptedDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {encryptedAction === "create"
                ? "Criar backup criptografado"
                : "Restaurar backup criptografado"}
            </DialogTitle>
            <DialogDescription>
              {encryptedAction === "create"
                ? "Defina uma senha forte. Ela protege os dados e documentos do backup e não é guardada pelo SPGuard."
                : "Digite a senha usada ao criar este backup. Sem ela, o arquivo não pode ser restaurado."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {encryptedAction === "restore" && encryptedFile && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground break-all">
                Arquivo selecionado:{" "}
                <span className="font-medium text-foreground">{encryptedFile.name}</span>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="encrypted-backup-password" className="text-sm font-medium">
                {encryptedAction === "create" ? "Senha" : "Senha do backup"}
              </label>
              <Input
                id="encrypted-backup-password"
                type="password"
                autoComplete="new-password"
                value={encryptedPassword}
                onChange={(e) => setEncryptedPassword(e.target.value)}
                placeholder={
                  encryptedAction === "create" ? "Mínimo de 12 caracteres" : "Digite a senha"
                }
                disabled={savingEncrypted || restoring}
                autoFocus
              />
            </div>
            {encryptedAction === "create" && (
              <div className="space-y-2">
                <label htmlFor="encrypted-backup-confirmation" className="text-sm font-medium">
                  Confirmar senha
                </label>
                <Input
                  id="encrypted-backup-confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={encryptedConfirmation}
                  onChange={(e) => setEncryptedConfirmation(e.target.value)}
                  placeholder="Digite a senha novamente"
                  disabled={savingEncrypted}
                />
              </div>
            )}
            {encryptedAction === "restore" && (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreConfirmed}
                  onChange={(e) => setRestoreConfirmed(e.target.checked)}
                  disabled={restoring}
                  className="mt-0.5"
                />
                <span>
                  Entendo que a restauração atualiza os cadastros pelos CPFs e pode substituir
                  informações existentes.
                </span>
              </label>
            )}
            <p className="text-xs text-destructive">
              A senha não pode ser recuperada. Guarde-a em local seguro.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeEncryptedDialog}
              disabled={savingEncrypted || restoring}
            >
              Cancelar
            </Button>
            <Button onClick={submitEncryptedDialog} disabled={savingEncrypted || restoring}>
              {encryptedAction === "create"
                ? savingEncrypted
                  ? "Criptografando..."
                  : "Criar backup"
                : restoring
                  ? "Restaurando..."
                  : "Restaurar backup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
