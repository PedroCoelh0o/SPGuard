import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { getDirHandle, ensurePermission } from "@/lib/local-backup";

export const ENTRADA_FILE = "spguard-entrada.xlsx";
const LAST_SYNC_KEY = "spguard-entrada-last-sync";
export const SYNC_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 horas

const COLAB_HEADERS = [
  "nome", "cpf", "rg", "matricula", "empresa", "setor", "cargo", "turno", "escolaridade",
  "data_nascimento", "sexo", "data_admissao", "data_desligamento", "motivo_desligamento", "status",
  "telefone", "celular", "email", "cep", "rua", "numero", "bairro", "cidade", "estado",
];

const ELETR_HEADERS = [
  "cpf", "matricula", "colaborador", "tipo", "descricao", "modelo",
  "imei", "numero_serie", "numero_selo", "contato", "acessorios",
];

const TIPOS = ["celular", "notebook", "tablet"];

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function onlyDigits(v: unknown) { return String(v ?? "").replace(/\D/g, ""); }
function str(v: unknown) { const s = String(v ?? "").trim(); return s || null; }
function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

type FileHandleLike = {
  createWritable: () => Promise<{ write: (b: BufferSource) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
};

async function entradaHandle(create: boolean) {
  const dir = await getDirHandle();
  if (!dir) throw new Error("Selecione uma pasta primeiro");
  await ensurePermission(dir);
  const sp = await dir.getDirectoryHandle("SPGuard", { create });
  const fh = await sp.getFileHandle(ENTRADA_FILE, { create });
  return { dir, fh: fh as unknown as FileHandleLike };
}

/** Cria o arquivo de entrada com as planilhas Colaboradores e Eletronicos (não sobrescreve se já existir). */
export async function createEntradaFile(): Promise<{ path: string; created: boolean }> {
  const dir = await getDirHandle();
  if (!dir) throw new Error("Selecione uma pasta primeiro");
  await ensurePermission(dir);
  const sp = await dir.getDirectoryHandle("SPGuard", { create: true });
  const path = `${dir.name}/SPGuard/${ENTRADA_FILE}`;

  try {
    await sp.getFileHandle(ENTRADA_FILE, { create: false });
    return { path, created: false };
  } catch { /* não existe, cria abaixo */ }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COLAB_HEADERS]), "Colaboradores");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ELETR_HEADERS]), "Eletronicos");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const fh = await sp.getFileHandle(ENTRADA_FILE, { create: true });
  const w = await (fh as unknown as FileHandleLike).createWritable();
  await w.write(buf);
  await w.close();
  return { path, created: true };
}

export type SyncResult = { colaboradores: number; eletronicos: number; erros: string[] };

function rowGetter(r: Record<string, unknown>) {
  const keys = Object.keys(r);
  return (k: string) => {
    const key = keys.find((kk) => norm(kk) === norm(k));
    return key ? r[key] : "";
  };
}

function rows(wb: XLSX.WorkBook, name: string) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

