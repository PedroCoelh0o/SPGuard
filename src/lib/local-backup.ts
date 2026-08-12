import * as XLSX from "xlsx";
import { unzipSync, zipSync } from "fflate";
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

type DesktopFiles = {
  selectDirectory: () => Promise<string>;
  getDirectoryName: () => Promise<string | null>;
  fileExists: (name: string) => Promise<boolean>;
  writeFile: (name: string, contents: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
};

const BACKUP_XLSX = "spguard-dados.xlsx";
const BACKUP_ZIP = "spguard-backup-completo.zip";
const BACKUP_ENCRYPTED = "spguard-backup-criptografado.spguard";
const BACKUP_KDF_ITERATIONS = 600_000;

type EncryptedBackup = {
  version: 1;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

type DocumentoBackup = {
  id: string;
  colaborador_id: string;
  nome: string;
  tipo: string | null;
  storage_path: string;
  tamanho: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  arquivo_backup?: string;
};

declare global {
  interface Window { spguardFiles?: DesktopFiles; }
}

function desktopFiles() {
  return typeof window !== "undefined" ? window.spguardFiles : undefined;
}

export function hasDesktopFileBridge() {
  return !!desktopFiles();
}

export async function desktopFileExists(name: string) {
  const files = desktopFiles();
  if (!files) throw new Error("Recurso de arquivos do aplicativo indisponível");
  return files.fileExists(name);
}

export async function writeDesktopFile(name: string, contents: Uint8Array) {
  const files = desktopFiles();
  if (!files) throw new Error("Recurso de arquivos do aplicativo indisponível");
  await files.writeFile(name, contents);
}

export async function readDesktopFile(name: string) {
  const files = desktopFiles();
  if (!files) throw new Error("Recurso de arquivos do aplicativo indisponível");
  return files.readFile(name);
}

export function isFsSupported() {
  return hasDesktopFileBridge() || (typeof window !== "undefined" && "showDirectoryPicker" in window);
}

export async function getSavedDirName(): Promise<string | null> {
  const files = desktopFiles();
  if (files) return files.getDirectoryName();
  try {
    const h = await idbGet<DirHandle>(KEY);
    return h?.name ?? null;
  } catch { return null; }
}

export async function pickAndSaveDir(): Promise<string> {
  const files = desktopFiles();
  if (files) return files.selectDirectory();

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
  const [emp, col, ele, docs, historico] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("empresas").select("*").order("id") as never,
    ),
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("colaboradores").select("*").includeDeleted().order("id") as never,
    ),
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("eletronicos" as never).select("*").includeDeleted().order("id") as never,
    ),
    fetchAllRows<DocumentoBackup>(
      () => supabase.from("colaborador_documentos" as never).select("*").order("id") as never,
    ),
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from("historico_alteracoes").select("*").order("created_at", { ascending: false }) as never,
    ),
  ]);
  return {
    empresas: emp,
    colaboradores: col,
    eletronicos: ele,
    documentos: docs,
    historico,
  };
}

function createBackupWorkbook(empresas: Record<string, unknown>[], colaboradores: Record<string, unknown>[], eletronicos: Record<string, unknown>[], historico: Record<string, unknown>[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empresas), "Empresas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(colaboradores), "Colaboradores");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eletronicos), "Eletronicos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historico), "Historico");
  return wb;
}

async function writeToBackupDirectory(name: string, contents: Uint8Array): Promise<string> {
  const files = desktopFiles();
  if (files) {
    const directoryName = await files.getDirectoryName();
    if (!directoryName) throw new Error("Selecione uma pasta primeiro");
    await files.writeFile(name, contents);
    return `${directoryName}/SPGuard/${name}`;
  }

  const handle = await idbGet<DirHandle>(KEY);
  if (!handle) throw new Error("Selecione uma pasta primeiro");
  await ensurePermission(handle);
  const sp = await handle.getDirectoryHandle("SPGuard", { create: true });
  const file = await sp.getFileHandle(name, { create: true });
  const writable = await (file as unknown as { createWritable: () => Promise<{ write: (b: BufferSource) => Promise<void>; close: () => Promise<void> }> }).createWritable();
  await writable.write(contents);
  await writable.close();
  return `${handle.name}/SPGuard/${name}`;
}

