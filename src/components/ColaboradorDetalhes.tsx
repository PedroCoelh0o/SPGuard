import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Trash2, Camera, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

type Colab = {
  id: string; nome: string; cpf: string | null; matricula: string | null;
  cargo: string | null; status: string; foto_url: string | null;
  data_admissao: string | null; email: string | null; telefone: string | null; celular: string | null;
};

type Doc = {
  id: string; colaborador_id: string; nome: string; tipo: string | null;
  storage_path: string; tamanho: number | null; created_at: string;
};

const BUCKET_FOTOS = "colaborador-fotos";
const BUCKET_DOCS = "colaborador-documentos";

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ColaboradorDetalhes({ colab, open, onOpenChange }: {
  colab: Colab | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery({
    enabled: !!colab && open,
    queryKey: ["docs", colab?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaborador_documentos")
        .select("*")
        .eq("colaborador_id", colab!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      setFotoUrl(null);
      if (!colab?.foto_url) return;
      const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(colab.foto_url, 3600);
      if (alive) setFotoUrl(data?.signedUrl ?? null);
    }
    load();
    return () => { alive = false; };
  }, [colab?.foto_url]);

  if (!colab) return null;

  async function uploadFoto(file: File) {
    if (!colab) return;
    setUploadingFoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${colab.id}/foto-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      // Remove old
      if (colab.foto_url && colab.foto_url !== path) {
        await supabase.storage.from(BUCKET_FOTOS).remove([colab.foto_url]);
      }
      const { error: upErr } = await supabase.from("colaboradores").update({ foto_url: path }).eq("id", colab.id);
      if (upErr) throw upErr;
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(path, 3600);
      setFotoUrl(data?.signedUrl ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingFoto(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  }

  async function uploadDoc(file: File) {
    if (!colab) return;
    setUploadingDoc(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${colab.id}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from(BUCKET_DOCS).upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { error: insErr } = await supabase.from("colaborador_documentos").insert({
        colaborador_id: colab.id,
        nome: file.name,
        tipo: file.type || null,
        storage_path: path,
        tamanho: file.size,
        uploaded_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      toast.success("Documento enviado");
      qc.invalidateQueries({ queryKey: ["docs", colab.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingDoc(false);
      if (docRef.current) docRef.current.value = "";
    }
  }

  async function downloadDoc(d: Doc) {
    const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(d.storage_path, 60, { download: d.nome });
    if (error || !data) { toast.error(error?.message ?? "Erro ao gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function deleteDoc(d: Doc) {
    if (!confirm(`Excluir "${d.nome}"?`)) return;
    const { error: sErr } = await supabase.storage.from(BUCKET_DOCS).remove([d.storage_path]);
    if (sErr) { toast.error(sErr.message); return; }
    const { error } = await supabase.from("colaborador_documentos").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Documento excluído");
    qc.invalidateQueries({ queryKey: ["docs", colab!.id] });
  }

  const initials = colab.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do colaborador</DialogTitle>
          <DialogDescription>Foto, dados e documentos anexos</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-32 w-32">
              {fotoUrl ? <AvatarImage src={fotoUrl} alt={colab.nome} /> : null}
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            {canWrite && (
              <>
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFoto(f); }}
                />
                <Button size="sm" variant="outline" onClick={() => fotoRef.current?.click()} disabled={uploadingFoto}>
                  {uploadingFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {colab.foto_url ? "Trocar foto" : "Enviar foto"}
                </Button>
              </>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <h3 className="text-xl font-semibold">{colab.nome}</h3>
            <Badge variant={colab.status === "ativo" ? "default" : "destructive"}>
              {colab.status === "ativo" ? "Ativo" : "Desligado"}
            </Badge>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3">
              <dt className="text-muted-foreground">Cargo</dt><dd>{colab.cargo ?? "-"}</dd>
              <dt className="text-muted-foreground">Matrícula</dt><dd>{colab.matricula ?? "-"}</dd>
              <dt className="text-muted-foreground">CPF</dt><dd>{colab.cpf ?? "-"}</dd>
              <dt className="text-muted-foreground">Admissão</dt><dd>{formatDate(colab.data_admissao)}</dd>
              <dt className="text-muted-foreground">E-mail</dt><dd className="truncate">{colab.email ?? "-"}</dd>
              <dt className="text-muted-foreground">Telefone</dt><dd>{colab.telefone ?? colab.celular ?? "-"}</dd>
            </dl>
          </div>
        </div>

        <Card className="mt-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Documentos</h4>
              {canWrite && (
                <>
                  <input
                    ref={docRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }}
                  />
                  <Button size="sm" onClick={() => docRef.current?.click()} disabled={uploadingDoc}>
                    {uploadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Enviar documento
                  </Button>
                </>
              )}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                  ) : docs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum documento anexado.</TableCell></TableRow>
                  ) : docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.nome}</TableCell>
                      <TableCell>{formatSize(d.tamanho)}</TableCell>
                      <TableCell>{formatDate(d.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => downloadDoc(d)}><Download className="h-4 w-4" /></Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" onClick={() => deleteDoc(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