/** Lê o arquivo de entrada e sincroniza colaboradores e eletrônicos no banco. */
export async function syncFromEntrada(fileOverride?: File): Promise<SyncResult> {
  let file = fileOverride;
  if (!file) {
    const { fh } = await entradaHandle(false);
    file = await fh.getFile();
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const erros: string[] = [];

  const empresas = await fetchAllRows<{ id: string; razao_social: string; nome_fantasia: string | null }>(
    () => supabase.from("empresas").select("id, razao_social, nome_fantasia") as never,
  );
  const empresaMap = new Map<string, string>();
  for (const e of empresas) {
    empresaMap.set(norm(e.razao_social), e.id);
    if (e.nome_fantasia) empresaMap.set(norm(e.nome_fantasia), e.id);
  }

  let colabs = await fetchAllRows<{ id: string; nome: string; cpf: string | null; matricula: string | null; empresa_id: string }>(
    () => supabase.from("colaboradores").select("id, nome, cpf, matricula, empresa_id") as never,
  );

  // --- Colaboradores ---
  let colabCount = 0;
  const colabRows = rows(wb, "Colaboradores");
  for (const [i, r] of colabRows.entries()) {
    const get = rowGetter(r);
    const nome = str(get("nome"));
    if (!nome) continue;
    const empresaNome = str(get("empresa"));
    const empresa_id = empresaNome ? empresaMap.get(norm(empresaNome)) : undefined;
    if (!empresa_id) { erros.push(`Colaboradores linha ${i + 2}: empresa não encontrada ("${empresaNome ?? ""}")`); continue; }

    const cpfDigits = onlyDigits(get("cpf"));
    const matricula = str(get("matricula"));
    const existing = colabs.find((c) =>
      (cpfDigits && onlyDigits(c.cpf) === cpfDigits) ||
      (!!matricula && norm(c.matricula) === norm(matricula) && c.empresa_id === empresa_id),
    );

    const data_desligamento = parseDate(get("data_desligamento"));
    const payload: Record<string, unknown> = {
      nome, empresa_id,
      cpf: str(get("cpf")), rg: str(get("rg")), matricula,
      setor: str(get("setor")), cargo: str(get("cargo")), turno: str(get("turno")),
      escolaridade: str(get("escolaridade")),
      data_nascimento: parseDate(get("data_nascimento")),
      sexo: str(get("sexo")),
      data_admissao: parseDate(get("data_admissao")),
      data_desligamento,
      motivo_desligamento: str(get("motivo_desligamento")),
      status: data_desligamento ? "desligado" : (str(get("status")) ?? "ativo"),
      telefone: str(get("telefone")), celular: str(get("celular")), email: str(get("email")),
      cep: str(get("cep")), rua: str(get("rua")), numero: str(get("numero")),
      bairro: str(get("bairro")), cidade: str(get("cidade")), estado: str(get("estado")),
    };

    if (existing) {
      const { error } = await supabase.from("colaboradores").update(payload as never).eq("id", existing.id);
      if (error) { erros.push(`Colaboradores linha ${i + 2}: ${error.message}`); continue; }
    } else {
      const { error } = await supabase.from("colaboradores").insert(payload as never);
      if (error) { erros.push(`Colaboradores linha ${i + 2}: ${error.message}`); continue; }
    }
    colabCount++;
  }

  if (colabCount > 0) {
    colabs = await fetchAllRows<{ id: string; nome: string; cpf: string | null; matricula: string | null; empresa_id: string }>(
      () => supabase.from("colaboradores").select("id, nome, cpf, matricula, empresa_id") as never,
    );
  }

  // --- Eletrônicos ---
  const byCpf = new Map<string, string>();
  const byMat = new Map<string, string>();
  const byNome = new Map<string, string>();
  for (const c of colabs) {
    if (c.cpf) byCpf.set(onlyDigits(c.cpf), c.id);
    if (c.matricula) byMat.set(norm(c.matricula), c.id);
    byNome.set(norm(c.nome), c.id);
  }

  const existentes = await fetchAllRows<{ id: string; imei: string | null; numero_serie: string | null }>(
    () => supabase.from("eletronicos" as never).select("id, imei, numero_serie") as never,
  );
  const byImei = new Map<string, string>();
  const bySerie = new Map<string, string>();
  for (const e of existentes) {
    if (e.imei) byImei.set(onlyDigits(e.imei), e.id);
    if (e.numero_serie) bySerie.set(norm(e.numero_serie), e.id);
  }

  let eletrCount = 0;
  const eletrRows = rows(wb, "Eletronicos");
  for (const [i, r] of eletrRows.entries()) {
    const get = rowGetter(r);
    const tipo = norm(get("tipo"));
    if (!tipo && !str(get("imei")) && !str(get("numero_serie"))) continue;
    if (!TIPOS.includes(tipo)) { erros.push(`Eletronicos linha ${i + 2}: tipo inválido ("${tipo}")`); continue; }

    const cpfDigits = onlyDigits(get("cpf"));
    const matricula = str(get("matricula"));
    const nome = str(get("colaborador"));
    let colaborador_id: string | undefined;
    if (cpfDigits) colaborador_id = byCpf.get(cpfDigits);
    if (!colaborador_id && matricula) colaborador_id = byMat.get(norm(matricula));
    if (!colaborador_id && nome) colaborador_id = byNome.get(norm(nome));
    if (!colaborador_id) { erros.push(`Eletronicos linha ${i + 2}: colaborador não encontrado`); continue; }

    const imei = str(get("imei"));
    const numero_serie = str(get("numero_serie"));
    const payload: Record<string, unknown> = {
      colaborador_id, tipo,
      descricao: str(get("descricao")), modelo: str(get("modelo")),
      imei, numero_serie, numero_selo: str(get("numero_selo")),
      contato: str(get("contato")), acessorios: str(get("acessorios")),
    };

    const existingId = (imei ? byImei.get(onlyDigits(imei)) : undefined) ?? (numero_serie ? bySerie.get(norm(numero_serie)) : undefined);
    if (existingId) {
      const { error } = await supabase.from("eletronicos" as never).update(payload as never).eq("id", existingId);
      if (error) { erros.push(`Eletronicos linha ${i + 2}: ${error.message}`); continue; }
    } else {
      const { error } = await supabase.from("eletronicos" as never).insert(payload as never);
      if (error) { erros.push(`Eletronicos linha ${i + 2}: ${error.message}`); continue; }
    }
    eletrCount++;
  }

  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  return { colaboradores: colabCount, eletronicos: eletrCount, erros };
}

export function getLastSync(): number | null {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LAST_SYNC_KEY) : null;
  return v ? Number(v) : null;
}

export function isAutoSyncEnabled() {
  return typeof localStorage !== "undefined" && localStorage.getItem("spguard-entrada-auto") === "1";
}

export function setAutoSyncEnabled(on: boolean) {
  localStorage.setItem("spguard-entrada-auto", on ? "1" : "0");
}

/** Sincroniza se já passaram 5h desde a última sincronização. */
export async function maybeAutoSync(): Promise<SyncResult | null> {
  if (!isAutoSyncEnabled()) return null;
  const last = getLastSync();
  if (last && Date.now() - last < SYNC_INTERVAL_MS) return null;
  const dir = await getDirHandle();
  if (!dir) return null;
  try {
    return await syncFromEntrada();
  } catch {
    return null;
  }
}