export async function saveBackupNow(): Promise<{ path: string; total: number }> {
  const { empresas, colaboradores, eletronicos, historico } = await fetchAllData();
  const wb = createBackupWorkbook(empresas, colaboradores, eletronicos, historico);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const path = await writeToBackupDirectory(BACKUP_XLSX, new Uint8Array(buf));
  return { path, total: empresas.length + colaboradores.length + eletronicos.length };
}

function safeBackupFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_") || "documento";
}

function bytesToBase64(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(parts.join(""));
}

function base64ToBytes(base64: string) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}

async function passwordKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: BACKUP_KDF_ITERATIONS }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptBackup(zip: Uint8Array, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, zip));
  const envelope: EncryptedBackup = { version: 1, algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations: BACKUP_KDF_ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

async function decryptBackup(file: File, password: string) {
  let envelope: EncryptedBackup;
  try { envelope = JSON.parse(new TextDecoder().decode(await file.arrayBuffer())) as EncryptedBackup; } catch { throw new Error("Arquivo de backup criptografado inválido"); }
  if (envelope.version !== 1 || envelope.algorithm !== "AES-256-GCM" || envelope.kdf !== "PBKDF2-SHA-256" || envelope.iterations !== BACKUP_KDF_ITERATIONS) throw new Error("Formato de backup criptografado não suportado");
  try {
    const key = await passwordKey(password, base64ToBytes(envelope.salt));
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext)));
  } catch { throw new Error("Senha incorreta ou arquivo de backup alterado"); }
}

async function createFullBackupZip(onProgress?: (done: number, total: number) => void): Promise<{ contents: Uint8Array; total: number; documentos: number }> {
  const { empresas, colaboradores, eletronicos, documentos, historico } = await fetchAllData();
  const wb = createBackupWorkbook(empresas, colaboradores, eletronicos, historico);
  const entries: Record<string, Uint8Array> = {
    [BACKUP_XLSX]: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer),
  };
  const documentosPlanilha: DocumentoBackup[] = [];
  const nomePorColaborador = new Map(colaboradores.map((c) => [String(c.id ?? ""), safeBackupFileName(String(c.nome ?? "colaborador"))]));

  for (const [index, documento] of documentos.entries()) {
    onProgress?.(index, documentos.length);
    const { data, error } = await supabase.storage.from("colaborador-documentos").createSignedUrl(documento.storage_path, 60);
    if (error || !data) throw new Error(`Não foi possível ler o documento "${documento.nome}"`);
    try {
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error(`Não foi possível ler o documento "${documento.nome}"`);
      const pastaColaborador = nomePorColaborador.get(documento.colaborador_id) ?? "colaborador-sem-nome";
      const backupPath = `documentos/${pastaColaborador}/${documento.id}-${safeBackupFileName(documento.nome)}`;
      entries[backupPath] = new Uint8Array(await response.arrayBuffer());
      documentosPlanilha.push({ ...documento, arquivo_backup: backupPath });
    } finally {
      URL.revokeObjectURL(data.signedUrl);
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(documentosPlanilha), "Documentos");
  entries[BACKUP_XLSX] = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  onProgress?.(documentos.length, documentos.length);
  return { contents: zipSync(entries, { level: 6 }), total: empresas.length + colaboradores.length + eletronicos.length, documentos: documentosPlanilha.length };
}

/** Cria um único ZIP local com a planilha de dados e todos os documentos anexados. */
export async function saveFullBackupNow(onProgress?: (done: number, total: number) => void): Promise<{ path: string; total: number; documentos: number }> {
  const backup = await createFullBackupZip(onProgress);
  const path = await writeToBackupDirectory(BACKUP_ZIP, backup.contents);
  return { path, total: backup.total, documentos: backup.documentos };
}

