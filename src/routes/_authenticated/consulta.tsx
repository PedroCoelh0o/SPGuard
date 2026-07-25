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
import { Search, FileDown, FileText, FileSpreadsheet, Copy, Smartphone } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportColaboradoresCSV, exportColaboradoresPDF, exportColaboradoresXLSX } from "@/lib/export-colaboradores";
import { toast } from "sonner";
import { useState as useLocalState } from "react";

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
      const { data } = await supabase.from("colaboradores").select("*").order("nome");
      return (data ?? []) as Array<{
        id: string; nome: string; empresa_id: string; cargo: string | null; setor: string | null; matricula: string | null;
        cpf: string | null; cidade: string | null; status: string;
        data_admissao: string | null; data_desligamento: string | null;
      }>;
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

  const [empresaEletronicos, setEmpresaEletronicos] = useState<string>("all");
  const colabsEletronicosStats = useMemo(() => {
    const countsByColab = new Map<string, { celular: number; notebook: number; tablet: number }>();
    eletronicos.forEach((e) => {
      const cur = countsByColab.get(e.colaborador_id) ?? { celular: 0, notebook: 0, tablet: 0 };
      cur[e.tipo] += 1;
      countsByColab.set(e.colaborador_id, cur);
    });
    const scope = empresaEletronicos === "all" ? colabs : colabs.filter((c) => c.empresa_id === empresaEletronicos);
    return scope
      .map((c) => {
        const cnt = countsByColab.get(c.id) ?? { celular: 0, notebook: 0, tablet: 0 };
        const total = cnt.celular + cnt.notebook + cnt.tablet;
        return {
          id: c.id,
          nome: c.nome,
          setor: c.setor,
          cargo: c.cargo,
          empresa: empresaLabel(c.empresa_id),
          celulares: cnt.celular,
          notebooks: cnt.notebook,
          tablets: cnt.tablet,
          total,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  }, [eletronicos, colabs, empresaEletronicos, empresas]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return colabs.filter((c) => {
      if (s && !(c.nome.toLowerCase().includes(s) || (c.cpf ?? "").includes(s) || (c.matricula ?? "").toLowerCase().includes(s) || (c.cargo ?? "").toLowerCase().includes(s) || (c.cidade ?? "").toLowerCase().includes(s) || empresaLabel(c.empresa_id).toLowerCase().includes(s))) return false;
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
  }, [colabs, empresas, q, fEmpresa, fCargo, fCidade, fStatus, admDe, admAte, desDe, desAte]);

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
            {isLoading ? "Carregando..." : `${filtered.length} colaborador(es) encontrado(s)`}
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

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Eletrônicos por empresa</h2>
            </div>
            <Select value={empresaEletronicos} onValueChange={setEmpresaEletronicos}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Colaboradores c/ eletrônicos</TableHead>
                  <TableHead className="text-right">Celulares</TableHead>
                  <TableHead className="text-right">Notebooks</TableHead>
                  <TableHead className="text-right">Tablets</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eletronicosStats.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem dados.</TableCell></TableRow>
                ) : eletronicosStats.map((s) => (
                  <TableRow key={s.empresa_id}>
                    <TableCell className="font-medium">{s.empresa}</TableCell>
                    <TableCell className="text-right">{s.colaboradores_com_eletronicos}</TableCell>
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
