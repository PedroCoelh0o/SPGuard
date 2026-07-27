import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatCPF } from "@/lib/format";

type Empresa = { id: string; razao_social: string; nome_fantasia: string | null };

type Row = {
  linha: number;
  nome: string;
  cpf: string | null;
  rg: string | null;
  matricula: string | null;
  empresa_id: string | null;
  setor: string | null;
  empresaLabel: string;
  cargo: string | null;
  escolaridade: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  status: string;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  action: "insert" | "update" | "error";
  errors: string[];
  existingId?: string;
};

const HEADERS = [
  "nome","cpf","rg","matricula","empresa","setor","cargo","escolaridade","data_nascimento","sexo",
  "data_admissao","data_desligamento","motivo_desligamento","status",
  "telefone","celular","email","cep","rua","numero","bairro","cidade","estado",
];

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function onlyDigits(v: unknown) { return String(v ?? "").replace(/\D/g, ""); }
function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const mm = String(d.m).padStart(2, "0"); const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${y}-${br[2].padStart(2,"0")}-${br[1].padStart(2,"0")}`;
  }
  return null;
}

export function ImportarColaboradores({ empresas, onDone }: { empresas: Empresa[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; updated: number; failed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const empresaMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of empresas) {
      m.set(norm(e.razao_social), e.id);
      if (e.nome_fantasia) m.set(norm(e.nome_fantasia), e.id);
    }
    return m;
  }, [empresas]);

  const stats = useMemo(() => ({
    total: rows.length,
    insert: rows.filter(r => r.action === "insert").length,
    update: rows.filter(r => r.action === "update").length,
    error: rows.filter(r => r.action === "error").length,
  }), [rows]);

  function reset() {
    setRows([]); setFileName(""); setProgress(0); setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, [
      "João da Silva","123.456.789-00","MG-12.345.678","M001","Empresa Exemplo LTDA","Operação","Auxiliar","Ensino Médio",
      "1990-05-10","M","2024-01-15","","","ativo","(11) 3333-4444","(11) 99999-0000",
      "joao@ex.com","01001-000","Rua A","100","Centro","São Paulo","SP",
    ]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    XLSX.writeFile(wb, "modelo-colaboradores.xlsx");
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setProgress(0);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    // Fetch existing colaboradores for duplicate detection (cpf + matricula+empresa)
    const { data: existing } = await supabase.from("colaboradores").select("id, cpf, matricula, empresa_id");
    const byCpf = new Map<string, { id: string; empresa_id: string }>();
    const byMatEmp = new Map<string, string>();
    for (const c of (existing ?? []) as { id: string; cpf: string | null; matricula: string | null; empresa_id: string }[]) {
      if (c.cpf) byCpf.set(onlyDigits(c.cpf), { id: c.id, empresa_id: c.empresa_id });
      if (c.matricula) byMatEmp.set(`${c.empresa_id}|${norm(c.matricula)}`, c.id);
    }

    const seenCpfFile = new Set<string>();
    const seenMatFile = new Set<string>();

    const parsed: Row[] = raw.map((r, idx) => {
      const get = (k: string) => {
        const key = Object.keys(r).find(kk => norm(kk) === norm(k));
        return key ? r[key] : "";
      };
      const errors: string[] = [];
      const nome = String(get("nome") ?? "").trim();
      const cpfDigits = onlyDigits(get("cpf"));
      const cpf = cpfDigits ? formatCPF(cpfDigits) : null;
      const matricula = String(get("matricula") ?? "").trim() || null;
      const empresaName = String(get("empresa") ?? "").trim();
      const empresa_id = empresaName ? (empresaMap.get(norm(empresaName)) ?? null) : null;

      if (!nome) errors.push("Nome obrigatório");
      if (!empresaName) errors.push("Empresa obrigatória");
      else if (!empresa_id) errors.push(`Empresa não encontrada: "${empresaName}"`);
      if (cpfDigits && cpfDigits.length !== 11) errors.push("CPF inválido");

      // duplicates within file
      if (cpfDigits) {
        if (seenCpfFile.has(cpfDigits)) errors.push("CPF duplicado no arquivo");
        else seenCpfFile.add(cpfDigits);
      }
      if (matricula && empresa_id) {
        const k = `${empresa_id}|${norm(matricula)}`;
        if (seenMatFile.has(k)) errors.push("Matrícula duplicada no arquivo (mesma empresa)");
        else seenMatFile.add(k);
      }

      // existing by CPF → update
      let existingId: string | undefined;
      if (cpfDigits && byCpf.has(cpfDigits)) existingId = byCpf.get(cpfDigits)!.id;
      else if (matricula && empresa_id) {
        const found = byMatEmp.get(`${empresa_id}|${norm(matricula)}`);
        if (found) existingId = found;
      }

      const status = String(get("status") ?? "").trim().toLowerCase() || "ativo";

      const row: Row = {
        linha: idx + 2,
        nome, cpf, matricula, empresa_id, empresaLabel: empresaName,
        cargo: String(get("cargo") ?? "").trim() || null,
        escolaridade: String(get("escolaridade") ?? "").trim() || null,
        data_nascimento: parseDate(get("data_nascimento")),
        sexo: (String(get("sexo") ?? "").trim().toUpperCase()[0]) || null,
        data_admissao: parseDate(get("data_admissao")),
        data_desligamento: parseDate(get("data_desligamento")),
        motivo_desligamento: String(get("motivo_desligamento") ?? "").trim() || null,
        status: status === "desligado" ? "desligado" : "ativo",
        telefone: String(get("telefone") ?? "").trim() || null,
        celular: String(get("celular") ?? "").trim() || null,
        email: String(get("email") ?? "").trim() || null,
        cep: String(get("cep") ?? "").trim() || null,
        rua: String(get("rua") ?? "").trim() || null,
        numero: String(get("numero") ?? "").trim() || null,
        bairro: String(get("bairro") ?? "").trim() || null,
        cidade: String(get("cidade") ?? "").trim() || null,
        estado: String(get("estado") ?? "").trim().toUpperCase() || null,
        action: errors.length ? "error" : existingId ? "update" : "insert",
        errors,
        existingId,
      };
      return row;
    });

    setRows(parsed);
  }

  async function runImport() {
    setRunning(true);
    setResult(null);
    const toRun = rows.filter(r => r.action !== "error");
    let inserted = 0, updated = 0, failed = 0;
    for (let i = 0; i < toRun.length; i++) {
      const r = toRun[i];
      const payload = {
        nome: r.nome, cpf: r.cpf, matricula: r.matricula, empresa_id: r.empresa_id!,
        cargo: r.cargo, escolaridade: r.escolaridade, data_nascimento: r.data_nascimento,
        sexo: r.sexo, data_admissao: r.data_admissao, data_desligamento: r.data_desligamento,
        motivo_desligamento: r.motivo_desligamento, status: r.status,
        telefone: r.telefone, celular: r.celular, email: r.email,
        cep: r.cep, rua: r.rua, numero: r.numero, bairro: r.bairro, cidade: r.cidade, estado: r.estado,
      };
      try {
        if (r.existingId) {
          const { error } = await supabase.from("colaboradores").update(payload).eq("id", r.existingId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from("colaboradores").insert(payload);
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
    if (inserted + updated > 0) {
      toast.success(`${inserted} inseridos, ${updated} atualizados`);
      onDone();
    }
    if (failed > 0) toast.error(`${failed} falhas durante importação`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={empresas.length === 0}>
          <Upload className="h-4 w-4" /> Importar XLSX
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar colaboradores</DialogTitle>
          <DialogDescription>
            Envie um arquivo .xlsx. Registros existentes (mesmo CPF, ou mesma matrícula+empresa) serão atualizados.
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
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Empresa</TableHead>
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
                      <TableCell>{r.nome || "-"}</TableCell>
                      <TableCell>{r.cpf ?? "-"}</TableCell>
                      <TableCell>{r.matricula ?? "-"}</TableCell>
                      <TableCell>{r.empresaLabel || "-"}</TableCell>
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
          <Button
            onClick={runImport}
            disabled={running || rows.length === 0 || stats.insert + stats.update === 0}
          >
            {running ? "Importando..." : `Importar ${stats.insert + stats.update} registro(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
