import * as XLSX from "xlsx";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";

const DB_NAME = "spguard-config";
const STORE = "handles";
const KEY = "root-dir";
let directoryPickerInFlight: Promise<string> | null = null;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T | undefined);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

export function isFsSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function getSavedDirName(): Promise<string | null> {
  try {
    const h = await idbGet<DirHandle>(KEY);
    return h?.name ?? null;
  } catch { return null; }
}

export async function pickAndSaveDir(): Promise<string> {
  // Chromium/Electron permite apenas um seletor de pasta ativo por janela.
  // Reaproveitar a promessa evita erro caso o botão seja clicado duas vezes
  // antes de o diálogo do sistema aparecer.
  if (directoryPickerInFlight) return directoryPickerInFlight;

  const picker = (window as unknown as { showDirectoryPicker: (o?: { mode?: string }) => Promise<DirHandle> }).showDirectoryPicker;
  const request = (async () => {
    const handle = await picker({ mode: "readwrite" });
    await idbSet(KEY, handle);
    return handle.name;
  })();
  directoryPickerInFlight = request;

  try {
    return await request;
  } finally {
    if (directoryPickerInFlight === request) directoryPickerInFlight = null;
  }
}

export async function getDirHandle(): Promise<DirHandle | undefined> {
  try { return await idbGet<DirHandle>(KEY); } catch { return undefined; }
}

export async function ensurePermission(handle: DirHandle) {
  if (!handle.queryPermission) return;
  const q = await handle.queryPermission({ mode: "readwrite" });
  if (q === "granted") return;
  const r = await handle.requestPermission?.({ mode: "readwrite" });
  if (r !== "granted") throw new Error("Permissão de escrita negada para a pasta");
}

async function fetchAllData() {
  const [emp, col, ele] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("empresas").select("*").order("id") as never,
    ),
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("colaboradores").select("*").order("id") as never,
    ),
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("eletronicos" as never).select("*").order("id") as never,
    ),
  ]);
  return {
    empresas: emp,
    colaboradores: col,
    eletronicos: ele,
  };
}

export async function saveBackupNow(): Promise<{ path: string; total: number }> {
  const handle = await idbGet<DirHandle>(KEY);
  if (!handle) throw new Error("Selecione uma pasta primeiro");
  await ensurePermission(handle);
  const sp = await handle.getDirectoryHandle("SPGuard", { create: true });
  const file = await sp.getFileHandle("spguard-dados.xlsx", { create: true });

  const { empresas, colaboradores, eletronicos } = await fetchAllData();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empresas), "Empresas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(colaboradores), "Colaboradores");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eletronicos), "Eletronicos");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const writable = await (file as unknown as { createWritable: () => Promise<{ write: (b: BufferSource) => Promise<void>; close: () => Promise<void> }> }).createWritable();
  await writable.write(buf);
  await writable.close();

  return { path: `${handle.name}/SPGuard/spguard-dados.xlsx`, total: empresas.length + colaboradores.length + eletronicos.length };
}

type RestoreResult = {
  empresas: number;
  colaboradores: number;
  eletronicos: number;
  colaboradoresIgnorados: number;
  eletronicosIgnorados: number;
};

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

function clean(rows: Record<string, unknown>[]) {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = v === "" ? null : v;
    return o;
  });
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function upsertAll(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from(table as never).upsert(chunk as never, { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
    done += chunk.length;
  }
  return done;
}

/** Lê o arquivo de backup (da pasta selecionada ou de um arquivo enviado) e restaura os dados. */
export async function restoreBackup(fileOverride?: File): Promise<RestoreResult> {
  let file: File | undefined = fileOverride;
  if (!file) {
    const handle = await idbGet<DirHandle>(KEY);
    if (!handle) throw new Error("Selecione uma pasta primeiro");
    await ensurePermission(handle);
    const sp = await handle.getDirectoryHandle("SPGuard", { create: false });
    const fh = await sp.getFileHandle("spguard-dados.xlsx", { create: false });
    file = await (fh as unknown as { getFile: () => Promise<File> }).getFile();
  }
  const wb = XLSX.read(await file!.arrayBuffer(), { type: "array" });

  const empresas = clean(sheetRows(wb, "Empresas"));
  const colaboradores = clean(sheetRows(wb, "Colaboradores"));
  const eletronicos = clean(sheetRows(wb, "Eletronicos"));

  // O CPF é único. Um backup pode conter o mesmo colaborador mais de uma
  // vez (por exemplo, após planilhas terem sido mescladas). Mantemos a
  // primeira ocorrência e atualizamos o registro já existente pelo CPF.
  const existentes = await fetchAllRows<{ id: string; cpf: string | null }>(
    () => supabase.from("colaboradores").select("id, cpf") as never,
  );
  const idPorCpf = new Map<string, string>();
  for (const c of existentes) {
    const cpf = digits(c.cpf);
    if (cpf) idPorCpf.set(cpf, c.id);
  }

  const cpfsNoBackup = new Set<string>();
  const idOriginalParaRestaurado = new Map<string, string>();
  const colaboradoresValidos: Record<string, unknown>[] = [];
  let colaboradoresIgnorados = 0;

  for (const colaborador of colaboradores) {
    const originalId = text(colaborador.id);
    const cpf = digits(colaborador.cpf);
    if (cpf && cpfsNoBackup.has(cpf)) {
      colaboradoresIgnorados++;
      continue;
    }
    if (cpf) cpfsNoBackup.add(cpf);

    const idExistente = cpf ? idPorCpf.get(cpf) : undefined;
    const idRestaurado = idExistente ?? originalId;
    if (originalId && idRestaurado) idOriginalParaRestaurado.set(originalId, idRestaurado);
    colaboradoresValidos.push(idExistente ? { ...colaborador, id: idExistente } : colaborador);
  }

  const empresasRestauradas = await upsertAll("empresas", empresas);
  const colaboradoresRestaurados = await upsertAll("colaboradores", colaboradoresValidos);

  // Releitura necessária para cobrir colaboradores novos cujo ID não estava
  // presente na planilha. Eletrônicos sem colaborador válido são ignorados:
  // isso evita a falha NOT NULL e preserva o restante do backup.
  const colaboradoresAposRestore = await fetchAllRows<{ id: string; cpf: string | null }>(
    () => supabase.from("colaboradores").select("id, cpf") as never,
  );
  const idsColaboradores = new Set(colaboradoresAposRestore.map((c) => c.id));
  for (const c of colaboradoresAposRestore) {
    const cpf = digits(c.cpf);
    if (cpf) idPorCpf.set(cpf, c.id);
  }

  const eletronicosValidos: Record<string, unknown>[] = [];
  let eletronicosIgnorados = 0;
  for (const eletronico of eletronicos) {
    const idOriginal = text(eletronico.colaborador_id);
    const colaboradorId = idOriginalParaRestaurado.get(idOriginal) ?? idOriginal;
    if (!colaboradorId || !idsColaboradores.has(colaboradorId)) {
      eletronicosIgnorados++;
      continue;
    }
    eletronicosValidos.push({ ...eletronico, colaborador_id: colaboradorId });
  }

  return {
    empresas: empresasRestauradas,
    colaboradores: colaboradoresRestaurados,
    eletronicos: await upsertAll("eletronicos", eletronicosValidos),
    colaboradoresIgnorados,
    eletronicosIgnorados,
  };
}
