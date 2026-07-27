import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Smartphone } from "lucide-react";

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
  const [empresaSel, setEmpresaSel] = useState<string>("all");

  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, razao_social, nome_fantasia").order("razao_social");
      return (data ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[];
    },
  });

  const { data: colabs = [] } = useQuery({
    queryKey: ["colaboradores-eletr"],
    queryFn: async () => {
      const { data } = await supabase.from("colaboradores").select("id, nome, empresa_id, cargo, setor").order("nome").limit(2000);
      return (data ?? []) as { id: string; nome: string; empresa_id: string; cargo: string | null; setor: string | null }[];
    },
  });

  const { data: eletronicos = [] } = useQuery({
    queryKey: ["consulta-eletronicos"],
    queryFn: async () => {
      const { data } = await supabase.from("eletronicos" as never).select("tipo, colaborador_id");
      return (data ?? []) as { tipo: "celular" | "notebook" | "tablet"; colaborador_id: string }[];
    },
  });

  const empresaLabel = (id: string) => {
    const e = empresas.find((x) => x.id === id);
    return e ? e.nome_fantasia || e.razao_social : "-";
  };

  const stats = useMemo(() => {
    const counts = new Map<string, { celular: number; notebook: number; tablet: number }>();
    eletronicos.forEach((e) => {
      const cur = counts.get(e.colaborador_id) ?? { celular: 0, notebook: 0, tablet: 0 };
      cur[e.tipo] += 1;
      counts.set(e.colaborador_id, cur);
    });
    const scope = empresaSel === "all" ? colabs : colabs.filter((c) => c.empresa_id === empresaSel);
    return scope
      .map((c) => {
        const cnt = counts.get(c.id) ?? { celular: 0, notebook: 0, tablet: 0 };
        const total = cnt.celular + cnt.notebook + cnt.tablet;
        return {
          id: c.id, nome: c.nome, setor: c.setor, cargo: c.cargo,
          empresa: empresaLabel(c.empresa_id),
          celulares: cnt.celular, notebooks: cnt.notebook, tablets: cnt.tablet, total,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [eletronicos, colabs, empresaSel, empresas]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Consulta de Eletrônicos</h1>
        <p className="text-sm text-muted-foreground">Colaboradores autorizados a portar celulares, notebooks e tablets</p>
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
                {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.length === 0 ? (
                  <TableRow><TableCell colSpan={empresaSel === "all" ? 8 : 7} className="text-center text-muted-foreground py-6">Nenhum colaborador com eletrônicos.</TableCell></TableRow>
                ) : stats.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell>{s.setor ?? "-"}</TableCell>
                    <TableCell>{s.cargo ?? "-"}</TableCell>
                    {empresaSel === "all" && <TableCell>{s.empresa}</TableCell>}
                    <TableCell className="text-right">{s.celulares}</TableCell>
                    <TableCell className="text-right">{s.notebooks}</TableCell>
                    <TableCell className="text-right">{s.tablets}</TableCell>
                    <TableCell className="text-right font-semibold">{s.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
