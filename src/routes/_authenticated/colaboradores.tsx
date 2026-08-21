import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounced, useInfiniteSlice } from "@/hooks/useListPerf";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Eye, FileDown, FileText, FileSpreadsheet, Copy, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { formatCPF, formatPhone, formatCEP, isValidCPF, UFS, formatDate } from "@/lib/format";
import { ImportarColaboradores } from "@/components/ImportarColaboradores";
import { ColaboradorDetalhes } from "@/components/ColaboradorDetalhes";
import { HistoricoAlteracoesDialog, LixeiraDialog } from "@/components/RastreabilidadeDialogs";
import { exportColaboradoresCSV, exportColaboradoresPDF, exportColaboradoresXLSX } from "@/lib/export-colaboradores";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: () => ({
    meta: [
      { title: "Colaboradores — SPGuard" },
      { name: "description", content: "Cadastro completo de colaboradores no SPGuard: dados pessoais, trabalhistas, documentos, eletrônicos vinculados e importação em massa via XLSX." },
      { property: "og:title", content: "Colaboradores — SPGuard" },
      { property: "og:description", content: "Cadastro e gestão de colaboradores das empresas contratadas." },
      { property: "og:url", content: "https://spguardian.lovable.app/colaboradores" },
    ],
    links: [{ rel: "canonical", href: "https://spguardian.lovable.app/colaboradores" }],
  }),
  component: ColabPage,
});

type Colab = {
  id: string; empresa_id: string; nome: string; cpf: string | null; rg: string | null; matricula: string | null;
  cargo: string | null; setor: string | null; escolaridade: string | null; data_nascimento: string | null; sexo: string | null;
  turno: string | null;
  data_admissao: string | null; data_desligamento: string | null; motivo_desligamento: string | null; observacoes: string | null; status: string;
  telefone: string | null; celular: string | null; email: string | null;
  cep: string | null; rua: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null;
  foto_url: string | null;
};
type PendenciaCadastro = { id: string; colaborador_id: string; campo: "cpf" | "matricula"; valor_original: string | null; motivo: string; resolvido_em: string | null };

const empty: Partial<Colab> = { nome: "", status: "ativo" };
const TURNOS = ["Letra A", "Letra B", "Letra C", "Letra D", "Administrativo", "FIFO", "Híbrido", "Noturno", "Diurno"];
const COLABORADORES_POR_PAGINA = 200;

