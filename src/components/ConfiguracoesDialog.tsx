import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Settings, FolderOpen, Save, RotateCcw, FileSpreadsheet, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSavedDirName, isFsSupported, pickAndSaveDir, saveBackupNow, restoreBackup } from "@/lib/local-backup";
import {
  createEntradaFile, syncFromEntrada, getLastSync, isAutoSyncEnabled, setAutoSyncEnabled, ENTRADA_FILE,
  getSyncHistory, clearSyncHistory, logSyncResult, logSyncError, type SyncLog,
} from "@/lib/entrada-sync";

const STATUS_LABEL: Record<SyncLog["status"], string> = { ok: "Sucesso", parcial: "Com inconsistências", erro: "Falha" };
const STATUS_CLASS: Record<SyncLog["status"], string> = {
  ok: "text-primary",
  parcial: "text-amber-600 dark:text-amber-400",
  erro: "text-destructive",
};

export function ConfiguracoesDialog() {
  const [open, setOpen] = useState(false);
  const [dirName, setDirName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [auto, setAuto] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [history, setHistory] = useState<SyncLog[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const supported = isFsSupported();

  useEffect(() => {
    if (!open) return;
    getSavedDirName().then(setDirName);
    setAuto(isAutoSyncEnabled());
    setLastSync(getLastSync());
    setHistory(getSyncHistory());
  }, [open]);

  async function doCreateEntrada() {
    setCreating(true);
    try {
      const r = await createEntradaFile();
      toast.success(r.created ? `Planilha criada em ${r.path}` : `A planilha já existe em ${r.path}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  }

  async function doSync() {
    setSyncing(true);
    try {
      const r = await syncFromEntrada();
      logSyncResult("manual", r);
      setLastSync(getLastSync());
      toast.success(`Atualizado: ${r.colaboradores} colaborador(es) e ${r.eletronicos} eletrônico(s)`);
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
    }
    finally { setSyncing(false); setHistory(getSyncHistory()); }
  }



  async function pick() {
    try {
      const name = await pickAndSaveDir();
      setDirName(name);
      toast.success(`Pasta selecionada: ${name}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("aborted")) toast.error(msg || "Não foi possível selecionar a pasta");
    }
  }

  async function doSave() {
    setSaving(true);
    try {
      const r = await saveBackupNow();
      toast.success(`Dados salvos em ${r.path} (${r.total} registros)`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  async function doRestore(file?: File) {
    if (!confirm("Restaurar dados do backup? Registros com o mesmo ID serão sobrescritos.")) return;
    setRestoring(true);
    try {
      const r = await restoreBackup(file);
      toast.success(`Restaurado: ${r.empresas} empresas, ${r.colaboradores} colaboradores, ${r.eletronicos} eletrônicos`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { toast.error((e as Error).message); }
    finally { setRestoring(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Configurações"><Settings className="h-5 w-5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>Armazenamento local dos dados em planilha .xlsx</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!supported ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              Seu navegador não suporta acesso a pastas locais. Use um navegador baseado em Chromium (Chrome, Edge, Brave).
            </div>
          ) : (
            <>
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="text-muted-foreground text-xs mb-1">Pasta selecionada</div>
                <div className="font-mono text-sm">{dirName ? `${dirName}/SPGuard/spguard-dados.xlsx` : "Nenhuma pasta selecionada"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={pick}><FolderOpen className="h-4 w-4" /> Selecionar pasta</Button>
                <Button onClick={doSave} disabled={!dirName || saving}><Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar dados agora"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ao salvar, o app cria a pasta <strong>SPGuard</strong> dentro da pasta selecionada e grava/atualiza o arquivo <strong>spguard-dados.xlsx</strong> com abas de Empresas, Colaboradores e Eletrônicos.
              </p>
            </>
          )}

          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Restaurar dados do backup</div>
            <p className="text-xs text-muted-foreground">
              Lê o arquivo <strong>spguard-dados.xlsx</strong> e regrava Empresas, Colaboradores e Eletrônicos. Registros com o mesmo ID são sobrescritos.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {supported && (
                <Button variant="outline" onClick={() => doRestore()} disabled={!dirName || restoring}>
                  <RotateCcw className="h-4 w-4" /> {restoring ? "Restaurando..." : "Restaurar da pasta"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={restoring}>
                Escolher arquivo...
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doRestore(f); }}
              />
            </div>
          </div>

          {supported && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Planilha de entrada manual</div>
              <p className="text-xs text-muted-foreground">
                Cria <strong>{ENTRADA_FILE}</strong> na pasta <strong>SPGuard</strong> com as abas <strong>Colaboradores</strong> e <strong>Eletronicos</strong> para você preencher manualmente. O app lê esse arquivo e atualiza o sistema automaticamente a cada 5 horas.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={doCreateEntrada} disabled={!dirName || creating}>
                  <FileSpreadsheet className="h-4 w-4" /> {creating ? "Criando..." : "Criar planilha de entrada"}
                </Button>
                <Button onClick={doSync} disabled={!dirName || syncing}>
                  <RefreshCw className="h-4 w-4" /> {syncing ? "Atualizando..." : "Atualizar agora"}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-sm">
                  Atualização automática a cada 5 horas
                  <div className="text-xs text-muted-foreground">
                    {lastSync ? `Última: ${new Date(lastSync).toLocaleString("pt-BR")}` : "Ainda não sincronizado"}
                  </div>
                </div>
                <Switch
                  checked={auto}
                  onCheckedChange={(v) => { setAuto(v); setAutoSyncEnabled(v); }}
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
                  onClick={() => { clearSyncHistory(); setHistory([]); }}
                >
                  <Trash2 className="h-4 w-4" /> Limpar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Registro das últimas leituras da planilha (manuais e automáticas), com falhas e inconsistências.
            </p>
            {history.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nenhuma execução registrada ainda.</div>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="rounded border bg-muted/30 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium ${STATUS_CLASS[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                      <span className="text-muted-foreground">
                        {new Date(h.at).toLocaleString("pt-BR")} · {h.origem === "manual" ? "Manual" : "Automático"}
                      </span>
                    </div>
                    {h.status !== "erro" && (
                      <div className="text-muted-foreground">
                        {h.colaboradores} colaborador(es) · {h.eletronicos} eletrônico(s)
                      </div>
                    )}
                    {h.mensagem && <div className="text-destructive">{h.mensagem}</div>}
                    {h.erros.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                        {h.erros.slice(0, 5).map((e, j) => <li key={j}>{e}</li>)}
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
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
