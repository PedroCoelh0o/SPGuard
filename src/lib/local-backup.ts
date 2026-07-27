import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "spguard-config";
const STORE = "handles";
const KEY = "root-dir";

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
  const picker = (window as unknown as { showDirectoryPicker: (o?: { mode?: string }) => Promise<DirHandle> }).showDirectoryPicker;
  const handle = await picker({ mode: "readwrite" });
  await idbSet(KEY, handle);
  return handle.name;
}

async function ensurePermission(handle: DirHandle) {
  if (!handle.queryPermission) return;
  const q = await handle.queryPermission({ mode: "readwrite" });
  if (q === "granted") return;
  const r = await handle.requestPermission?.({ mode: "readwrite" });
  if (r !== "granted") throw new Error("Permissão de escrita negada para a pasta");
}

async function fetchAllData() {
  const [emp, col, ele] = await Promise.all([
    supabase.from("empresas").select("*"),
    supabase.from("colaboradores").select("*"),
    supabase.from("eletronicos" as never).select("*"),
  ]);
  return {
    empresas: (emp.data ?? []) as Record<string, unknown>[],
    colaboradores: (col.data ?? []) as Record<string, unknown>[],
    eletronicos: (ele.data ?? []) as Record<string, unknown>[],
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

type RestoreResult = { empresas: number; colaboradores: number; eletronicos: number };

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

  return {
    empresas: await upsertAll("empresas", empresas),
    colaboradores: await upsertAll("colaboradores", colaboradores),
    eletronicos: await upsertAll("eletronicos", eletronicos),
  };
}
