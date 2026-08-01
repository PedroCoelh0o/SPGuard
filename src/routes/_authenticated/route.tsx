import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { maybeAutoSync } from "@/lib/entrada-sync";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { ConfiguracoesDialog } from "@/components/ConfiguracoesDialog";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const o = await maybeAutoSync();
      if (cancelled || !o.ran) return;
      if (!o.ok) {
        toast.error("Falha na leitura automática da planilha", { description: o.mensagem, duration: 10000 });
        return;
      }
      const r = o.result;
      qc.invalidateQueries();
      if (r.colaboradores || r.eletronicos) {
        toast.success(`Planilha sincronizada: ${r.colaboradores} colaborador(es), ${r.eletronicos} eletrônico(s)`);
      }
      if (r.erros.length) {
        toast.warning(`${r.erros.length} inconsistência(s) na planilha`, {
          description: r.erros.slice(0, 3).join(" | "),
          duration: 12000,
        });
      }
    };
    run();
    const id = setInterval(run, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [qc]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between gap-2 border-b bg-card px-4 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="text-sm font-medium">SPGuard — Sistema de Gestão da Segurança Patrimonial</div>
            </div>
            <div className="flex items-center gap-1">
              <ConfiguracoesDialog />
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6 bg-background">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
