import { applyLocalNetworkSnapshot, readLocalNetworkSnapshot, supabase } from "@/integrations/local-db/client";

type Table = "empresas" | "colaboradores" | "eletronicos" | "colaborador_documentos" | "historico_alteracoes" | "ocorrencias" | "ocorrencia_arquivos" | "ocorrencias_protecao";
type Row = Record<string, unknown> & { id: string };
type Tables = Record<Table, Row[]>;
type Snapshot = { tables: Tables };
type SharedState = { version: 1; updatedAt: string; tables: Tables };
export type NetworkConflict = { id: string; table: Table; recordId: string; local: Row; remote: Row; detectedAt: string };
export type NetworkSyncResult = { created: boolean; sent: number; received: number; files: number; conflicts: NetworkConflict[]; warnings: string[] };

declare global {
  interface Window {
    spguardNetwork?: {
      read: (relative: string) => Promise<Uint8Array | null>;
      exists: (relative: string) => Promise<boolean>;
      write: (relative: string, contents: Uint8Array) => Promise<void>;
      acquireLock: () => Promise<boolean>;
      releaseLock: () => Promise<void>;
    };
  }
}

const TABLES: Table[] = [
  "empresas", "colaboradores", "eletronicos", "colaborador_documentos",
  "historico_alteracoes", "ocorrencias", "ocorrencia_arquivos", "ocorrencias_protecao",
];
const STATE_FILE = "estado.json";
const CONFLICT_FILE = "conflitos.json";
const BASELINE_KEY = "spguard-rede-local-base-v1";
const CONFLICTS_KEY = "spguard-rede-local-conflitos-v1";
const AUTO_KEY = "spguard-rede-local-auto";
const LAST_KEY = "spguard-rede-local-ultima";
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

function emptyTables(): Tables {
  return Object.fromEntries(TABLES.map((table) => [table, []])) as Tables;
}

function emptySnapshot(): Snapshot { return { tables: emptyTables() }; }
function textBytes(text: string) { return new TextEncoder().encode(text); }
function readText(bytes: Uint8Array) { return new TextDecoder().decode(bytes); }
function safeJson<T>(raw: Uint8Array | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(readText(raw)) as T; } catch { return null; }
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function fingerprint(row: Row) { return stable(row); }
function now() { return new Date().toISOString(); }
function network() {
  if (!window.spguardNetwork) throw new Error("A sincronização por rede está disponível somente no instalador do SPGuard.");
  return window.spguardNetwork;
}