function ColabPage() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [turnoFiltro, setTurnoFiltro] = useState("all");
  const [empresaFiltro, setEmpresaFiltro] = useState("all");
  const [pendenciaFiltro, setPendenciaFiltro] = useState("all");
  const [larguraTabela, setLarguraTabela] = useState(1080);
  
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Colab> | null>(null);
  const [detalhes, setDetalhes] = useState<Colab | null>(null);
  const pendenciasVerificadas = useRef("");
  const tabelaRef = useRef<HTMLTableElement>(null);
  const barraTabelaRef = useRef<HTMLDivElement>(null);
  const listaTabelaRef = useRef<HTMLDivElement>(null);


  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, razao_social, nome_fantasia").order("razao_social");
      return (data ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[];
    },
  });

  const { data: paginasColaboradores, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["colaboradores-paginados"],
    staleTime: 5 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const inicio = pageParam as number;
      const { data, error } = await supabase.from("colaboradores").select("*").order("nome").range(inicio, inicio + COLABORADORES_POR_PAGINA - 1);
      if (error) throw error;
      return (data ?? []) as Colab[];
    },
    getNextPageParam: (ultimaPagina, paginas) => ultimaPagina.length === COLABORADORES_POR_PAGINA ? paginas.length * COLABORADORES_POR_PAGINA : undefined,
  });
  const colabs = useMemo(() => paginasColaboradores?.pages.flat() ?? [], [paginasColaboradores]);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["pendencias-cadastro"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => fetchAllRows<PendenciaCadastro>(() => supabase.from("pendencias_cadastro").select("*") as never),
  });
  const pendenciasAtivas = useMemo(() => pendencias.filter((p) => !p.resolvido_em), [pendencias]);
  const pendenciasPorColaborador = useMemo(() => {
    const result = new Map<string, PendenciaCadastro[]>();
    for (const item of pendenciasAtivas) result.set(item.colaborador_id, [...(result.get(item.colaborador_id) ?? []), item]);
    return result;
  }, [pendenciasAtivas]);

  // Atualiza somente a sinalização: nenhum campo do cadastro antigo é alterado.
  useEffect(() => {
    if (!colabs.length) return;
    const timer = window.setTimeout(() => {
    const conhecidas = new Set(pendencias.map((p) => `${p.colaborador_id}:${p.campo}`));
    const candidatos: { colaborador_id: string; campo: "cpf" | "matricula"; valor_original: string | null; motivo: string }[] = [];
    const cpfs = new Map<string, Colab[]>();
    const matriculas = new Map<string, Colab[]>();
    for (const colab of colabs) {
      const cpf = String(colab.cpf ?? "").trim();
      const matricula = String(colab.matricula ?? "").trim();
      if (!cpf && !conhecidas.has(`${colab.id}:cpf`)) candidatos.push({ colaborador_id: colab.id, campo: "cpf", valor_original: null, motivo: "CPF não informado" });
      else if (cpf && !isValidCPF(cpf) && !conhecidas.has(`${colab.id}:cpf`)) candidatos.push({ colaborador_id: colab.id, campo: "cpf", valor_original: cpf, motivo: "CPF inválido ou incompleto" });
      if (cpf) {
        const key = cpf.replace(/\D/g, "");
        cpfs.set(key, [...(cpfs.get(key) ?? []), colab]);
      }
      if (!matricula && !conhecidas.has(`${colab.id}:matricula`)) candidatos.push({ colaborador_id: colab.id, campo: "matricula", valor_original: null, motivo: "Matrícula não informada" });
      if (matricula) {
        const key = `${colab.empresa_id}:${matricula.toLocaleLowerCase("pt-BR")}`;
        matriculas.set(key, [...(matriculas.get(key) ?? []), colab]);
      }
    }
    for (const grupo of matriculas.values()) {
      if (grupo.length < 2) continue;
      for (const colab of grupo) if (!conhecidas.has(`${colab.id}:matricula`)) candidatos.push({ colaborador_id: colab.id, campo: "matricula", valor_original: colab.matricula, motivo: "Matrícula duplicada na empresa" });
    }
    for (const grupo of cpfs.values()) {
      if (grupo.length < 2) continue;
      for (const colab of grupo) if (!conhecidas.has(`${colab.id}:cpf`)) candidatos.push({ colaborador_id: colab.id, campo: "cpf", valor_original: colab.cpf, motivo: "CPF duplicado" });
    }
    const assinatura = candidatos.map((item) => `${item.colaborador_id}:${item.campo}`).sort().join("|");
    if (!assinatura || assinatura === pendenciasVerificadas.current) return;
    pendenciasVerificadas.current = assinatura;
    void Promise.all(candidatos.map((item) => supabase.from("pendencias_cadastro").insert(item as never))).then(() => {
      qc.invalidateQueries({ queryKey: ["pendencias-cadastro"] });
    });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [colabs, pendencias, qc]);

  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome_fantasia || e.razao_social])), [empresas]);
  const empresaLabel = (id: string) => empresaMap.get(id) ?? "-";

  const save = useMutation({
    mutationFn: async (payload: Partial<Colab>) => {
      const { id, ...rest } = payload;
      const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
      const cpf = String(clean.cpf ?? "").replace(/\D/g, "");
      if (cpf && !isValidCPF(cpf)) {
        throw new Error("CPF inválido. Confira os 11 dígitos antes de salvar.");
      }
      const existingCpf = cpf
        ? colabs.find((colaborador) => colaborador.id !== id && String(colaborador.cpf ?? "").replace(/\D/g, "") === cpf)
        : undefined;
      if (existingCpf) {
        throw new Error(`Este CPF já está cadastrado para ${existingCpf.nome}.`);
      }
      if (id) {
        const { error } = await supabase.from("colaboradores").update(clean as unknown as { nome?: string }).eq("id", id);
        if (error) throw error;
        const resolvidoEm = new Date().toISOString();
        if (cpf) await supabase.from("pendencias_cadastro").update({ resolvido_em: resolvidoEm } as never).eq("colaborador_id", id).eq("campo", "cpf");
        if (String(clean.matricula ?? "").trim()) await supabase.from("pendencias_cadastro").update({ resolvido_em: resolvidoEm } as never).eq("colaborador_id", id).eq("campo", "matricula");
      } else {
        const { error } = await supabase.from("colaboradores").insert(clean as unknown as { nome: string; empresa_id: string });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Colaborador salvo");
      qc.invalidateQueries({ queryKey: ["colaboradores-paginados"] });
      qc.invalidateQueries({ queryKey: ["colaboradores-consulta"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["colaboradores-eletr"] });
      qc.invalidateQueries({ queryKey: ["historico-alteracoes"] });
      qc.invalidateQueries({ queryKey: ["pendencias-cadastro"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("colaboradores").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => {
      toast.success("Colaborador movido para a lixeira. Você pode restaurá-lo em até 15 dias.");
      qc.invalidateQueries({ queryKey: ["colaboradores-paginados"] });
      qc.invalidateQueries({ queryKey: ["colaboradores-consulta"] });
      qc.invalidateQueries({ queryKey: ["lixeira-colaboradores"] });
      qc.invalidateQueries({ queryKey: ["historico-alteracoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const qd = useDebounced(q, 250);
  const turnosDisponiveis = useMemo(
    () => Array.from(new Set([...TURNOS, ...colabs.map((c) => c.turno).filter((t): t is string => !!t)])),
    [colabs],
  );
  const filtered = useMemo(() => {
    const s = qd.trim().toLowerCase();
    const list = colabs.filter((c) => {
      if (turnoFiltro !== "all" && (c.turno ?? "") !== turnoFiltro) return false;
      if (empresaFiltro !== "all" && c.empresa_id !== empresaFiltro) return false;
      const temPendencia = pendenciasPorColaborador.has(c.id);
      if (pendenciaFiltro === "pendentes" && !temPendencia) return false;
      if (pendenciaFiltro === "sem-pendencias" && temPendencia) return false;
      if (!s) return true;
      return (empresaMap.get(c.empresa_id) ?? "").toLowerCase().includes(s) || c.nome.toLowerCase().includes(s) || (c.cpf ?? "").includes(s) || (c.matricula ?? "").toLowerCase().includes(s) || (c.cargo ?? "").toLowerCase().includes(s) || (c.turno ?? "").toLowerCase().includes(s);
    });
    const sorted = [...list];
    sorted.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return sorted;
  }, [colabs, qd, turnoFiltro, empresaFiltro, pendenciaFiltro, empresaMap, pendenciasPorColaborador]);


  const filtroAtivo = Boolean(qd || turnoFiltro !== "all" || empresaFiltro !== "all" || pendenciaFiltro !== "all");
  const chaveFiltro = `${qd}|${turnoFiltro}|${empresaFiltro}|${pendenciaFiltro}`;
  const { visible, hasMore, loadMore, sentinelRef, shown, total } = useInfiniteSlice(filtered, COLABORADORES_POR_PAGINA, {
    hasMoreRemote: !!hasNextPage,
    loadingRemote: isFetchingNextPage,
    onReachEnd: () => { void fetchNextPage(); },
    scrollRootRef: listaTabelaRef,
    resetKey: chaveFiltro,
  });

  // Quando houver busca ou filtro, a base é completada em segundo plano para a consulta considerar todos os cadastros.
  useEffect(() => {
    if (!filtroAtivo || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [filtroAtivo, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const table = tabelaRef.current;
    const tabelaRolavel = table?.parentElement;
    const barraRolagem = barraTabelaRef.current;
    if (!table || !tabelaRolavel || !barraRolagem) return;

    const atualizarLargura = () => {
      const largura = Math.max(1080, table.scrollWidth);
      setLarguraTabela((atual) => atual === largura ? atual : largura);
      barraRolagem.scrollLeft = tabelaRolavel.scrollLeft;
    };
    const sincronizarTabela = () => { barraRolagem.scrollLeft = tabelaRolavel.scrollLeft; };
    const sincronizarBarra = () => { tabelaRolavel.scrollLeft = barraRolagem.scrollLeft; };
    const quadro = requestAnimationFrame(atualizarLargura);
    tabelaRolavel.addEventListener("scroll", sincronizarTabela);
    barraRolagem.addEventListener("scroll", sincronizarBarra);
    return () => {
      cancelAnimationFrame(quadro);
      tabelaRolavel.removeEventListener("scroll", sincronizarTabela);
      barraRolagem.removeEventListener("scroll", sincronizarBarra);
    };
  }, [shown, isLoading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">Cadastro completo por empresa contratada</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HistoricoAlteracoesDialog />
          <LixeiraDialog />
          <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={async () => {
            try { await exportColaboradoresCSV(filtered, empresas, { Busca: q }); toast.success("CSV gerado"); }
            catch (e) { toast.error((e as Error).message); }
          }}><FileDown className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={async () => {
            try { await exportColaboradoresXLSX(filtered, empresas, { Busca: q }); toast.success("XLSX gerado"); }
            catch (e) { toast.error((e as Error).message); }
          }}><FileSpreadsheet className="h-4 w-4" /> XLSX</Button>
          <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={async () => {
            try { await exportColaboradoresPDF(filtered, empresas, { Busca: q }); toast.success("PDF gerado"); }
            catch (e) { toast.error((e as Error).message); }
          }}><FileText className="h-4 w-4" /> PDF</Button>
          {canWrite && (
            <>
              <ImportarColaboradores empresas={empresas} onDone={() => { qc.invalidateQueries({ queryKey: ["colaboradores-paginados"] }); qc.invalidateQueries({ queryKey: ["colaboradores-consulta"] }); qc.invalidateQueries({ queryKey: ["historico-alteracoes"] }); }} />
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
                <DialogTrigger asChild>
                  <Button disabled={empresas.length === 0} onClick={() => setEditing({ ...empty, empresa_id: empresas[0]?.id })}>
                    <Plus className="h-4 w-4" /> Novo colaborador
                  </Button>
                </DialogTrigger>
                <ColabForm key={editing?.id ?? "new"} empresas={empresas} value={editing ?? empty} onCancel={() => setOpen(false)} onSave={(v) => save.mutate(v)} saving={save.isPending} />
              </Dialog>
            </>
          )}
        </div>
      </div>

      {empresas.length === 0 && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">Cadastre uma empresa antes de adicionar colaboradores.</CardContent></Card>
      )}

      {pendenciasAtivas.length > 0 && <div className="flex"><Badge className="bg-amber-500 text-black">Pendências de conferência: {pendenciasAtivas.length}</Badge></div>}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por empresa, nome, CPF, matrícula, cargo ou turno..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={empresaFiltro} onValueChange={setEmpresaFiltro}>
              <SelectTrigger className="w-64" aria-label="Filtrar por empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={turnoFiltro} onValueChange={setTurnoFiltro}>
              <SelectTrigger className="w-52" aria-label="Filtrar por turno"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os turnos</SelectItem>
                {turnosDisponiveis.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={pendenciaFiltro} onValueChange={setPendenciaFiltro}>
              <SelectTrigger className="w-56" aria-label="Filtrar pendências"><SelectValue placeholder="Pendências" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cadastros</SelectItem>
                <SelectItem value="pendentes">Pendentes de conferência</SelectItem>
                <SelectItem value="sem-pendencias">Sem pendências</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div ref={listaTabelaRef} className="max-h-[calc(100vh-24rem)] min-h-64 overflow-x-hidden overflow-y-auto rounded-t-md border border-b-0">
            <Table ref={tabelaRef} className="min-w-[1080px] whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 min-w-16 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum colaborador encontrado.</TableCell></TableRow>
                ) : visible.map((c) => (
                  <TableRow key={c.id} className={pendenciasPorColaborador.has(c.id) ? "group bg-amber-500/5 hover:bg-amber-500/10" : "group"}>
                    <TableCell className="font-medium"><div className="flex items-center gap-2">{c.nome}{pendenciasPorColaborador.has(c.id) && <Badge title={pendenciasPorColaborador.get(c.id)?.map((p) => p.motivo).join(" · ")} className="bg-amber-500 text-black">Pendente de conferência</Badge>}</div></TableCell>
                    <TableCell>{empresaLabel(c.empresa_id)}</TableCell>
                    <TableCell>{c.cargo ?? "-"}</TableCell>
                    <TableCell>{c.turno ?? "-"}</TableCell>
                    <TableCell>{c.matricula ?? "-"}</TableCell>
                    <TableCell>{c.cpf ?? "-"}</TableCell>
                    <TableCell>{formatDate(c.data_admissao)}</TableCell>

                    <TableCell>
                      <Badge variant={c.status === "ativo" ? "default" : "destructive"}>
                        {c.status === "ativo" ? "Ativo" : "Desligado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-16 min-w-16 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Abrir ações de ${c.nome}`} title="Ações"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>Ações do colaborador</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={async () => {
                        const text = `${c.nome}, Matr ${c.matricula ?? "-"}, ${c.cargo ?? "-"}`;
                        try { await navigator.clipboard.writeText(text); toast.success("Copiado: " + text); }
                        catch { toast.error("Falha ao copiar"); }
                          }}><Copy className="h-4 w-4" /> Copiar dados</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDetalhes(c)}><Eye className="h-4 w-4" /> Visualizar ficha</DropdownMenuItem>
                          {canWrite && <DropdownMenuItem onSelect={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(event) => event.preventDefault()}><Trash2 className="h-4 w-4" /> Mover para lixeira</DropdownMenuItem>
                              </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Mover colaborador para a lixeira?</AlertDialogTitle>
                              <AlertDialogDescription>O colaborador e seus documentos poderão ser restaurados pela lixeira durante 15 dias.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(c.id)}>Mover para lixeira</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && <TableRow ref={sentinelRef}><TableCell colSpan={9} className="h-px p-0" /></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div ref={barraTabelaRef} aria-label="Barra horizontal da tabela de colaboradores" className="h-4 overflow-x-scroll overflow-y-hidden rounded-b-md border border-t-0 bg-card/70 shadow-[0_-6px_12px_-10px_rgba(0,0,0,0.85)]">
            <div className="h-px" style={{ width: larguraTabela }} />
          </div>
          <p className="text-xs text-muted-foreground">Use a barra fixa abaixo da tabela para visualizar os demais dados. Em Ações, clique em <strong>…</strong> para abrir as opções do colaborador.</p>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{isLoading ? "Carregando..." : `Exibindo ${shown} de ${total} colaborador(es) carregado(s)`}</span>
            {hasMore && <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={loadMore}>{isFetchingNextPage ? "Carregando..." : "Carregar mais"}</Button>}
          </div>
        </CardContent>
      </Card>
      <ColaboradorDetalhes colab={detalhes} empresaLabel={detalhes ? empresaLabel(detalhes.empresa_id) : ""} pendencias={detalhes ? pendenciasPorColaborador.get(detalhes.id) : []} open={!!detalhes} onOpenChange={(v) => { if (!v) setDetalhes(null); }} />
    </div>
  );
}

function ColabForm({ empresas, value, onCancel, onSave, saving }: {
  empresas: { id: string; razao_social: string; nome_fantasia: string | null }[];
  value: Partial<Colab>; onCancel: () => void; onSave: (v: Partial<Colab>) => void; saving: boolean;
}) {
  const [v, setV] = useState<Partial<Colab>>(value);
  const set = (k: keyof Colab, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{v.id ? "Editar" : "Novo"} colaborador</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
        <Tabs defaultValue="pessoal">
          <TabsList>
            <TabsTrigger value="pessoal">Pessoais</TabsTrigger>
            <TabsTrigger value="trab">Trabalhistas</TabsTrigger>
            <TabsTrigger value="contato">Contato</TabsTrigger>
            <TabsTrigger value="end">Endereço</TabsTrigger>
            <TabsTrigger value="obs">Observações</TabsTrigger>
          </TabsList>
          <TabsContent value="pessoal" className="grid gap-4 sm:grid-cols-2 mt-4">
            <div className="sm:col-span-2"><Label>Nome Completo *</Label><Input required value={v.nome ?? ""} onChange={(e) => set("nome", e.target.value)} /></div>
            <div><Label>CPF</Label><Input value={v.cpf ?? ""} onChange={(e) => set("cpf", formatCPF(e.target.value))} onBlur={(e) => set("cpf", formatCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" /></div>
            <div><Label>RG</Label><Input value={v.rg ?? ""} onChange={(e) => set("rg", e.target.value)} /></div>
            <div><Label>Matrícula</Label><Input value={v.matricula ?? ""} onChange={(e) => set("matricula", e.target.value)} /></div>
            <div className="sm:col-span-2"><Label>Empresa *</Label>
              <Select value={v.empresa_id ?? ""} onValueChange={(x) => set("empresa_id", x)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Cargo</Label><Input value={v.cargo ?? ""} onChange={(e) => set("cargo", e.target.value)} /></div>
            <div><Label>Setor</Label><Input value={v.setor ?? ""} onChange={(e) => set("setor", e.target.value)} /></div>
            <div><Label>Escolaridade</Label><Input value={v.escolaridade ?? ""} onChange={(e) => set("escolaridade", e.target.value)} /></div>
            <div><Label>Data de Nascimento</Label><Input type="date" value={v.data_nascimento ?? ""} onChange={(e) => set("data_nascimento", e.target.value)} /></div>
            <div><Label>Sexo</Label>
              <Select value={v.sexo ?? ""} onValueChange={(x) => set("sexo", x)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                  <SelectItem value="O">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="trab" className="grid gap-4 sm:grid-cols-2 mt-4">
            <div><Label>Data de Admissão</Label><Input type="date" value={v.data_admissao ?? ""} onChange={(e) => set("data_admissao", e.target.value)} /></div>
            <div><Label>Data de Desligamento</Label><Input type="date" value={v.data_desligamento ?? ""} onChange={(e) => set("data_desligamento", e.target.value)} /></div>
            <div><Label>Turno</Label>
              <Select value={v.turno ?? ""} onValueChange={(x) => set("turno", x)}>
                <SelectTrigger><SelectValue placeholder="Selecione o turno..." /></SelectTrigger>
                <SelectContent>{TURNOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div><Label>Status</Label>
              <Select value={v.status ?? "ativo"} onValueChange={(x) => set("status", x)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="desligado">Desligado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Motivo do Desligamento</Label><Input value={v.motivo_desligamento ?? ""} onChange={(e) => set("motivo_desligamento", e.target.value)} /></div>
          </TabsContent>
          <TabsContent value="contato" className="grid gap-4 sm:grid-cols-2 mt-4">
            <div><Label>Telefone</Label><Input value={v.telefone ?? ""} onChange={(e) => set("telefone", formatPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" /></div>
            <div><Label>Celular</Label><Input value={v.celular ?? ""} onChange={(e) => set("celular", formatPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" /></div>
            <div className="sm:col-span-2"><Label>E-mail</Label><Input type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
          </TabsContent>
          <TabsContent value="end" className="grid gap-4 sm:grid-cols-2 mt-4">
            <div><Label>CEP</Label><Input value={v.cep ?? ""} onChange={(e) => set("cep", formatCEP(e.target.value))} /></div>
            <div className="sm:col-span-2 grid grid-cols-[1fr_100px] gap-2">
              <div><Label>Rua</Label><Input value={v.rua ?? ""} onChange={(e) => set("rua", e.target.value)} /></div>
              <div><Label>Nº</Label><Input value={v.numero ?? ""} onChange={(e) => set("numero", e.target.value)} /></div>
            </div>
            <div><Label>Bairro</Label><Input value={v.bairro ?? ""} onChange={(e) => set("bairro", e.target.value)} /></div>
            <div><Label>Cidade</Label><Input value={v.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} /></div>
            <div><Label>Estado</Label>
              <Select value={v.estado ?? ""} onValueChange={(x) => set("estado", x)}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="obs" className="mt-4">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" className="mt-2 min-h-40" value={v.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} placeholder="Registre informações importantes sobre este colaborador..." />
          </TabsContent>
        </Tabs>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
