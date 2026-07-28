import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileDown, FileText, FileSpreadsheet, Copy } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportColaboradoresCSV, exportColaboradoresPDF, exportColaboradoresXLSX } from "@/lib/export-colaboradores";
import { toast } from "sonner";
import { useState as useLocalState } from "react";
import { useDebounced, useInfiniteSlice } from "@/hooks/useListPerf";

export const Route = createFileRoute("/_authenticated/consulta")({
  head: () => ({
    meta: [
      { title: "Consulta — SPGuard" },
      { name: "description", content: "Pesquisa instantânea e filtros avançados de colaboradores no SPGuard, com estatísticas de eletrônicos por empresa e exportação em CSV, PDF e XLSX." },
      { property: "og:title", content: "Consulta — SPGuard" },
      { property: "og:description", content: "Pesquise colaboradores com filtros avançados e exporte relatórios." },
      { property: "og:url", content: "https://spguardian.lovable.app/consulta" },
    ],
    links: [{ rel: "canonical", href: "https://spguardian.lovable.app/consulta" }],
  }),
  component: Consulta,
});

function Consulta() {
  const [q, setQ] = useState("");
  const [fEmpresa, setFEmpresa] = useState("all");
  const [fCargo, setFCargo] = useState("");
  const [fCidade, setFCidade] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [admDe, setAdmDe] = useState("");
  const [admAte, setAdmAte] = useState("");
  const [desDe, setDesDe] = useState("");
  const [desAte, setDesAte] = useState("");

  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, razao_social, nome_fantasia").order("razao_social");
      return (data ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[];
    },
  });

  const { data: colabs = [], isLoading } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: async () => {
      const { data } = await supabase.from("colaboradores").select("*").order("nome").limit(2000);
      return (data ?? []) as Array<{
        id: string; nome: string; empresa_id: string; cargo: string | null; setor: string | null; matricula: string | null;
        cpf: string | null; cidade: string | null; status: string;
        data_admissao: string | null; data_desligamento: string | null;
      }>;
    },
  });

  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome_fantasia || e.razao_social])), [empresas]);
  const empresaLabel = (id: string) => empresaMap.get(id) ?? "-";

  const qd = useDebounced(q, 250);

  const filtered = useMemo(() => {
    const s = qd.trim().toLowerCase();
    return colabs.filter((c) => {
      if (s && !(c.nome.toLowerCase().includes(s) || (c.cpf ?? "").includes(s) || (c.matricula ?? "").toLowerCase().includes(s) || (c.cargo ?? "").toLowerCase().includes(s) || (c.cidade ?? "").toLowerCase().includes(s) || (empresaMap.get(c.empresa_id) ?? "").toLowerCase().includes(s))) return false;
      if (fEmpresa !== "all" && c.empresa_id !== fEmpresa) return false;
      if (fCargo && !(c.cargo ?? "").toLowerCase().includes(fCargo.toLowerCase())) return false;
      if (fCidade && !(c.cidade ?? "").toLowerCase().includes(fCidade.toLowerCase())) return false;
      if (fStatus !== "all" && c.status !== fStatus) return false;
      if (admDe && (!c.data_admissao || c.data_admissao < admDe)) return false;
      if (admAte && (!c.data_admissao || c.data_admissao > admAte)) return false;
      if (desDe && (!c.data_desligamento || c.data_desligamento < desDe)) return false;
      if (desAte && (!c.data_desligamento || c.data_desligamento > desAte)) return false;
      return true;
    });
  }, [colabs, empresaMap, qd, fEmpresa, fCargo, fCidade, fStatus, admDe, admAte, desDe, desAte]);

  const { visible, hasMore, loadMore, sentinelRef, shown, total } = useInfiniteSlice(filtered, 50);


  const [exporting, setExporting] = useLocalState<"csv" | "pdf" | "xlsx" | null>(null);
  const currentFilters = {
    Busca: q, Empresa: fEmpresa !== "all" ? (empresas.find(e => e.id === fEmpresa)?.nome_fantasia || empresas.find(e => e.id === fEmpresa)?.razao_social) : "all",
    Cargo: fCargo, Cidade: fCidade, Situação: fStatus,
    "Admitidos de": admDe, "Admitidos até": admAte, "Desligados de": desDe, "Desligados até": desAte,
  };
  async function doExport(kind: "csv" | "pdf" | "xlsx") {
    if (filtered.length === 0) { toast.error("Nenhum registro para exportar"); return; }
    setExporting(kind);
    try {
      const fn = kind === "csv" ? exportColaboradoresCSV : kind === "pdf" ? exportColaboradoresPDF : exportColaboradoresXLSX;
      await fn(filtered, empresas, currentFilters);
      toast.success(`Exportação ${kind.toUpperCase()} concluída`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setExporting(null); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Consulta de Colaboradores</h1>
          <p className="text-sm text-muted-foreground">Pesquisa rápida com filtros avançados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport("csv")} disabled={!!exporting}>
            <FileDown className="h-4 w-4" /> {exporting === "csv" ? "Gerando..." : "CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExport("xlsx")} disabled={!!exporting}>
            <FileSpreadsheet className="h-4 w-4" /> {exporting === "xlsx" ? "Gerando..." : "XLSX"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExport("pdf")} disabled={!!exporting}>
            <FileText className="h-4 w-4" /> {exporting === "pdf" ? "Gerando..." : "PDF"}
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar por nome, CPF, matrícula, empresa, cargo ou cidade..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div><Label className="text-xs">Empresa</Label>
              <Select value={fEmpresa} onValueChange={setFEmpresa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Cargo</Label><Input value={fCargo} onChange={(e) => setFCargo(e.target.value)} /></div>
            <div><Label className="text-xs">Cidade</Label><Input value={fCidade} onChange={(e) => setFCidade(e.target.value)} /></div>
            <div><Label className="text-xs">Situação</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="desligado">Desligado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Admitidos de</Label><Input type="date" value={admDe} onChange={(e) => setAdmDe(e.target.value)} /></div>
            <div><Label className="text-xs">Admitidos até</Label><Input type="date" value={admAte} onChange={(e) => setAdmAte(e.target.value)} /></div>
            <div><Label className="text-xs">Desligados de</Label><Input type="date" value={desDe} onChange={(e) => setDesDe(e.target.value)} /></div>
            <div><Label className="text-xs">Desligados até</Label><Input type="date" value={desAte} onChange={(e) => setDesAte(e.target.value)} /></div>
          </div>

          <div className="text-sm text-muted-foreground">
            {isLoading ? "Carregando..." : `${total} colaborador(es) encontrado(s) — exibindo ${shown}`}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Copiar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{empresaLabel(c.empresa_id)}</TableCell>
                    <TableCell>{c.cargo ?? "-"}</TableCell>
                    <TableCell>{c.matricula ?? "-"}</TableCell>
                    <TableCell>{c.cpf ?? "-"}</TableCell>
                    <TableCell>{c.cidade ?? "-"}</TableCell>
                    <TableCell>{formatDate(c.data_admissao)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ativo" ? "default" : "destructive"}>
                        {c.status === "ativo" ? "Ativo" : "Desligado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" aria-label={`Copiar dados de ${c.nome}`} title="Copiar" onClick={async () => {
                        const text = `${c.nome}, Matr ${c.matricula ?? "-"}, ${c.cargo ?? "-"}`;
                        try { await navigator.clipboard.writeText(text); toast.success("Copiado: " + text); }
                        catch { toast.error("Falha ao copiar"); }
                      }}><Copy className="h-4 w-4" /></Button>
                    </TableCell>
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
