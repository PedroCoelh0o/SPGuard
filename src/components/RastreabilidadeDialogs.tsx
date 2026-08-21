import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Historico = {
  id: string;
  entidade: "colaborador" | "eletronico";
  registro_id: string;
  registro_nome: string;
  acao: "criado" | "editado" | "movido_para_lixeira" | "restaurado";
  alteracoes: Record<string, unknown>;
  autor: string;
  created_at: string;
};

type Excluido = { id: string; nome?: string | null; tipo?: string; descricao?: string | null; modelo?: string | null; excluido_em: string };

const fieldLabels: Record<string, string> = {
  empresa_id: "Empresa", nome: "Nome", cpf: "CPF", rg: "RG", matricula: "Matrícula", cargo: "Cargo", setor: "Setor",
  escolaridade: "Escolaridade", turno: "Turno", data_admissao: "Data de admissão", data_desligamento: "Data de desligamento",
  motivo_desligamento: "Motivo do desligamento", observacoes: "Observação", status: "Status", telefone: "Telefone", celular: "Celular",
  email: "E-mail", cep: "CEP", rua: "Rua", numero: "Número", bairro: "Bairro", cidade: "Cidade", estado: "Estado",
  eletronicos_autorizado: "Autorização de eletrônicos", tipo: "Tipo", descricao: "Descrição", imei: "IMEI", modelo: "Modelo",
  contato: "Contato", numero_selo: "Nº do selo", numero_serie: "Nº de série", acessorios: "Acessórios", justificativa: "Justificativa",
};

