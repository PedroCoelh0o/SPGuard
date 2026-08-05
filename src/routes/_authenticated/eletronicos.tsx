import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Smartphone, Search, Eye, UserX, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDebounced, useInfiniteSlice } from "@/hooks/useListPerf";
import { ImportarEletronicos } from "@/components/ImportarEletronicos";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EletronicosTab } from "@/components/EletronicosTab";

export const Route = createFileRoute("/_authenticated/eletronicos")({
  head: () => ({
    meta: [
      { title: "Consulta de Eletrônicos — SPGuard" },
      { name: "description", content: "Consulta de colaboradores com eletrônicos autorizados (celulares, notebooks e tablets) no SPGuard, filtrada por empresa." },
      { property: "og:title", content: "Consulta de Eletrônicos — SPGuard" },
      { property: "og:description", content: "Colaboradores autorizados a portar eletrônicos, com detalhamento por tipo e total." },
      { property: "og:url", content: "https://spguardian.lovable.app/eletronicos" },
    ],
    links: [{ rel: "canonical", href: "https://spguardian.lovable.app/eletronicos" }],
  }),
  component: EletronicosPage,
});

function EletronicosPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [empresaSel, setEmpresaSel] = useState<string>("all");
  const [q, setQ] = useState("");
  const [detalhes, setDetalhes] = useState<{ id: string; nome: string } | null>(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, razao_social, nome_fantasia").order("razao_social");
      return (data ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[];
    },
  });

  const { data: colabs = [] } = useQuery({
    queryKey: ["colaboradores-eletr"],
    queryFn: async () =>
      await fetchAllRows<{ id: string; nome: string; empresa_id: string; cargo: string | null; setor: string | null; eletronicos_autorizado: boolean }>(
        () => supabase.from("colaboradores").select("id, nome, empresa_id, cargo, setor, eletronicos_autorizado").order("nome") as never,
      ),
  });

  const toggleStatus = useMutation({
    mutationFn: async (c: { id: string; autorizado: boolean }) => {
      const novo = !c.autorizado;
      const { error } = await supabase.from("colaboradores").update({ eletronicos_autorizado: novo } as never).eq("id", c.id);
      if (error) throw error;
      return novo;
    },
    onSuccess: (novo) => {
      toast.success(novo ? "Colaborador autorizado a portar eletrônicos" : "Autorização de eletrônicos removida");
      const keys = [["colaboradores-eletr"], ["colaboradores"], ["dashboard-eletronicos"], ["dashboard-eletr-autorizacao"]];
      keys.forEach((queryKey) => qc.invalidateQueries({ queryKey, refetchType: "all" }));
    },

    onError: (e: Error) => toast.error(e.message),
  });


  const { data: eletronicos = [] } = useQuery({
    queryKey: ["consulta-eletronicos"],
    queryFn: async () =>
      await fetchAllRows<{ tipo: "celular" | "notebook" | "tablet"; colaborador_id: string }>(
        () => supabase.from("eletronicos" as never).select("tipo, colaborador_id").order("created_at") as never,
      ),
  });


  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome_fantasia || e.razao_social])), [empresas]);
  const empresaLabel = (id: string) => empresaMap.get(id) ?? "-";

  const qd = useDebounced(q, 250);

  const stats = useMemo(() => {
    const counts = new Map<string, { celular: number; notebook: number; tablet: number }>();
    eletronicos.forEach((e) => {
      const cur = counts.get(e.colaborador_id) ?? { celular: 0, notebook: 0, tablet: 0 };
      cur[e.tipo] += 1;
      counts.set(e.colaborador_id, cur);
    });
    const s = qd.trim().toLowerCase();
    const scope = colabs.filter((c) => {
      if (empresaSel !== "all" && c.empresa_id !== empresaSel) return false;
      if (s && !(c.nome.toLowerCase().includes(s) || (c.setor ?? "").toLowerCase().includes(s) || (c.cargo ?? "").toLowerCase().includes(s))) return false;
      return true;
    });
    return scope
      .map((c) => {
        const cnt = counts.get(c.id) ?? { celular: 0, notebook: 0, tablet: 0 };
        const total = cnt.celular + cnt.notebook + cnt.tablet;
        return {
          id: c.id, nome: c.nome, setor: c.setor, cargo: c.cargo,
          autorizado: c.eletronicos_autorizado !== false,
          empresa: empresaMap.get(c.empresa_id) ?? "-",
          celulares: cnt.celular, notebooks: cnt.notebook, tablets: cnt.tablet, total,
        };
      })
      .filter((r) => r.total > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [eletronicos, colabs, empresaSel, empresaMap, qd]);

  const { visible, hasMore, loadMore, sentinelRef, shown, total } = useInfiniteSlice(stats, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Consulta de Eletrônicos</h1>
          <p className="text-sm text-muted-foreground">Colaboradores autorizados a portar celulares, notebooks e tablets</p>
        </div>
        {canWrite && (
          <ImportarEletronicos onDone={() => qc.invalidateQueries({ queryKey: ["consulta-eletronicos"] })} />
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Colaboradores com eletrônicos</h2>
            </div>
            <Select value={empresaSel} onValueChange={setEmpresaSel}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                 {[...empresas].sort((a, b) => (a.nome_fantasia || a.razao_social).localeCompare(b.nome_fantasia || b.razao_social, "pt-BR")).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome, setor ou função..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {empresaSel === "all"
              ? "Exibindo colaboradores com pelo menos um eletrônico autorizado (todas as empresas)."
              : `Colaboradores da empresa "${empresaLabel(empresaSel)}" e seus eletrônicos autorizados.`}
          </p>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Função</TableHead>
                  {empresaSel === "all" && <TableHead>Empresa</TableHead>}
                  <TableHead className="text-right">Celulares</TableHead>
                  <TableHead className="text-right">Notebooks</TableHead>
                  <TableHead className="text-right">Tablets</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.length === 0 ? (
                  <TableRow><TableCell colSpan={empresaSel === "all" ? 10 : 9} className="text-center text-muted-foreground py-6">Nenhum colaborador com eletrônicos.</TableCell></TableRow>
                ) : visible.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell>{s.setor ?? "-"}</TableCell>
                    <TableCell>{s.cargo ?? "-"}</TableCell>
                    {empresaSel === "all" && <TableCell>{s.empresa}</TableCell>}
                    <TableCell className="text-right">{s.celulares}</TableCell>
                    <TableCell className="text-right">{s.notebooks}</TableCell>
                    <TableCell className="text-right">{s.tablets}</TableCell>
                    <TableCell className="text-right font-semibold">{s.total}</TableCell>
                    <TableCell>
                      <Badge variant={s.autorizado ? "default" : "destructive"}>{s.autorizado ? "Autorizado" : "Não autorizado"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" aria-label={`Visualizar eletrônicos de ${s.nome}`} title="Visualizar eletrônicos" onClick={() => setDetalhes({ id: s.id, nome: s.nome })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canWrite && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={s.autorizado ? `Marcar ${s.nome} como não autorizado` : `Autorizar ${s.nome}`}
                          title={s.autorizado ? "Mudar para Não autorizado" : "Mudar para Autorizado"}
                          disabled={toggleStatus.isPending}
                          onClick={() => toggleStatus.mutate({ id: s.id, autorizado: s.autorizado })}
                        >
                          {s.autorizado ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                        </Button>
                      )}
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{`Exibindo ${shown} de ${total} colaborador(es)`}</span>
            {hasMore && <Button variant="outline" size="sm" onClick={loadMore}>Carregar mais</Button>}
          </div>
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </CardContent>
      </Card>
      <Dialog open={!!detalhes} onOpenChange={(v) => { if (!v) setDetalhes(null); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eletrônicos de {detalhes?.nome}</DialogTitle>
          </DialogHeader>
          {detalhes && <EletronicosTab colaboradorId={detalhes.id} colaboradorNome={detalhes.nome} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
