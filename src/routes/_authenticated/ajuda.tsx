import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Smartphone, CircleHelp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ajuda")({ component: Ajuda });

const guias = [
  { icon: Users, titulo: "Colaboradores", passos: ["Clique em Novo colaborador para criar uma ficha.", "Preencha os dados principais e clique em Salvar.", "Abra o ícone de olho para consultar documentos, observações e eletrônicos.", "Use os botões CSV, XLSX ou PDF para exportar o resultado pesquisado." ] },
  { icon: Search, titulo: "Consulta", passos: ["Digite um nome, CPF, matrícula, cargo, cidade ou empresa na pesquisa.", "Use os filtros para limitar os resultados.", "A lista é atualizada automaticamente conforme os filtros.", "Exporte somente os colaboradores mostrados na tela em CSV, XLSX ou PDF." ] },
  { icon: Smartphone, titulo: "Eletrônicos", passos: ["Pesquise o colaborador ou selecione uma empresa.", "Use o ícone de olho para ver os dispositivos vinculados.", "Use o segundo ícone para autorizar ou revogar o acesso.", "Use a lixeira para selecionar e excluir um ou mais dispositivos." ] },
];

function Ajuda() {
  return <div className="space-y-6 max-w-4xl"><div><h1 className="text-2xl font-bold flex items-center gap-2"><CircleHelp className="h-6 w-6 text-primary" /> Ajuda</h1><p className="text-sm text-muted-foreground mt-1">Guia rápido para utilizar o SPGuard.</p></div><div className="grid gap-4">{guias.map(({ icon: Icon, titulo, passos }) => <Card key={titulo}><CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /> {titulo}</CardTitle></CardHeader><CardContent><ol className="space-y-3">{passos.map((passo, index) => <li key={passo} className="flex gap-3 text-sm"><Badge className="h-6 w-6 shrink-0 rounded-full grid place-items-center p-0">{index + 1}</Badge><span className="pt-1">{passo}</span></li>)}</ol></CardContent></Card>)}</div></div>;
}
