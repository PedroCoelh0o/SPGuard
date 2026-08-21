import * as XLSX from "xlsx";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { isValidCPF } from "@/lib/format";
import { getDirHandle, ensurePermission, getSavedDirName, hasDesktopFileBridge, desktopFileExists, readDesktopFile, writeDesktopFile } from "@/lib/local-backup";

export const ENTRADA_FILE = "spguard-eletronicos.xlsx";
const LAST_SYNC_KEY = "spguard-entrada-last-sync";
export const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

const COLAB_HEADERS = [
  "nome", "cpf", "rg", "matricula", "empresa", "setor", "cargo", "turno", "escolaridade",
  "data_nascimento", "sexo", "data_admissao", "data_desligamento", "motivo_desligamento", "observacoes", "status",
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
  if (hasDesktopFileBridge()) {
    const dirName = await getSavedDirName();
    if (!dirName) throw new Error("Selecione uma pasta primeiro");
    const path = `${dirName}/SPGuard/${ENTRADA_FILE}`;
    if (await desktopFileExists(ENTRADA_FILE)) return { path, created: false };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COLAB_HEADERS]), "Colaboradores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ELETR_HEADERS]), "Eletronicos");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    await writeDesktopFile(ENTRADA_FILE, new Uint8Array(buf));
    return { path, created: true };
  }

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

export type EntidadeStat = {
  inseridos: number;
  atualizados: number;
  ignorados: number;
  pendentes: number;
  exemplosInseridos: string[];
  exemplosAtualizados: string[];
  exemplosIgnorados: string[];
  exemplosPendentes: string[];
};
export type SyncDetalhe = { colaboradores: EntidadeStat; eletronicos: EntidadeStat };
export type SyncResult = { colaboradores: number; eletronicos: number; erros: string[]; detalhe: SyncDetalhe; dryRun?: boolean };

export type SyncProgress = {
  fase: "lendo" | "validando" | "colaboradores" | "eletronicos" | "concluido";
  atual: number;
  total: number;
  label: string;
};

const EXEMPLOS_MAX = 5;
function novoStat(): EntidadeStat {
  return { inseridos: 0, atualizados: 0, ignorados: 0, pendentes: 0, exemplosInseridos: [], exemplosAtualizados: [], exemplosIgnorados: [], exemplosPendentes: [] };
}
function addInserido(s: EntidadeStat, ref: string) {
  s.inseridos++;
  if (s.exemplosInseridos.length < EXEMPLOS_MAX) s.exemplosInseridos.push(ref);
}
function addAtualizado(s: EntidadeStat, ref: string) {
  s.atualizados++;
  if (s.exemplosAtualizados.length < EXEMPLOS_MAX) s.exemplosAtualizados.push(ref);
}
function addIgnorado(s: EntidadeStat, ref: string) {
  s.ignorados++;
  if (s.exemplosIgnorados.length < EXEMPLOS_MAX) s.exemplosIgnorados.push(ref);
}
function addPendente(s: EntidadeStat, ref: string) {
  s.pendentes++;
  if (s.exemplosPendentes.length < EXEMPLOS_MAX) s.exemplosPendentes.push(ref);
}


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

export type SyncOptions = {
  file?: File;
  /** Só valida: nada é gravado no banco. */
  dryRun?: boolean;
  onProgress?: (p: SyncProgress) => void;
};

