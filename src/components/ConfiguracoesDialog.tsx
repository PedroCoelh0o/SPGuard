import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, FolderOpen, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getSavedDirName, isFsSupported, pickAndSaveDir, saveBackupNow, restoreBackup } from "@/lib/local-backup";

export function ConfiguracoesDialog() {
  const [open, setOpen] = useState(false);
  const [dirName, setDirName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supported = isFsSupported();

  useEffect(() => { if (open) getSavedDirName().then(setDirName); }, [open]);

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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
