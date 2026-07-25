import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatCNPJ, formatPhone, UFS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — SPGuard" },
      { name: "description", content: "Cadastro e gestão de empresas contratadas no SPGuard: razão social, CNPJ, responsáveis, contato e status de atividade." },
      { property: "og:title", content: "Empresas — SPGuard" },
      { property: "og:description", content: "Gestão das empresas contratadas parceiras da segurança patrimonial." },
      { property: "og:url", content: "https://spguardian.lovable.app/empresas" },
    ],
    links: [{ rel: "canonical", href: "https://spguardian.lovable.app/empresas" }],
  }),
  component: EmpresasPage,
});

type Empresa = {
  id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null;
  responsavel: string | null; telefone: string | null; email: string | null;
  endereco: string | null; cidade: string | null; estado: string | null; status: string;
};

const empty: Partial<Empresa> = { razao_social: "", nome_fantasia: "", cnpj: "", responsavel: "", telefone: "", email: "", endereco: "", cidade: "", estado: "", status: "ativa" };

function EmpresasPage() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Empresa> | null>(null);

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("razao_social");
      if (error) throw error;
      return data as Empresa[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<Empresa>) => {
      const { id, ...rest } = payload;
      const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
      if (id) {
        const { error } = await supabase.from("empresas").update(clean as unknown as { razao_social?: string }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("empresas").insert(clean as unknown as { razao_social: string });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Empresa salva");
      qc.invalidateQueries({ queryKey: ["empresas"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empresas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Empresa excluída"); qc.invalidateQueries({ queryKey: ["empresas"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = empresas.filter((e) => {
    const s = q.toLowerCase();
    return !s || e.razao_social.toLowerCase().includes(s) || (e.nome_fantasia ?? "").toLowerCase().includes(s) || (e.cnpj ?? "").includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Empresas Contratadas</h1>
          <p className="text-sm text-muted-foreground">Cadastro e gestão das empresas parceiras</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(empty)}><Plus className="h-4 w-4" /> Nova empresa</Button>
            </DialogTrigger>
            <EmpresaForm key={editing?.id ?? "new"} value={editing ?? empty} onCancel={() => setOpen(false)} onSave={(v) => save.mutate(v)} saving={save.isPending} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por razão social, fantasia ou CNPJ..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma empresa encontrada.</TableCell></TableRow>
                ) : filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">{e.razao_social}</div>
                      {e.nome_fantasia && <div className="text-xs text-muted-foreground">{e.nome_fantasia}</div>}
                    </TableCell>
                    <TableCell>{e.cnpj ?? "-"}</TableCell>
                    <TableCell>{e.responsavel ?? "-"}</TableCell>
                    <TableCell>{[e.cidade, e.estado].filter(Boolean).join("/") || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "ativa" ? "default" : "secondary"}>
                        {e.status === "ativa" ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canWrite && (
                        <Button size="icon" variant="ghost" aria-label={`Editar ${e.razao_social ?? e.nome_fantasia}`} title="Editar" onClick={() => { setEditing(e); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      )}
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label={`Excluir ${e.razao_social ?? e.nome_fantasia}`} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                              <AlertDialogDescription>Essa ação é permanente. Empresas com colaboradores vinculados não podem ser excluídas.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(e.id)}>Excluir</AlertDialogAction>
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
        </CardContent>
      </Card>
    </div>
  );
}

function EmpresaForm({ value, onCancel, onSave, saving }: { value: Partial<Empresa>; onCancel: () => void; onSave: (v: Partial<Empresa>) => void; saving: boolean }) {
  const [v, setV] = useState<Partial<Empresa>>(value);
  const set = (k: keyof Empresa, val: string) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>{v.id ? "Editar" : "Nova"} empresa</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); onSave(v); }} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Razão Social *</Label><Input required value={v.razao_social ?? ""} onChange={(e) => set("razao_social", e.target.value)} /></div>
        <div><Label>Nome Fantasia</Label><Input value={v.nome_fantasia ?? ""} onChange={(e) => set("nome_fantasia", e.target.value)} /></div>
        <div><Label>CNPJ</Label><Input value={v.cnpj ?? ""} onChange={(e) => set("cnpj", formatCNPJ(e.target.value))} /></div>
        <div><Label>Responsável</Label><Input value={v.responsavel ?? ""} onChange={(e) => set("responsavel", e.target.value)} /></div>
        <div><Label>Telefone</Label><Input value={v.telefone ?? ""} onChange={(e) => set("telefone", formatPhone(e.target.value))} /></div>
        <div className="sm:col-span-2"><Label>E-mail</Label><Input type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Endereço</Label><Input value={v.endereco ?? ""} onChange={(e) => set("endereco", e.target.value)} /></div>
        <div><Label>Cidade</Label><Input value={v.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} /></div>
        <div><Label>Estado</Label>
          <Select value={v.estado ?? ""} onValueChange={(x) => set("estado", x)}>
            <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={v.status ?? "ativa"} onValueChange={(x) => set("status", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="inativa">Inativa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