/** Cria um backup completo criptografado. A senha não é salva pelo SPGuard. */
export async function saveEncryptedFullBackup(password: string, onProgress?: (done: number, total: number) => void): Promise<{ path: string; total: number; documentos: number }> {
  if (password.length < 12) throw new Error("Use uma senha com pelo menos 12 caracteres");
  const backup = await createFullBackupZip(onProgress);
  const path = await writeToBackupDirectory(BACKUP_ENCRYPTED, await encryptBackup(backup.contents, password));
  return { path, total: backup.total, documentos: backup.documentos };
}

type RestoreResult = {
  empresas: number;
  colaboradores: number;
  eletronicos: number;
  historico: number;
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
    const files = desktopFiles();
    if (files) {
      const bytes = await files.readFile("spguard-dados.xlsx");
      file = new File([bytes], "spguard-dados.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } else {
    const handle = await idbGet<DirHandle>(KEY);
    if (!handle) throw new Error("Selecione uma pasta primeiro");
    await ensurePermission(handle);
    const sp = await handle.getDirectoryHandle("SPGuard", { create: false });
    const fh = await sp.getFileHandle("spguard-dados.xlsx", { create: false });
    file = await (fh as unknown as { getFile: () => Promise<File> }).getFile();
    }
  }
  const wb = XLSX.read(await file!.arrayBuffer(), { type: "array" });

  const empresas = clean(sheetRows(wb, "Empresas"));
  const colaboradores = clean(sheetRows(wb, "Colaboradores"));
  const eletronicos = clean(sheetRows(wb, "Eletronicos"));
  const historico = clean(sheetRows(wb, "Historico"));

  // O CPF é único. Um backup pode conter o mesmo colaborador mais de uma
  // vez (por exemplo, após planilhas terem sido mescladas). Mantemos a
  // primeira ocorrência e atualizamos o registro já existente pelo CPF.
  const existentes = await fetchAllRows<{ id: string; cpf: string | null }>(
    () => supabase.from("colaboradores").select("id, cpf").includeDeleted() as never,
  );
  const idPorCpf = new Map<string, string>();
  const cpfPorId = new Map<string, string>();
  for (const c of existentes) {
    const cpf = digits(c.cpf);
    if (cpf) idPorCpf.set(cpf, c.id);
    cpfPorId.set(c.id, cpf);
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
    // Um mesmo ID pode apontar para outro colaborador em uma instalação
    // diferente. Nesse caso, manter o ID do arquivo faria o SQLite tentar
    // atualizar o registro errado e poderia violar o CPF único. Geramos um
    // novo ID, mantendo o vínculo correto de eletrônicos e documentos.
    const cpfNoIdOriginal = originalId ? cpfPorId.get(originalId) : undefined;
    const idEmConflito = !!originalId && cpfNoIdOriginal !== undefined && !!cpf && !!cpfNoIdOriginal && cpfNoIdOriginal !== cpf;
    const idRestaurado = idExistente ?? (idEmConflito ? crypto.randomUUID() : (originalId || crypto.randomUUID()));
    if (originalId && idRestaurado) idOriginalParaRestaurado.set(originalId, idRestaurado);
    colaboradoresValidos.push({ ...colaborador, id: idRestaurado });
  }

  const empresasRestauradas = await upsertAll("empresas", empresas);
  const colaboradoresRestaurados = await upsertAll("colaboradores", colaboradoresValidos);

  // Releitura necessária para cobrir colaboradores novos cujo ID não estava
  // presente na planilha. Eletrônicos sem colaborador válido são ignorados:
  // isso evita a falha NOT NULL e preserva o restante do backup.
  const colaboradoresAposRestore = await fetchAllRows<{ id: string; cpf: string | null }>(
    () => supabase.from("colaboradores").select("id, cpf").includeDeleted() as never,
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

  const historicoRestaurado = await upsertAll("historico_alteracoes", historico);

  return {
    empresas: empresasRestauradas,
    colaboradores: colaboradoresRestaurados,
    eletronicos: await upsertAll("eletronicos", eletronicosValidos),
    historico: historicoRestaurado,
    colaboradoresIgnorados,
    eletronicosIgnorados,
  };
}

export type FullRestoreResult = RestoreResult & { documentos: number; documentosIgnorados: number };

/** Restaura o ZIP criado pelo backup completo. Nenhum arquivo sai do computador. */
export async function restoreFullBackup(file: File): Promise<FullRestoreResult> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const xlsx = entries[BACKUP_XLSX];
  if (!xlsx) throw new Error("O ZIP não contém o arquivo spguard-dados.xlsx");

  const dataFile = new File([xlsx], BACKUP_XLSX, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const result = await restoreBackup(dataFile);
  const wb = XLSX.read(xlsx, { type: "array" });
  const documentos = clean(sheetRows(wb, "Documentos")) as DocumentoBackup[];
  if (documentos.length === 0) return { ...result, documentos: 0, documentosIgnorados: 0 };

  const colaboradoresNoBackup = clean(sheetRows(wb, "Colaboradores"));
  const colaboradoresAtuais = await fetchAllRows<{ id: string; cpf: string | null }>(
    () => supabase.from("colaboradores").select("id, cpf") as never,
  );
  const porCpf = new Map<string, string>();
  for (const colaborador of colaboradoresAtuais) {
    const cpf = digits(colaborador.cpf);
    if (cpf) porCpf.set(cpf, colaborador.id);
  }
  const idsAtuais = new Set(colaboradoresAtuais.map((c) => c.id));
  const idOriginalParaRestaurado = new Map<string, string>();
  for (const colaborador of colaboradoresNoBackup) {
    const originalId = text(colaborador.id);
    const cpf = digits(colaborador.cpf);
    const restoredId = (cpf ? porCpf.get(cpf) : undefined) ?? originalId;
    if (originalId && restoredId && idsAtuais.has(restoredId)) idOriginalParaRestaurado.set(originalId, restoredId);
  }

  let documentosRestaurados = 0;
  let documentosIgnorados = 0;
  for (const documento of documentos) {
    const colaboradorId = idOriginalParaRestaurado.get(text(documento.colaborador_id)) ?? text(documento.colaborador_id);
    const backupPath = text(documento.arquivo_backup);
    const contents = backupPath ? entries[backupPath] : undefined;
    if (!colaboradorId || !idsAtuais.has(colaboradorId) || !contents) {
      documentosIgnorados++;
      continue;
    }

    const nome = text(documento.nome) || "documento";
    const storagePath = `${colaboradorId}/${text(documento.id) || globalThis.crypto.randomUUID()}-${safeBackupFileName(nome)}`;
    const contentType = text(documento.tipo) || "application/octet-stream";
    const upload = await supabase.storage.from("colaborador-documentos").upload(storagePath, new File([contents], nome, { type: contentType }), { contentType });
    if (upload.error) throw new Error(`Documento "${nome}": ${upload.error.message}`);
    const { error } = await supabase.from("colaborador_documentos" as never).upsert([{
      id: text(documento.id) || undefined,
      colaborador_id: colaboradorId,
      nome,
      tipo: documento.tipo || null,
      storage_path: storagePath,
      tamanho: contents.length,
      uploaded_by: documento.uploaded_by || null,
      created_at: documento.created_at || undefined,
    }] as never, { onConflict: "id" });
    if (error) throw new Error(`Documento "${nome}": ${error.message}`);
    documentosRestaurados++;
  }

  return { ...result, documentos: documentosRestaurados, documentosIgnorados };
}

/** Descriptografa localmente e restaura o backup protegido por senha. */
export async function restoreEncryptedFullBackup(file: File, password: string): Promise<FullRestoreResult> {
  const zip = await decryptBackup(file, password);
  return restoreFullBackup(new File([zip], BACKUP_ZIP, { type: "application/zip" }));
}
