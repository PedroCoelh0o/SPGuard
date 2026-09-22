import { useEffect, useState } from "react";
import { Code2, HardDrive, Info, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AppInfo = {
  productName: string;
  version: string;
  author: string;
  appId: string;
  copyright: string;
};

const FALLBACK_INFO: AppInfo = {
  productName: "SPGuard",
  version: "1.8.11",
  author: "Pedro Coelho",
  appId: "com.spguard.app",
  copyright: "Copyright © 2026 Pedro Coelho. Todos os direitos reservados.",
};

export function SobreSPGuardDialog() {
  const [open, setOpen] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_INFO);

  useEffect(() => {
    if (!open) return;
    window.spguardRuntime?.getAppInfo?.().then(setAppInfo).catch(() => undefined);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Sobre o SPGuard" title="Sobre o SPGuard">
          <Info className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center">
          <img src="/spguard-shield.png" alt="Escudo SPGuard" className="h-20 w-20 object-contain" />
          <DialogTitle className="pt-2 text-xl">{appInfo.productName}</DialogTitle>
          <DialogDescription>Sistema de Gestão da Segurança Patrimonial</DialogDescription>
          <Badge className="mt-1">Versão {appInfo.version}</Badge>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Criado por</div>
            <div className="mt-0.5 font-semibold">{appInfo.author}</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 font-medium"><Code2 className="h-4 w-4 text-primary" /> Tecnologias</div>
              <p className="mt-1 text-xs text-muted-foreground">Electron, React, TypeScript e SQLite.</p>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 font-medium"><HardDrive className="h-4 w-4 text-primary" /> Dados locais</div>
              <p className="mt-1 text-xs text-muted-foreground">Funciona offline e mantém os dados no computador.</p>
            </div>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" /> Proteção</div>
            <p className="mt-1 text-xs text-muted-foreground">Backups locais, lixeira de segurança e proteção criptografada para dados sensíveis.</p>
          </div>
          <p className="break-all text-center text-xs text-muted-foreground">Identificador do aplicativo: {appInfo.appId}</p>
        </div>

        <DialogFooter className="sm:justify-center">
          <div className="w-full text-center text-xs text-muted-foreground">{appInfo.copyright}</div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
