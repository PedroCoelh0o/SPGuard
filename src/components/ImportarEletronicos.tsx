import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/local-db/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fetchAllRows } from "@/lib/fetch-all";

type Row = {
  linha: number;
  colaborador_id: string | null;
  colaboradorLabel: string;
  tipo: string;
  descricao: string | null;
  imei: string | null;
  modelo: string | null;
  contato: string | null;
  numero_selo: string | null;
  numero_serie: string | null;
  acessorios: string | null;
  action: "insert" | "update" | "error";
  errors: string[];
  existingId?: string;
};

const HEADERS = [
  "cpf", "matricula", "colaborador", "tipo", "descricao", "modelo",
  "imei", "numero_serie", "numero_selo", "contato", "acessorios",
];

const TIPOS = ["celular", "notebook", "tablet"];

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function onlyDigits(v: unknown) { return String(v ?? "").replace(/\D/g, ""); }

export function ImportarEletronicos({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; updated: number; failed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => ({
    total: rows.length,
    insert: rows.filter((r) => r.action === "insert").length,
    update: rows.filter((r) => r.action === "update").length,
    error: rows.filter((r) => r.action === "error").length,
  }), [rows]);

  function reset() {
    setRows([]); setFileName(""); setProgress(0); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, [
      "123.456.789-00", "M001", "João da Silva", "celular", "Aparelho corporativo", "Samsung A54",
      "356938035643809", "SN-00123", "SELO-001", "(11) 99999-0000", "Carregador, capa",
    ]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Eletronicos");
    XLSX.writeFile(wb, "modelo-eletronicos.xlsx");
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setProgress(0);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    const colabs = await fetchAllRows<{ id: string; nome: string; cpf: string | null; matricula: string | null }>(
      () => supabase.from("colaboradores").select("id, nome, cpf, matricula").includeDeleted() as never,
    );
    const byCpf = new Map<string, string>();
    const byMat = new Map<string, string>();
    const byNome = new Map<string, string>();
    for (const c of colabs) {
      if (c.cpf) byCpf.set(onlyDigits(c.cpf), c.id);
      if (c.matricula) byMat.set(norm(c.matricula), c.id);
      byNome.set(norm(c.nome), c.id);
    }

    const existing = await fetchAllRows<{ id: string; colaborador_id: string; tipo: string; imei: string | null; numero_serie: string | null }>(
      () => supabase.from("eletronicos" as never).select("id, colaborador_id, tipo, imei, numero_serie").includeDeleted() as never,
    );
    const byImei = new Map<string, string>();
    const bySerie = new Map<string, string>();
    for (const e of existing) {
      if (e.imei) byImei.set(onlyDigits(e.imei), e.id);
      if (e.numero_serie) bySerie.set(norm(e.numero_serie), e.id);
    }

    const parsed: Row[] = raw.map((r, idx) => {
      const get = (k: string) => {
        const key = Object.keys(r).find((kk) => norm(kk) === norm(k));
        return key ? r[key] : "";
      };
      const errors: string[] = [];
      const cpfDigits = onlyDigits(get("cpf"));
      const matricula = String(get("matricula") ?? "").trim();
      const nome = String(get("colaborador") ?? "").trim();

      let colaborador_id: string | null = null;
      if (cpfDigits) colaborador_id = byCpf.get(cpfDigits) ?? null;
      if (!colaborador_id && matricula) colaborador_id = byMat.get(norm(matricula)) ?? null;
      if (!colaborador_id && nome) colaborador_id = byNome.get(norm(nome)) ?? null;
      if (!colaborador_id) errors.push("Colaborador não encontrado (informe CPF, matrícula ou nome exato)");

      const tipo = norm(get("tipo"));
      if (!tipo) errors.push("Tipo obrigatório");
      else if (!TIPOS.includes(tipo)) errors.push(`Tipo inválido: "${tipo}" (use celular, notebook ou tablet)`);

      const imei = String(get("imei") ?? "").trim() || null;
      const numero_serie = String(get("numero_serie") ?? "").trim() || null;

      let existingId: string | undefined;
      if (imei) existingId = byImei.get(onlyDigits(imei));
      if (!existingId && numero_serie) existingId = bySerie.get(norm(numero_serie));

      return {
        linha: idx + 2,
        colaborador_id,
        colaboradorLabel: nome || matricula || (cpfDigits ? String(get("cpf")) : "-"),
        tipo,
        descricao: String(get("descricao") ?? "").trim() || null,
        imei,
        modelo: String(get("modelo") ?? "").trim() || null,
        contato: String(get("contato") ?? "").trim() || null,
        numero_selo: String(get("numero_selo") ?? "").trim() || null,
        numero_serie,
        acessorios: String(get("acessorios") ?? "").trim() || null,
        action: errors.length ? "error" : existingId ? "update" : "insert",
        errors,
        existingId,
      } satisfies Row;
    });

    setRows(parsed);
  }

  async function runImport() {
    setRunning(true);
    setResult(null);
    const toRun = rows.filter((r) => r.action !== "error");
    let inserted = 0, updated = 0, failed = 0;
    for (let i = 0; i < toRun.length; i++) {
      const r = toRun[i];
      const payload = {
        colaborador_id: r.colaborador_id!, tipo: r.tipo, descricao: r.descricao, imei: r.imei,
        modelo: r.modelo, contato: r.contato, numero_selo: r.numero_selo,
        numero_serie: r.numero_serie, acessorios: r.acessorios,
      };
      try {
        if (r.existingId) {
          const { error } = await supabase.from("eletronicos" as never).update({ ...payload, excluido_em: null } as never).includeDeleted().eq("id", r.existingId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from("eletronicos" as never).insert(payload as never);
          if (error) throw error;
          inserted++;
        }
      } catch (e) {
        failed++;
        r.errors.push((e as Error).message);
        r.action = "error";
      }
      setProgress(Math.round(((i + 1) / toRun.length) * 100));
    }
    setRows([...rows]);
    setResult({ inserted, updated, failed });
    setRunning(false);
    toast.success(`Importação: ${inserted} novos, ${updated} atualizados, ${failed} falhas`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" /> Importar XLSX</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar eletrônicos</DialogTitle>
          <DialogDescription>
            Envie um arquivo .xlsx. O colaborador é localizado por CPF, matrícula ou nome. Registros com o mesmo IMEI ou nº de série serão atualizados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              <FileDown className="h-4 w-4" /> Baixar modelo
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              aria-label="Selecionar arquivo XLSX de eletrônicos"
              className="text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            {rows.length > 0 && <Button size="sm" variant="ghost" onClick={reset}>Limpar</Button>}
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Total: {stats.total}</Badge>
              <Badge className="bg-emerald-600">Novos: {stats.insert}</Badge>
              <Badge className="bg-blue-600">Atualizar: {stats.update}</Badge>
              {stats.error > 0 && <Badge variant="destructive">Erros: {stats.error}</Badge>}
            </div>
          )}

          {rows.length > 0 && !running && !result && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Prévia de validação pronta</AlertTitle>
              <AlertDescription>Confira os novos registros, as atualizações e as linhas inválidas. Nenhum dado é salvo antes da confirmação da importação.</AlertDescription>
            </Alert>
          )}

          {running && (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">Importando... {progress}%</p>
            </div>
          )}

          {result && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Importação concluída</AlertTitle>
              <AlertDescription>
                {result.inserted} inseridos · {result.updated} atualizados · {result.failed} falhas
              </AlertDescription>
            </Alert>
          )}

          {stats.error > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Linhas com erro serão ignoradas</AlertTitle>
              <AlertDescription>Corrija o arquivo e reenvie para importar as linhas restantes.</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <div className="rounded-md border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>IMEI / Série</TableHead>
                    <TableHead>Erros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.linha}>
                      <TableCell>{r.linha}</TableCell>
                      <TableCell>
                        {r.action === "insert" && <Badge className="bg-emerald-600">Novo</Badge>}
                        {r.action === "update" && <Badge className="bg-blue-600">Atualizar</Badge>}
                        {r.action === "error" && <Badge variant="destructive">Erro</Badge>}
                      </TableCell>
                      <TableCell>{r.colaboradorLabel || "-"}</TableCell>
                      <TableCell>{r.tipo || "-"}</TableCell>
                      <TableCell>{r.modelo ?? "-"}</TableCell>
                      <TableCell>{r.imei ?? r.numero_serie ?? "-"}</TableCell>
                      <TableCell className="text-xs text-destructive">{r.errors.join("; ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>Fechar</Button>
          <Button onClick={runImport} disabled={running || stats.insert + stats.update === 0}>
            {running ? "Importando..." : `Importar ${stats.insert + stats.update} registro(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