type Baseline = Partial<Record<Table, Record<string, string>>>;
function baseline(): Baseline {
  try { return JSON.parse(localStorage.getItem(BASELINE_KEY) || "{}") as Baseline; } catch { return {}; }
}
function setBaseline(value: Baseline) { localStorage.setItem(BASELINE_KEY, JSON.stringify(value)); }
export function getNetworkConflicts(): NetworkConflict[] {
  try { return JSON.parse(localStorage.getItem(CONFLICTS_KEY) || "[]") as NetworkConflict[]; } catch { return []; }
}
function setConflicts(value: NetworkConflict[]) { localStorage.setItem(CONFLICTS_KEY, JSON.stringify(value)); }
function uniqueConflicts(value: NetworkConflict[]) {
  const seen = new Set<string>();
  return value.filter((item) => {
    const key = `${item.table}:${item.recordId}:${fingerprint(item.local)}:${fingerprint(item.remote)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeState(input: unknown): SharedState | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<SharedState>;
  if (candidate.version !== 1 || !candidate.tables || typeof candidate.tables !== "object") return null;
  const tables = emptyTables();
  for (const table of TABLES) {
    const rows = (candidate.tables as Partial<Tables>)[table];
    tables[table] = Array.isArray(rows) ? rows.filter((row): row is Row => !!row && typeof row === "object" && !!(row as Row).id) : [];
  }
  return { version: 1, updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now(), tables };
}

function assetReferences(snapshot: Snapshot) {
  const refs: Array<{ bucket: "colaborador-fotos" | "colaborador-documentos" | "ocorrencia-evidencias"; path: string }> = [];
  for (const row of snapshot.tables.colaboradores) if (typeof row.foto_url === "string" && row.foto_url) refs.push({ bucket: "colaborador-fotos", path: row.foto_url });
  for (const row of snapshot.tables.colaborador_documentos) if (typeof row.storage_path === "string" && row.storage_path) refs.push({ bucket: "colaborador-documentos", path: row.storage_path });
  for (const row of snapshot.tables.ocorrencia_arquivos) if (typeof row.storage_path === "string" && row.storage_path) refs.push({ bucket: "ocorrencia-evidencias", path: row.storage_path });
  return refs;
}
function assetFile(bucket: string, storagePath: string) {
  const encoded = btoa(unescape(encodeURIComponent(storagePath))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c] || "");
  return `arquivos/${bucket}/${encoded}.bin`;
}
async function readLocalAsset(bucket: "colaborador-fotos" | "colaborador-documentos" | "ocorrencia-evidencias", path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data) return null;
  try { return new Uint8Array(await (await fetch(data.signedUrl)).arrayBuffer()); }
  finally { URL.revokeObjectURL(data.signedUrl); }
}
async function putLocalAsset(bucket: "colaborador-fotos" | "colaborador-documentos" | "ocorrencia-evidencias", path: string, bytes: Uint8Array) {
  const result = await supabase.storage.from(bucket).upload(path, new File([bytes], path.split("/").pop() || "arquivo.bin", { type: "application/octet-stream" }), { upsert: true });
  if (result.error) throw new Error(result.error.message);
}

function merge(local: Snapshot, remote: SharedState, previous: Baseline) {
  const master = emptyTables();
  const forLocal = emptyTables();
  const nextBase: Baseline = {};
  const conflicts: NetworkConflict[] = [];
  let sent = 0;
  let received = 0;
  for (const table of TABLES) {
    const localRows = new Map(local.tables[table].map((row) => [row.id, row]));
    const remoteRows = new Map(remote.tables[table].map((row) => [row.id, row]));
    const base = previous[table] || {};
    const ids = new Set([...localRows.keys(), ...remoteRows.keys()]);
    const next: Record<string, string> = {};
    for (const id of ids) {
      const left = localRows.get(id);
      const right = remoteRows.get(id);
      if (!left && right) { master[table].push(right); forLocal[table].push(right); next[id] = fingerprint(right); received++; continue; }
      if (left && !right) { master[table].push(left); forLocal[table].push(left); next[id] = fingerprint(left); sent++; continue; }
      if (!left || !right) continue;
      const leftHash = fingerprint(left);
      const rightHash = fingerprint(right);
      if (leftHash === rightHash) { master[table].push(right); forLocal[table].push(right); next[id] = rightHash; continue; }
      const prior = base[id];
      const localChanged = !prior || prior !== leftHash;
      const remoteChanged = !prior || prior !== rightHash;
      if (localChanged && remoteChanged) {
        master[table].push(right);
        forLocal[table].push(left);
        conflicts.push({ id: crypto.randomUUID(), table, recordId: id, local: left, remote: right, detectedAt: now() });
        continue;
      }
      if (localChanged) { master[table].push(left); forLocal[table].push(left); next[id] = leftHash; sent++; }
      else { master[table].push(right); forLocal[table].push(right); next[id] = rightHash; received++; }
    }
    nextBase[table] = next;
  }
  return { master: { version: 1 as const, updatedAt: now(), tables: master }, forLocal: { tables: forLocal }, baseline: nextBase, conflicts, sent, received };
}

async function syncAssets(master: Snapshot, original: Snapshot) {
  const bridge = network();
  const originalSet = new Set(assetReferences(original).map((ref) => `${ref.bucket}:${ref.path}`));
  let files = 0;
  for (const ref of assetReferences(master)) {
    const relative = assetFile(ref.bucket, ref.path);
    const present = await bridge.exists(relative);
    if (originalSet.has(`${ref.bucket}:${ref.path}`)) {
      if (!present) {
        const data = await readLocalAsset(ref.bucket, ref.path);
        if (data) { await bridge.write(relative, data); files++; }
      }
    } else if (present) {
      const data = await bridge.read(relative);
      if (data) { await putLocalAsset(ref.bucket, ref.path, data); files++; }
    }
  }
  return files;
}

export async function syncLocalNetwork(): Promise<NetworkSyncResult> {
  const bridge = network();
  if (!(await bridge.acquireLock())) throw new Error("Outro notebook já está sincronizando. Aguarde alguns segundos e tente novamente.");
  try {
    const local = await readLocalNetworkSnapshot() as Snapshot;
    const raw = safeJson<SharedState>(await bridge.read(STATE_FILE));
    const remote = normalizeState(raw);
    if (!remote) {
      const first: SharedState = { version: 1, updatedAt: now(), tables: local.tables };
      await bridge.write(STATE_FILE, textBytes(JSON.stringify(first)));
      const files = await syncAssets(local, local);
      const firstBaseline: Baseline = {};
      for (const table of TABLES) firstBaseline[table] = Object.fromEntries(local.tables[table].map((row) => [row.id, fingerprint(row)]));
      setBaseline(firstBaseline);
      setConflicts([]);
      localStorage.setItem(LAST_KEY, String(Date.now()));
      return { created: true, sent: Object.values(local.tables).reduce((total, rows) => total + rows.length, 0), received: 0, files, conflicts: [], warnings: [] };
    }
    const combined = merge(local, remote, baseline());
    await bridge.write(STATE_FILE, textBytes(JSON.stringify(combined.master)));
    const applied = await applyLocalNetworkSnapshot(combined.forLocal);
    const files = await syncAssets(combined.master, local);
    const allConflicts = uniqueConflicts([...getNetworkConflicts(), ...combined.conflicts]);
    setConflicts(allConflicts);
    setBaseline(combined.baseline);
    await bridge.write(CONFLICT_FILE, textBytes(JSON.stringify(allConflicts)));
    localStorage.setItem(LAST_KEY, String(Date.now()));
    return { created: false, sent: combined.sent, received: combined.received, files, conflicts: allConflicts, warnings: applied.errors };
  } finally {
    await bridge.releaseLock();
  }
}

export async function resolveNetworkConflict(conflict: NetworkConflict, choice: "local" | "network") {
  const bridge = network();
  if (!(await bridge.acquireLock())) throw new Error("Outro notebook já está sincronizando. Aguarde alguns segundos e tente novamente.");
  try {
    const remote = normalizeState(safeJson<SharedState>(await bridge.read(STATE_FILE)));
    if (!remote) throw new Error("Não foi possível localizar os dados compartilhados.");
    const current = remote.tables[conflict.table].find((row) => row.id === conflict.recordId);
    if (!current || fingerprint(current) !== fingerprint(conflict.remote)) throw new Error("Este registro mudou em outro notebook. Sincronize novamente antes de decidir.");
    const chosen = choice === "local" ? conflict.local : conflict.remote;
    remote.tables[conflict.table] = remote.tables[conflict.table].map((row) => row.id === chosen.id ? chosen : row);
    remote.updatedAt = now();
    await bridge.write(STATE_FILE, textBytes(JSON.stringify(remote)));
    const one = emptySnapshot();
    one.tables[conflict.table] = [chosen];
    const result = await applyLocalNetworkSnapshot(one);
    if (result.errors.length) throw new Error(result.errors[0]);
    const remaining = getNetworkConflicts().filter((item) => item.id !== conflict.id);
    setConflicts(remaining);
    await bridge.write(CONFLICT_FILE, textBytes(JSON.stringify(remaining)));
    const base = baseline();
    base[conflict.table] = { ...(base[conflict.table] || {}), [conflict.recordId]: fingerprint(chosen) };
    setBaseline(base);
  } finally { await bridge.releaseLock(); }
}

export function isNetworkAutoSyncEnabled() { return localStorage.getItem(AUTO_KEY) === "1"; }
export function setNetworkAutoSyncEnabled(enabled: boolean) { localStorage.setItem(AUTO_KEY, enabled ? "1" : "0"); }
export async function maybeAutoNetworkSync() {
  if (!isNetworkAutoSyncEnabled()) return null;
  const last = Number(localStorage.getItem(LAST_KEY) || 0);
  if (last && Date.now() - last < SYNC_INTERVAL_MS) return null;
  try { return await syncLocalNetwork(); } catch { return null; }
}