const actionLabel: Record<Historico["acao"], string> = {
  criado: "Cadastrado",
  editado: "Editado",
  movido_para_lixeira: "Movido à lixeira",
  restaurado: "Restaurado",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function changesSummary(changes: Record<string, unknown>) {
  const fields = Object.keys(changes).filter((key) => key !== "registro");
  if (!fields.length) return String(changes.registro ?? "-");
  return fields.map((field) => fieldLabels[field] ?? field).join(", ");
}

export function HistoricoAlteracoesDialog() {
  const { data = [] } = useQuery({
    queryKey: ["historico-alteracoes"],
    queryFn: () => fetchAllRows<Historico>(() => supabase.from("historico_alteracoes").select("*").order("created_at", { ascending: false }) as never),
  });

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm"><History className="h-4 w-4" /> Histórico</Button></DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de alterações</DialogTitle>
          <DialogDescription>Registra os cadastros, edições, exclusões e restaurações feitos neste computador.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Registro</TableHead><TableHead>Ação</TableHead><TableHead>Campos alterados</TableHead><TableHead>Responsável</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Ainda não há alterações registradas.</TableCell></TableRow> : data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(item.created_at)}</TableCell>
                  <TableCell><Badge variant="secondary">{item.entidade === "colaborador" ? "Colaborador" : "Eletrônico"}</Badge></TableCell>
                  <TableCell className="font-medium">{item.registro_nome}</TableCell>
                  <TableCell>{actionLabel[item.acao]}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{changesSummary(item.alteracoes)}</TableCell>
                  <TableCell className="text-sm">{item.autor}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LixeiraDialog() {
  const qc = useQueryClient();
  const [limpando, setLimpando] = useState(false);
  const { data: colaboradores = [] } = useQuery({
    queryKey: ["lixeira-colaboradores"],
    queryFn: () => fetchAllRows<Excluido>(() => supabase.from("colaboradores").select("id, nome, excluido_em").onlyDeleted().order("excluido_em", { ascending: false }) as never),
  });
  const { data: eletronicos = [] } = useQuery({
    queryKey: ["lixeira-eletronicos"],
    queryFn: () => fetchAllRows<Excluido>(() => supabase.from("eletronicos").select("id, tipo, descricao, modelo, excluido_em").onlyDeleted().order("excluido_em", { ascending: false }) as never),
  });
  const all = [
    ...colaboradores.map((item) => ({ ...item, entidade: "colaborador" as const, label: item.nome ?? "Colaborador sem nome" })),
    ...eletronicos.map((item) => ({ ...item, entidade: "eletronico" as const, label: [item.tipo, item.descricao, item.modelo].filter(Boolean).join(" — ") || "Eletrônico sem identificação" })),
  ].sort((a, b) => b.excluido_em.localeCompare(a.excluido_em));

  async function restore(item: typeof all[number]) {
    const table = item.entidade === "colaborador" ? "colaboradores" : "eletronicos";
    const { error } = await supabase.from(table).update({ excluido_em: null }).onlyDeleted().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${item.entidade === "colaborador" ? "Colaborador" : "Eletrônico"} restaurado`);
    ["lixeira-colaboradores", "lixeira-eletronicos", "colaboradores-paginados", "colaboradores-consulta", "eletronicos-paginados", "dashboard", "dashboard-eletronicos", "historico-alteracoes"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  }

  async function permanentlyDelete(item: typeof all[number]) {
    const table = item.entidade === "colaborador" ? "colaboradores" : "eletronicos";
    const { error } = await supabase.from(table).delete().permanently().onlyDeleted().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${item.entidade === "colaborador" ? "Colaborador" : "Eletrônico"} excluído permanentemente`);
    ["lixeira-colaboradores", "lixeira-eletronicos", "historico-alteracoes"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  }

  async function emptyTrash() {
    setLimpando(true);
    try {
      // A exclusão em lote usa a mesma rotina segura da exclusão individual,
      // removendo também documentos e fotos dos colaboradores excluídos.
      const [colaboradoresResult, eletronicosResult] = await Promise.all([
        supabase.from("colaboradores").delete().permanently().onlyDeleted(),
        supabase.from("eletronicos").delete().permanently().onlyDeleted(),
      ]);
      const error = colaboradoresResult.error ?? eletronicosResult.error;
      if (error) throw error;
      toast.success(`Lixeira limpa: ${all.length} item(ns) removido(s) permanentemente`);
      ["lixeira-colaboradores", "lixeira-eletronicos", "colaboradores-paginados", "colaboradores-consulta", "eletronicos-paginados", "dashboard", "dashboard-eletronicos", "historico-alteracoes"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLimpando(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Trash2 className="h-4 w-4" /> Lixeira</Button></DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lixeira de segurança</DialogTitle>
          <DialogDescription>Os itens ficam disponíveis para restauração por 15 dias. Depois desse prazo, são removidos definitivamente.</DialogDescription>
        </DialogHeader>
        {all.length > 0 && (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={limpando}><Trash2 className="h-4 w-4" /> Limpar lixeira</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar toda a lixeira?</AlertDialogTitle>
                  <AlertDialogDescription>Os {all.length} item(ns) da lixeira, incluindo documentos e fotos vinculados, serão excluídos permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={limpando}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={limpando} onClick={(event) => { event.preventDefault(); void emptyTrash(); }}>{limpando ? "Limpando..." : "Limpar lixeira"}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Registro</TableHead><TableHead>Excluído em</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
            <TableBody>
              {all.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">A lixeira está vazia.</TableCell></TableRow> : all.map((item) => (
                <TableRow key={`${item.entidade}-${item.id}`}>
                  <TableCell><Badge variant="secondary">{item.entidade === "colaborador" ? "Colaborador" : "Eletrônico"}</Badge></TableCell>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell>{formatDateTime(item.excluido_em)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => restore(item)}><RotateCcw className="h-4 w-4" /> Restaurar</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="destructive" aria-label="Excluir permanentemente" title="Excluir permanentemente"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
                            <AlertDialogDescription>{item.entidade === "colaborador" ? "O colaborador, seus documentos e sua foto serão removidos de forma definitiva." : "O eletrônico será removido de forma definitiva."} Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => permanentlyDelete(item)}>Excluir permanentemente</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
