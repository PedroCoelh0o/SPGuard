import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/local-db/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatPhone } from "@/lib/format";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Smartphone, Laptop, Tablet } from "lucide-react";
import { toast } from "sonner";

export type Eletronico = {
  id: string;
  colaborador_id: string;
  tipo: "celular" | "notebook" | "tablet";
  descricao: string | null;
  imei: string | null;
  modelo: string | null;
  contato: string | null;
  numero_selo: string | null;
  numero_serie: string | null;
  acessorios: string | null;
  created_at: string;
};

const tipoLabel = { celular: "Celular", notebook: "Notebook", tablet: "Tablet" } as const;
const tipoIcon = { celular: Smartphone, notebook: Laptop, tablet: Tablet } as const;

const empty: Partial<Eletronico> = { tipo: "celular", descricao: "", imei: "", modelo: "", contato: "", numero_selo: "", numero_serie: "", acessorios: "" };

export function EletronicosTab({ colaboradorId, colaboradorNome }: { colaboradorId: string; colaboradorNome: string }) {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Eletronico> | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["eletronicos", colaboradorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eletronicos" as never)
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Eletronico[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<Eletronico>) => {
      const { id, ...rest } = payload;
      const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v])) as Record<string, unknown>;
      clean.colaborador_id = colaboradorId;
      if (id) {
        const { error } = await supabase.from("eletronicos" as never).update(clean as never).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("eletronicos" as never).insert(clean as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Dispositivo salvo");
      qc.invalidateQueries({ queryKey: ["eletronicos", colaboradorId] });
      qc.invalidateQueries({ queryKey: ["dashboard-eletronicos"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eletronicos" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dispositivo excluído");
      qc.invalidateQueries({ queryKey: ["eletronicos", colaboradorId] });
      qc.invalidateQueries({ queryKey: ["dashboard-eletronicos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold flex items-center gap-2"><Smartphone className="h-4 w-4" /> Eletrônicos de {colaboradorNome}</h4>
          {canWrite && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setEditing({ ...empty, descricao: `${colaboradorNome} - ` })}>
                  <Plus className="h-4 w-4" /> Cadastrar
                </Button>
              </DialogTrigger>
              <EletronicoForm
                key={editing?.id ?? "new"}
                value={editing ?? empty}
                onCancel={() => { setOpen(false); setEditing(null); }}
                onSave={(v) => save.mutate(v)}
                saving={save.isPending}
              />
            </Dialog>
          )}
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>IMEI</TableHead>
                <TableHead>Nº Série</TableHead>
                <TableHead>Acessórios</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Nº Selo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Nenhum dispositivo cadastrado.</TableCell></TableRow>
              ) : items.map((e) => {
                const Icon = tipoIcon[e.tipo];
                return (
                  <TableRow key={e.id}>
                    <TableCell><Badge variant="secondary" className="gap-1"><Icon className="h-3 w-3" />{tipoLabel[e.tipo]}</Badge></TableCell>
                    <TableCell className="font-medium">{e.descricao ?? "-"}</TableCell>
                    <TableCell>{e.modelo ?? "-"}</TableCell>
                    <TableCell>{e.imei ?? "-"}</TableCell>
                    <TableCell>{e.numero_serie ?? "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={e.acessorios ?? ""}>{e.acessorios ?? "-"}</TableCell>
                    <TableCell>{e.contato ?? "-"}</TableCell>
                    <TableCell>{e.numero_selo ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && <Button size="icon" variant="ghost" aria-label={`Editar ${e.descricao}`} title="Editar" onClick={() => { setEditing(e); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                      {isAdmin && <Button size="icon" variant="ghost" aria-label={`Excluir ${e.descricao}`} title="Excluir" onClick={() => { if (confirm("Excluir dispositivo?")) del.mutate(e.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function EletronicoForm({ value, onCancel, onSave, saving }: {
  value: Partial<Eletronico>; onCancel: () => void; onSave: (v: Partial<Eletronico>) => void; saving: boolean;
}) {
  const [v, setV] = useState<Partial<Eletronico>>(value);
  const set = <K extends keyof Eletronico>(k: K, val: Eletronico[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{v.id ? "Editar" : "Cadastrar"} dispositivo</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault(); onSave(v); }} className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tipo *</Label>
          <Select value={v.tipo ?? "celular"} onValueChange={(x) => set("tipo", x as Eletronico["tipo"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="celular">Celular</SelectItem>
              <SelectItem value="notebook">Notebook</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Nº Selo</Label>
          <Input value={v.numero_selo ?? ""} onChange={(e) => set("numero_selo", e.target.value)} placeholder="Selo da segurança patrimonial" />
        </div>
        <div className="sm:col-span-2">
          <Label>Descrição</Label>
          <Input value={v.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: João Silva - Celular corporativo" />
        </div>
        <div>
          <Label>Modelo</Label>
          <Input value={v.modelo ?? ""} onChange={(e) => set("modelo", e.target.value)} placeholder="Ex.: Dell Latitude 5420" />
        </div>
        <div>
          <Label>IMEI</Label>
          <Input value={v.imei ?? ""} onChange={(e) => set("imei", e.target.value)} />
        </div>
        <div>
          <Label>Nº de Série</Label>
          <Input value={v.numero_serie ?? ""} onChange={(e) => set("numero_serie", e.target.value)} placeholder="Ex.: SN-8H3K92LM" />
        </div>
        <div>
          <Label>Contato</Label>
          <Input value={v.contato ?? ""} onChange={(e) => set("contato", formatPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
        </div>
        <div className="sm:col-span-2">
          <Label>Acessórios</Label>
          <Textarea rows={2} value={v.acessorios ?? ""} onChange={(e) => set("acessorios", e.target.value)} placeholder="Ex.: Carregador, fone de ouvido, capa, mouse" />
        </div>
        <DialogFooter className="sm:col-span-2 mt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