/** Lê o arquivo de entrada e sincroniza colaboradores e eletrônicos no banco. */
export async function syncFromEntrada(opts: SyncOptions | File = {}): Promise<SyncResult> {
  const o: SyncOptions = opts instanceof File ? { file: opts } : opts;
  const dryRun = !!o.dryRun;
  const report = (p: SyncProgress) => o.onProgress?.(p);

  report({ fase: "lendo", atual: 0, total: 0, label: "Lendo a planilha..." });
  let file = o.file;
  if (!file) {
    if (hasDesktopFileBridge()) {
      const bytes = await readDesktopFile(ENTRADA_FILE);
      file = new File([bytes], ENTRADA_FILE, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } else {
      const { fh } = await entradaHandle(false);
      file = await fh.getFile();
    }
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const erros: string[] = [];
  const detalhe: SyncDetalhe = {
    colaboradores: novoStat(),
    eletronicos: novoStat(),
  };

  const empresas = await fetchAllRows<{ id: string; razao_social: string; nome_fantasia: string | null }>(
    () => supabase.from("empresas").select("id, razao_social, nome_fantasia") as never,
  );
  const empresaMap = new Map<string, string>();
  for (const e of empresas) {
    empresaMap.set(norm(e.razao_social), e.id);
    if (e.nome_fantasia) empresaMap.set(norm(e.nome_fantasia), e.id);
  }

  let colabs = await fetchAllRows<{ id: string; nome: string; cpf: string | null; matricula: string | null; empresa_id: string }>(
    () => supabase.from("colaboradores").select("id, nome, cpf, matricula, empresa_id").includeDeleted() as never,
  );
  type Pendencia = { id: string; colaborador_id: string; campo: "cpf" | "matricula"; valor_original: string | null; motivo: string; resolvido_em: string | null };
  const pendencias = await fetchAllRows<Pendencia>(
    () => supabase.from("pendencias_cadastro").select("*") as never,
  );
  const pendenciaPorCampo = new Map(pendencias.map((p) => [`${p.colaborador_id}:${p.campo}`, p]));
  const pendenciasDaLinha = (colaboradorId: string, itens: { campo: "cpf" | "matricula"; valor: string | null; motivo: string }[]) =>
    Promise.all(itens.map(async (item) => {
      const key = `${colaboradorId}:${item.campo}`;
      const atual = pendenciaPorCampo.get(key);
      const payload = { valor_original: item.valor, motivo: item.motivo, resolvido_em: null };
      const { error } = atual
        ? await supabase.from("pendencias_cadastro").update(payload as never).eq("id", atual.id)
        : await supabase.from("pendencias_cadastro").insert({ colaborador_id: colaboradorId, campo: item.campo, ...payload } as never);
      if (error) throw error;
    }));
  const resolverPendencia = (colaboradorId: string, campo: "cpf" | "matricula") => {
    const atual = pendenciaPorCampo.get(`${colaboradorId}:${campo}`);
    return atual && !atual.resolvido_em
      ? supabase.from("pendencias_cadastro").update({ resolvido_em: new Date().toISOString() } as never).eq("id", atual.id)
      : Promise.resolve({ error: null });
  };

  // --- Colaboradores ---
  let colabCount = 0;
  const colabRows = rows(wb, "Colaboradores");
  for (const [i, r] of colabRows.entries()) {
    report({ fase: dryRun ? "validando" : "colaboradores", atual: i + 1, total: colabRows.length, label: `Colaboradores ${i + 1}/${colabRows.length}` });
    const get = rowGetter(r);
    const nome = str(get("nome"));
    if (!nome) { addIgnorado(detalhe.colaboradores, `linha ${i + 2}: sem nome`); continue; }
    const empresaNome = str(get("empresa"));
    const empresa_id = empresaNome ? empresaMap.get(norm(empresaNome)) : undefined;
    if (!empresa_id) {
      erros.push(`Colaboradores linha ${i + 2}: empresa não encontrada ("${empresaNome ?? ""}")`);
      addIgnorado(detalhe.colaboradores, `linha ${i + 2}: ${nome} — empresa não encontrada`);
      continue;
    }


    const cpfOriginal = str(get("cpf"));
    const cpfDigits = onlyDigits(cpfOriginal);
    const matriculaOriginal = str(get("matricula"));
    const pendentes: { campo: "cpf" | "matricula"; valor: string | null; motivo: string }[] = [];
    let cpf: string | null = cpfOriginal;
    let matricula: string | null = matriculaOriginal;
    const mesmoNomeEmpresa = (c: typeof colabs[number]) => c.empresa_id === empresa_id && norm(c.nome) === norm(nome);
    // Mantém o comportamento já adotado pelo SPGuard: mesmo nome e mesma
    // empresa representam o mesmo cadastro, mesmo quando um identificador
    // chegou incompleto na planilha.
    let existing: typeof colabs[number] | undefined = colabs.find(mesmoNomeEmpresa);

    if (cpfOriginal && !isValidCPF(cpfDigits)) {
      cpf = null;
      pendentes.push({ campo: "cpf", valor: cpfOriginal, motivo: "CPF inválido ou incompleto" });
    } else if (cpfDigits) {
      const donoCpf = colabs.find((c) => onlyDigits(c.cpf) === cpfDigits);
      if (donoCpf && mesmoNomeEmpresa(donoCpf)) existing = donoCpf;
      else if (donoCpf) {
        cpf = null;
        pendentes.push({ campo: "cpf", valor: cpfOriginal, motivo: `CPF já vinculado a ${donoCpf.nome}` });
      }
    }

    if (matriculaOriginal) {
      const donoMatricula = colabs.find((c) => norm(c.matricula) === norm(matriculaOriginal) && c.empresa_id === empresa_id);
      if (donoMatricula && mesmoNomeEmpresa(donoMatricula) && (!existing || existing.id === donoMatricula.id)) existing = donoMatricula;
      else if (donoMatricula) {
        matricula = null;
        pendentes.push({ campo: "matricula", valor: matriculaOriginal, motivo: `Matrícula já vinculada a ${donoMatricula.nome}` });
      }
    }

    const data_desligamento = parseDate(get("data_desligamento"));
    const payload: Record<string, unknown> = {
      nome, empresa_id,
      cpf, rg: str(get("rg")), matricula,
      setor: str(get("setor")), cargo: str(get("cargo")), turno: str(get("turno")),
      escolaridade: str(get("escolaridade")),
      data_nascimento: parseDate(get("data_nascimento")),
      sexo: str(get("sexo")),
      data_admissao: parseDate(get("data_admissao")),
      data_desligamento,
      motivo_desligamento: str(get("motivo_desligamento")),
      observacoes: str(get("observacoes")),
      status: data_desligamento ? "desligado" : (str(get("status")) ?? "ativo"),
      telefone: str(get("telefone")), celular: str(get("celular")), email: str(get("email")),
      cep: str(get("cep")), rua: str(get("rua")), numero: str(get("numero")),
      bairro: str(get("bairro")), cidade: str(get("cidade")), estado: str(get("estado")),
    };

    const ref = `linha ${i + 2}: ${nome}`;
    let colaboradorId = existing?.id;
    if (existing) {
      if (!dryRun) {
        const { error } = await supabase.from("colaboradores").update({ ...payload, excluido_em: null } as never).includeDeleted().eq("id", existing.id);
        if (error) { erros.push(`Colaboradores linha ${i + 2}: ${error.message}`); addIgnorado(detalhe.colaboradores, `${ref} — ${error.message}`); continue; }
      }
      addAtualizado(detalhe.colaboradores, ref);
    } else {
      if (!dryRun) {
        const { data, error } = await supabase.from("colaboradores").insert(payload as never);
        if (error) { erros.push(`Colaboradores linha ${i + 2}: ${error.message}`); addIgnorado(detalhe.colaboradores, `${ref} — ${error.message}`); continue; }
        colaboradorId = (data as unknown as { id: string }[] | null)?.[0]?.id;
        if (!colaboradorId) { erros.push(`Colaboradores linha ${i + 2}: não foi possível identificar o cadastro criado`); addIgnorado(detalhe.colaboradores, `${ref} — sem identificador`); continue; }
      }
      addInserido(detalhe.colaboradores, ref);
    }
    if (pendentes.length) {
      for (const pendente of pendentes) addPendente(detalhe.colaboradores, `${ref} — ${pendente.motivo}`);
      if (!dryRun && colaboradorId) await pendenciasDaLinha(colaboradorId, pendentes);
    } else if (!dryRun && colaboradorId) {
      if (cpfDigits) await resolverPendencia(colaboradorId, "cpf");
      if (matriculaOriginal) await resolverPendencia(colaboradorId, "matricula");
    }
    colabCount++;
  }

  if (colabCount > 0 && !dryRun) {
    colabs = await fetchAllRows<{ id: string; nome: string; cpf: string | null; matricula: string | null; empresa_id: string }>(
      () => supabase.from("colaboradores").select("id, nome, cpf, matricula, empresa_id").includeDeleted() as never,
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
    () => supabase.from("eletronicos" as never).select("id, imei, numero_serie").includeDeleted() as never,
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
    report({ fase: dryRun ? "validando" : "eletronicos", atual: i + 1, total: eletrRows.length, label: `Eletrônicos ${i + 1}/${eletrRows.length}` });
    const get = rowGetter(r);
    const tipo = norm(get("tipo"));
    if (!tipo && !str(get("imei")) && !str(get("numero_serie"))) { addIgnorado(detalhe.eletronicos, `linha ${i + 2}: linha vazia`); continue; }
    if (!TIPOS.includes(tipo)) {
      erros.push(`Eletronicos linha ${i + 2}: tipo inválido ("${tipo}")`);
      addIgnorado(detalhe.eletronicos, `linha ${i + 2}: tipo inválido ("${tipo}")`);
      continue;
    }

    const cpfDigits = onlyDigits(get("cpf"));
    const matricula = str(get("matricula"));
    const nome = str(get("colaborador"));
    let colaborador_id: string | undefined;
    if (cpfDigits) colaborador_id = byCpf.get(cpfDigits);
    if (!colaborador_id && matricula) colaborador_id = byMat.get(norm(matricula));
    if (!colaborador_id && nome) colaborador_id = byNome.get(norm(nome));
    if (!colaborador_id) {
      erros.push(`Eletronicos linha ${i + 2}: colaborador não encontrado`);
      addIgnorado(detalhe.eletronicos, `linha ${i + 2}: colaborador não encontrado (${nome ?? matricula ?? cpfDigits})`);
      continue;
    }

    const imei = str(get("imei"));
    const numero_serie = str(get("numero_serie"));
    const payload: Record<string, unknown> = {
      colaborador_id, tipo,
      descricao: str(get("descricao")), modelo: str(get("modelo")),
      imei, numero_serie, numero_selo: str(get("numero_selo")),
      contato: str(get("contato")), acessorios: str(get("acessorios")),
    };

    const ref = `linha ${i + 2}: ${tipo}${nome ? ` — ${nome}` : ""}`;
    const existingId = (imei ? byImei.get(onlyDigits(imei)) : undefined) ?? (numero_serie ? bySerie.get(norm(numero_serie)) : undefined);
    if (existingId) {
      if (!dryRun) {
        const { error } = await supabase.from("eletronicos" as never).update({ ...payload, excluido_em: null } as never).includeDeleted().eq("id", existingId);
        if (error) { erros.push(`Eletronicos linha ${i + 2}: ${error.message}`); addIgnorado(detalhe.eletronicos, `${ref} — ${error.message}`); continue; }
      }
      addAtualizado(detalhe.eletronicos, ref);
    } else {
      if (!dryRun) {
        const { error } = await supabase.from("eletronicos" as never).insert(payload as never);
        if (error) { erros.push(`Eletronicos linha ${i + 2}: ${error.message}`); addIgnorado(detalhe.eletronicos, `${ref} — ${error.message}`); continue; }
      }
      addInserido(detalhe.eletronicos, ref);
    }
    eletrCount++;
  }

  if (!dryRun) localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  report({ fase: "concluido", atual: 1, total: 1, label: dryRun ? "Validação concluída" : "Sincronização concluída" });
  return { colaboradores: colabCount, eletronicos: eletrCount, erros, detalhe, dryRun };
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

// ===== Histórico de execuções =====
const HISTORY_KEY = "spguard-entrada-historico";
const HISTORY_MAX = 30;

export type SyncStatus = "ok" | "parcial" | "erro";
export type SyncLog = {
  at: number;
  origem: "manual" | "automatico";
  status: SyncStatus;
  colaboradores: number;
  eletronicos: number;
  erros: string[];
  mensagem?: string;
  detalhe?: SyncDetalhe;
};


export function getSyncHistory(): SyncLog[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as SyncLog[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function clearSyncHistory() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(HISTORY_KEY);
}

export function addSyncLog(log: SyncLog) {
  if (typeof localStorage === "undefined") return;
  const list = [log, ...getSyncHistory()].slice(0, HISTORY_MAX);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

/** Registra o resultado de uma sincronização no histórico e devolve o log criado. */
export function logSyncResult(origem: SyncLog["origem"], r: SyncResult): SyncLog {
  const log: SyncLog = {
    at: Date.now(), origem,
    status: r.erros.length ? "parcial" : "ok",
    colaboradores: r.colaboradores, eletronicos: r.eletronicos,
    erros: r.erros.slice(0, 20),
    detalhe: r.detalhe,
  };
  addSyncLog(log);
  return log;

}

/** Registra uma falha de leitura/execução no histórico. */
export function logSyncError(origem: SyncLog["origem"], mensagem: string): SyncLog {
  const log: SyncLog = {
    at: Date.now(), origem, status: "erro",
    colaboradores: 0, eletronicos: 0, erros: [], mensagem,
  };
  addSyncLog(log);
  return log;
}

export type AutoSyncOutcome =
  | { ran: false }
  | { ran: true; ok: true; result: SyncResult }
  | { ran: true; ok: false; mensagem: string };

/** Sincroniza se já passou 1h desde a última sincronização. */
export async function maybeAutoSync(): Promise<AutoSyncOutcome> {
  if (!isAutoSyncEnabled()) return { ran: false };
  const last = getLastSync();
  if (last && Date.now() - last < SYNC_INTERVAL_MS) return { ran: false };
  const dir = await getDirHandle();
  if (!dir) return { ran: false };
  try {
    const result = await syncFromEntrada();
    logSyncResult("automatico", result);
    return { ran: true, ok: true, result };
  } catch (e) {
    const mensagem = (e as Error)?.message || "Falha ao ler a planilha de entrada";
    logSyncError("automatico", mensagem);
    // evita repetir a tentativa em loop a cada 15 minutos
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    return { ran: true, ok: false, mensagem };
  }
}
