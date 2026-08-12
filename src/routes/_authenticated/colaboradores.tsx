import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Search, Eye, FileDown, FileText, FileSpreadsheet, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatCPF, formatPhone, formatCEP, UFS, formatDate } from "@/lib/format";
import { ImportarColaboradores } from "@/components/ImportarColaboradores";
import { ColaboradorDetalhes } from "@/components/ColaboradorDetalhes";
import { HistoricoAlteracoesDialog, LixeiraDialog } from "@/components/RastreabilidadeDialogs";
import { exportColaboradoresCSV, exportColaboradoresPDF, exportColaboradoresXLSX } from "@/lib/export-colaboradores";

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

const empty: Partial<Colab> = { nome: "", status: "ativo" };
const TURNOS = ["Letra A", "Letra B", "Letra C", "Letra D", "Administrativo", "FIFO", "Híbrido", "Noturno", "Diurno"];

function ColabPage() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [turnoFiltro, setTurnoFiltro] = useState("all");
  const [empresaFiltro, setEmpresaFiltro] = useState("all");
  
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Colab> | null>(null);
  const [detalhes, setDetalhes] = useState<Colab | null>(null);


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
      return await fetchAllRows<Colab>(() => supabase.from("colaboradores").select("*").order("nome") as never);
    },
  });

  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome_fantasia || e.razao_social])), [empresas]);
  const empresaLabel = (id: string) => empresaMap.get(id) ?? "-";

  const save = useMutation({
    mutationFn: async (payload: Partial<Colab>) => {
      const { id, ...rest } = payload;
      const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
      if (id) {
        const { error } = await supabase.from("colaboradores").update(clean as unknown as { nome?: string }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("colaboradores").insert(clean as unknown as { nome: string; empresa_id: string });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Colaborador salvo");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["colaboradores-eletr"] });
      qc.invalidateQueries({ queryKey: ["historico-alteracoes"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("colaboradores").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => {
      toast.success("Colaborador movido para a lixeira. Você pode restaurá-lo em até 30 dias.");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
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
      if (!s) return true;
      return (empresaMap.get(c.empresa_id) ?? "").toLowerCase().includes(s) || c.nome.toLowerCase().includes(s) || (c.cpf ?? "").includes(s) || (c.matricula ?? "").toLowerCase().includes(s) || (c.cargo ?? "").toLowerCase().includes(s) || (c.turno ?? "").toLowerCase().includes(s);
    });
    const sorted = [...list];
    sorted.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return sorted;
  }, [colabs, qd, turnoFiltro, empresaFiltro, empresaMap]);


  const { visible, hasMore, loadMore, sentinelRef, shown, total } = useInfiniteSlice(filtered, 50);

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
              <ImportarColaboradores empresas={empresas} onDone={() => { qc.invalidateQueries({ queryKey: ["colaboradores"] }); qc.invalidateQueries({ queryKey: ["historico-alteracoes"] }); }} />
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
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1080px] whitespace-nowrap">
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
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum colaborador encontrado.</TableCell></TableRow>
                ) : visible.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
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
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" aria-label={`Copiar dados de ${c.nome}`} title="Copiar dados" onClick={async () => {
                        const text = `${c.nome}, Matr ${c.matricula ?? "-"}, ${c.cargo ?? "-"}`;
                        try { await navigator.clipboard.writeText(text); toast.success("Copiado: " + text); }
                        catch { toast.error("Falha ao copiar"); }
                      }}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Ver detalhes de ${c.nome}`} title="Ver detalhes" onClick={() => setDetalhes(c)}><Eye className="h-4 w-4" /></Button>
                      {canWrite && <Button size="icon" variant="ghost" aria-label={`Editar ${c.nome}`} title="Editar" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="icon" variant="ghost" aria-label={`Excluir ${c.nome}`} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Mover colaborador para a lixeira?</AlertDialogTitle>
                              <AlertDialogDescription>O colaborador e seus documentos poderão ser restaurados pela lixeira durante 30 dias.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(c.id)}>Mover para lixeira</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Em telas menores, deslize horizontalmente para visualizar todos os dados sem alterar a altura das linhas.</p>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{isLoading ? "Carregando..." : `Exibindo ${shown} de ${total} colaborador(es)`}</span>
            {hasMore && <Button variant="outline" size="sm" onClick={loadMore}>Carregar mais</Button>}
          </div>
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </CardContent>
      </Card>
      <ColaboradorDetalhes colab={detalhes} empresaLabel={detalhes ? empresaLabel(detalhes.empresa_id) : ""} open={!!detalhes} onOpenChange={(v) => { if (!v) setDetalhes(null); }} />
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
