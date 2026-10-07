import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ComponentProps } from "react";
import { ColaboradorDetalhes } from "@/components/ColaboradorDetalhes";
import { clickableTableRow } from "@/lib/clickable-table-row";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileDown, FileText, FileSpreadsheet, Copy, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportColaboradoresCSV, exportColaboradoresPDF, exportColaboradoresXLSX } from "@/lib/export-colaboradores";
import { toast } from "sonner";
import { useDebounced, useInfiniteSlice } from "@/hooks/useListPerf";
import { useSyncedTableScroll } from "@/hooks/useSyncedTableScroll";

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

type ColaboradorFicha = NonNullable<ComponentProps<typeof ColaboradorDetalhes>["colab"]>;

function Consulta() {
  const [detalhes, setDetalhes] = useState<ColaboradorFicha | null>(null);
  const listaTabelaRef = useRef<HTMLDivElement>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);
  const barraTabelaRef = useRef<HTMLDivElement>(null);
  const trilhoTabelaRef = useRef<HTMLDivElement>(null);
  useSyncedTableScroll(listaTabelaRef, tabelaRef, barraTabelaRef, trilhoTabelaRef);
  const [q, setQ] = useState("");
  const [fEmpresa, setFEmpresa] = useState("all");
  const [fCargo, setFCargo] = useState("");
  const [fSetor, setFSetor] = useState("");
  const [fCidade, setFCidade] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fDocumento, setFDocumento] = useState("all");
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
    // A Consulta usa a lista completa para combinar filtros. Não pode dividir
    // o mesmo cache com a tela de Colaboradores, que traz páginas de 200 itens.
    queryKey: ["colaboradores-consulta"],
    queryFn: async () => {
      return await fetchAllRows<ColaboradorFicha>(() => supabase.from("colaboradores").select("*").order("nome") as never);
    },
  });

  const { data: documentos = [] } = useQuery({
    queryKey: ["documentos-colaboradores"],
    queryFn: () => fetchAllRows<{ colaborador_id: string }>(
      () => supabase.from("colaborador_documentos").select("colaborador_id") as never,
    ),
  });

  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome_fantasia || e.razao_social])), [empresas]);
  const empresaLabel = (id: string) => empresaMap.get(id) ?? "-";

  const qd = useDebounced(q, 250);
  const buscaEfetiva = q.trim() ? qd : "";
  const colaboradoresComDocumento = useMemo(() => new Set(documentos.map((documento) => documento.colaborador_id)), [documentos]);
  const cargosDisponiveis = useMemo(() => Array.from(new Set(colabs.map((colab) => colab.cargo?.trim()).filter((cargo): cargo is string => !!cargo))).sort((a, b) => a.localeCompare(b, "pt-BR")), [colabs]);
  const setoresDisponiveis = useMemo(() => Array.from(new Set(colabs.map((colab) => colab.setor?.trim()).filter((setor): setor is string => !!setor))).sort((a, b) => a.localeCompare(b, "pt-BR")), [colabs]);

  const filtered = useMemo(() => {
    const s = buscaEfetiva.trim().toLowerCase();
    return colabs.filter((c) => {
      if (s && !(c.nome.toLowerCase().includes(s) || (c.cpf ?? "").includes(s) || (c.matricula ?? "").toLowerCase().includes(s) || (c.cargo ?? "").toLowerCase().includes(s) || (c.cidade ?? "").toLowerCase().includes(s) || (empresaMap.get(c.empresa_id) ?? "").toLowerCase().includes(s))) return false;
      if (fEmpresa !== "all" && c.empresa_id !== fEmpresa) return false;
      if (fCargo && !(c.cargo ?? "").toLowerCase().includes(fCargo.toLowerCase())) return false;
      if (fSetor && (c.setor ?? "").trim() !== fSetor) return false;
      if (fCidade && !(c.cidade ?? "").toLowerCase().includes(fCidade.toLowerCase())) return false;
      if (fStatus !== "all" && c.status !== fStatus) return false;
      if (fDocumento === "com" && !colaboradoresComDocumento.has(c.id)) return false;
      if (fDocumento === "sem" && colaboradoresComDocumento.has(c.id)) return false;
      if (admDe && (!c.data_admissao || c.data_admissao < admDe)) return false;
      if (admAte && (!c.data_admissao || c.data_admissao > admAte)) return false;
      if (desDe && (!c.data_desligamento || c.data_desligamento < desDe)) return false;
      if (desAte && (!c.data_desligamento || c.data_desligamento > desAte)) return false;
      return true;
    });
  }, [colabs, empresaMap, buscaEfetiva, fEmpresa, fCargo, fSetor, fCidade, fStatus, fDocumento, colaboradoresComDocumento, admDe, admAte, desDe, desAte]);

  const { visible, hasMore, loadMore, sentinelRef, shown, total } = useInfiniteSlice(filtered, 200, {
    scrollRootRef: listaTabelaRef,
    resetKey: JSON.stringify([q, fEmpresa, fCargo, fSetor, fCidade, fStatus, fDocumento, admDe, admAte, desDe, desAte]),
    requireScrollForAutoLoad: true,
  });


  const [exporting, setExporting] = useState<"csv" | "pdf" | "xlsx" | null>(null);
  const currentFilters = {
    Busca: q, Empresa: fEmpresa !== "all" ? (empresas.find(e => e.id === fEmpresa)?.nome_fantasia || empresas.find(e => e.id === fEmpresa)?.razao_social) : "all",
    Cargo: fCargo || "all", Setor: fSetor || "all", Cidade: fCidade || "all", Situação: fStatus, Documentos: fDocumento === "all" ? "all" : fDocumento === "com" ? "Com documentos" : "Sem documentos",
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
            <div><Label className="text-xs">Função / Cargo</Label>
              <Select value={fCargo || "all"} onValueChange={(value) => setFCargo(value === "all" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{cargosDisponiveis.map((cargo) => <SelectItem key={cargo} value={cargo}>{cargo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Setor</Label>
              <Select value={fSetor || "all"} onValueChange={(value) => setFSetor(value === "all" ? "" : value)}>
                <SelectTrigger aria-label="Filtrar por setor"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem>{setoresDisponiveis.map((setor) => <SelectItem key={setor} value={setor}>{setor}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
            <div><Label className="text-xs">Documentos</Label>
              <Select value={fDocumento} onValueChange={setFDocumento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="com">Com documentos</SelectItem><SelectItem value="sem">Sem documentos</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Admitidos de</Label><Input type="date" value={admDe} onChange={(e) => setAdmDe(e.target.value)} /></div>
            <div><Label className="text-xs">Admitidos até</Label><Input type="date" value={admAte} onChange={(e) => setAdmAte(e.target.value)} /></div>
            <div><Label className="text-xs">Desligados de</Label><Input type="date" value={desDe} onChange={(e) => setDesDe(e.target.value)} /></div>
            <div><Label className="text-xs">Desligados até</Label><Input type="date" value={desAte} onChange={(e) => setDesAte(e.target.value)} /></div>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFEmpresa("all"); setFCargo(""); setFSetor(""); setFCidade(""); setFStatus("all"); setFDocumento("all"); setAdmDe(""); setAdmAte(""); setDesDe(""); setDesAte(""); }}>
              <RotateCcw className="h-4 w-4" /> Limpar filtros
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            {isLoading ? "Carregando..." : `${total} colaborador(es) encontrado(s) — exibindo ${shown}`}
          </div>

          <div ref={listaTabelaRef} className="max-h-[50vh] min-h-64 overflow-x-hidden overflow-y-auto rounded-t-md border border-b-0">
            <Table ref={tabelaRef} containerClassName="overflow-visible" className="min-w-[1080px] whitespace-nowrap">
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
                {isLoading ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow> : visible.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum colaborador encontrado.</TableCell></TableRow> : null}
                {visible.map((c) => (
                  <TableRow key={c.id} {...clickableTableRow(`Visualizar ficha de ${c.nome}`, () => setDetalhes(c))}>
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
                    <TableCell className="text-right" data-row-actions onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <Button size="icon" variant="ghost" aria-label={`Copiar dados de ${c.nome}`} title="Copiar" onClick={async () => {
                        const text = `${c.nome}, Matr ${c.matricula ?? "-"}, ${c.cargo ?? "-"}`;
                        try { await navigator.clipboard.writeText(text); toast.success("Copiado: " + text); }
                        catch { toast.error("Falha ao copiar"); }
                      }}><Copy className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && <TableRow ref={sentinelRef}><TableCell colSpan={9} className="h-px p-0" /></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div ref={barraTabelaRef} aria-label="Barra horizontal da tabela de consulta" className="h-4 overflow-x-scroll overflow-y-hidden rounded-b-md border border-t-0 bg-card/70 shadow-[0_-6px_12px_-10px_rgba(0,0,0,0.85)]">
            <div ref={trilhoTabelaRef} className="h-px" />
          </div>
          <p className="text-xs text-muted-foreground">Clique na linha para abrir a ficha. Role dentro da tabela para ver mais colaboradores e use a barra horizontal abaixo para acessar as demais colunas.</p>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{isLoading ? "Carregando..." : `Exibindo ${shown} de ${total} colaborador(es) encontrado(s)`}</span>
            {hasMore && <Button variant="outline" size="sm" onClick={loadMore}>Carregar mais</Button>}
          </div>
        </CardContent>
      </Card>

      <ColaboradorDetalhes colab={detalhes} empresaLabel={detalhes ? empresaLabel(detalhes.empresa_id) : ""} open={!!detalhes} onOpenChange={(value) => { if (!value) setDetalhes(null); }} />
    </div>
  );
}
