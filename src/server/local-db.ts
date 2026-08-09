// Módulo SERVER-ONLY: nunca importar isso de código que roda no navegador.
// Só é referenciado de dentro de handlers de createServerFn (src/integrations/local-db/server-fns.ts),
// então o bundler do TanStack Start já garante que ele não vai parar no bundle do cliente.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Localização dos arquivos (banco + documentos anexados)
// ---------------------------------------------------------------------------

function resolveDataDir(): string {
  // Definido pelo electron/main.cjs em produção (pasta de dados do usuário
  // do Windows). Em desenvolvimento, usa uma pasta local no projeto.
  return process.env.LOCAL_DATA_DIR || path.join(process.cwd(), "local-data");
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, "database.sqlite3");
const FILES_DIR = path.join(DATA_DIR, "files");
const STORAGE_BUCKETS = new Set(["colaborador-fotos", "colaborador-documentos"]);
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Conexão + schema
// ---------------------------------------------------------------------------

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  dbInstance = db;
  return db;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT UNIQUE,
  responsavel TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','inativa')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  rg TEXT,
  matricula TEXT,
  cargo TEXT,
  setor TEXT,
  escolaridade TEXT,
  data_nascimento TEXT,
  sexo TEXT,
  turno TEXT,
  data_admissao TEXT,
  data_desligamento TEXT,
  motivo_desligamento TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','desligado')),
  telefone TEXT,
  celular TEXT,
  email TEXT,
  cep TEXT,
  rua TEXT,
  numero TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  foto_url TEXT,
  eletronicos_autorizado INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_colab_empresa ON colaboradores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_colab_status ON colaboradores(status);
CREATE INDEX IF NOT EXISTS idx_colab_nome ON colaboradores(nome);

CREATE TABLE IF NOT EXISTS colaborador_documentos (
  id TEXT PRIMARY KEY,
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT,
  storage_path TEXT NOT NULL,
  tamanho INTEGER,
  uploaded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_colab ON colaborador_documentos(colaborador_id);

CREATE TABLE IF NOT EXISTS eletronicos (
  id TEXT PRIMARY KEY,
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('celular','notebook','tablet')),
  descricao TEXT,
  imei TEXT,
  modelo TEXT,
  contato TEXT,
  numero_selo TEXT,
  numero_serie TEXT,
  acessorios TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eletronicos_colab ON eletronicos(colaborador_id);

CREATE TABLE IF NOT EXISTS audit_exportacoes (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  modulo TEXT NOT NULL DEFAULT 'colaboradores',
  filtros TEXT NOT NULL DEFAULT '{}',
  total_registros INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_exportacoes(created_at DESC);
`;

// Nota: no Postgres original, "touch updated_at" e "auto-status desligado ao
// preencher data_desligamento" eram triggers de banco. Aqui são aplicados em
// runInsert/runUpdate (ver applyBusinessRules abaixo) — evita qualquer risco
// de recursão de triggers do SQLite e fica mais fácil de auditar.
function applyBusinessRules(table: string, payload: Record<string, unknown>) {
  if (table === "colaboradores" && payload.data_desligamento) {
    payload.status = "desligado";
  }
}

// ---------------------------------------------------------------------------
// Metadados de colunas (tipos especiais: boolean / json) por tabela
// ---------------------------------------------------------------------------

const TABLE_COLUMNS: Record<string, string[]> = {
  empresas: ["id", "razao_social", "nome_fantasia", "cnpj", "responsavel", "telefone", "email", "endereco", "cidade", "estado", "status", "created_at", "updated_at"],
  colaboradores: ["id", "empresa_id", "nome", "cpf", "rg", "matricula", "cargo", "setor", "escolaridade", "data_nascimento", "sexo", "turno", "data_admissao", "data_desligamento", "motivo_desligamento", "status", "telefone", "celular", "email", "cep", "rua", "numero", "bairro", "cidade", "estado", "foto_url", "eletronicos_autorizado", "created_at", "updated_at"],
  colaborador_documentos: ["id", "colaborador_id", "nome", "tipo", "storage_path", "tamanho", "uploaded_by", "created_at", "updated_at"],
  eletronicos: ["id", "colaborador_id", "tipo", "descricao", "imei", "modelo", "contato", "numero_selo", "numero_serie", "acessorios", "created_at", "updated_at"],
  audit_exportacoes: ["id", "tipo", "modulo", "filtros", "total_registros", "created_at"],
};

const BOOLEAN_COLUMNS = new Set(["eletronicos_autorizado"]);
const JSON_COLUMNS = new Set(["filtros"]);

function assertTable(table: string): asserts table is keyof typeof TABLE_COLUMNS {
  if (!Object.prototype.hasOwnProperty.call(TABLE_COLUMNS, table)) {
    throw new Error(`Tabela desconhecida: ${table}`);
  }
}

function assertColumn(table: string, col: string) {
  if (!TABLE_COLUMNS[table].includes(col)) {
    throw new Error(`Coluna desconhecida em ${table}: ${col}`);
  }
}

function toSqlValue(col: string, val: unknown): unknown {
  if (val === undefined) return null;
  if (BOOLEAN_COLUMNS.has(col)) return val ? 1 : 0;
  if (JSON_COLUMNS.has(col)) return JSON.stringify(val ?? {});
  return val;
}

function fromSqlRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const col of TABLE_COLUMNS[table]) {
    if (!(col in out)) continue;
    if (BOOLEAN_COLUMNS.has(col)) out[col] = !!out[col];
    if (JSON_COLUMNS.has(col) && typeof out[col] === "string") {
      try { out[col] = JSON.parse(out[col] as string); } catch { /* mantém string */ }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Descritor de consulta (compatível com o formato usado pelo shim do cliente)
// ---------------------------------------------------------------------------

export type Filter =
  | { type: "eq"; col: string; val: unknown }
  | { type: "in"; col: string; vals: unknown[] };

export type QueryDescriptor = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  filters?: Filter[];
  order?: { col: string; ascending: boolean };
  range?: { from: number; to: number };
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
};

export type QueryResult = { data: unknown; error: { message: string } | null };

function nowIso(): string {
  return new Date().toISOString();
}

function buildWhere(table: string, filters: Filter[] | undefined): { clause: string; params: unknown[] } {
  if (!filters || filters.length === 0) return { clause: "", params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const f of filters) {
    assertColumn(table, f.col);
    if (f.type === "eq") {
      parts.push(`${f.col} = ?`);
      params.push(toSqlValue(f.col, f.val));
    } else if (f.type === "in") {
      if (f.vals.length === 0) { parts.push("0"); continue; }
      parts.push(`${f.col} IN (${f.vals.map(() => "?").join(",")})`);
      params.push(...f.vals.map((v) => toSqlValue(f.col, v)));
    }
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

function selectColumns(table: string, columns: string | undefined): string {
  if (!columns || columns.trim() === "*") return "*";
  const cols = columns.split(",").map((c) => c.trim()).filter(Boolean);
  for (const c of cols) assertColumn(table, c);
  return cols.join(", ");
}

function runSelect(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const cols = selectColumns(table, q.columns);
  const { clause, params } = buildWhere(table, q.filters);
  let sql = `SELECT ${cols} FROM ${table} ${clause}`;
  if (q.order) {
    assertColumn(table, q.order.col);
    sql += ` ORDER BY ${q.order.col} ${q.order.ascending === false ? "DESC" : "ASC"}`;
  }
  if (q.range) {
    const limit = q.range.to - q.range.from + 1;
    sql += ` LIMIT ${Number(limit)} OFFSET ${Number(q.range.from)}`;
  }
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => fromSqlRow(table, r));
}

function runInsert(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const rows = Array.isArray(q.values) ? q.values : q.values ? [q.values] : [];
  const inserted: unknown[] = [];
  const insertOne = db.transaction((items: Record<string, unknown>[]) => {
    for (const item of items) {
      const id = (item.id as string) || crypto.randomUUID();
      const ts = nowIso();
      const payload: Record<string, unknown> = { ...item, id };
      applyBusinessRules(table, payload);
      if (TABLE_COLUMNS[table].includes("created_at") && !payload.created_at) payload.created_at = ts;
      if (TABLE_COLUMNS[table].includes("updated_at")) payload.updated_at = ts;
      const cols = Object.keys(payload).filter((c) => TABLE_COLUMNS[table].includes(c));
      const placeholders = cols.map(() => "?").join(", ");
      const values = cols.map((c) => toSqlValue(c, payload[c]));
      db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...values);
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;
      inserted.push(fromSqlRow(table, row));
    }
  });
  insertOne(rows);
  return inserted;
}

function runUpdate(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const values = { ...((Array.isArray(q.values) ? q.values[0] : q.values) ?? {}) } as Record<string, unknown>;
  applyBusinessRules(table, values);
  if (TABLE_COLUMNS[table].includes("updated_at")) values.updated_at = nowIso();
  const { clause, params } = buildWhere(table, q.filters);
  const cols = Object.keys(values).filter((c) => TABLE_COLUMNS[table].includes(c) && c !== "id");
  if (cols.length === 0) return [];
  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const setValues = cols.map((c) => toSqlValue(c, values[c]));
  db.prepare(`UPDATE ${table} SET ${setClause} ${clause}`).run(...setValues, ...params);
  const rows = db.prepare(`SELECT * FROM ${table} ${clause}`).all(...params) as Record<string, unknown>[];
  return rows.map((r) => fromSqlRow(table, r));
}

function runUpsert(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const rows = Array.isArray(q.values) ? q.values : q.values ? [q.values] : [];
  const conflictCol = q.onConflict || "id";
  const result: unknown[] = [];
  const tx = db.transaction((items: Record<string, unknown>[]) => {
    for (const item of items) {
      const conflictVal = item[conflictCol];
      const existing = conflictVal !== undefined
        ? db.prepare(`SELECT id FROM ${table} WHERE ${conflictCol} = ?`).get(toSqlValue(conflictCol, conflictVal)) as { id: string } | undefined
        : undefined;
      if (existing) {
        const patch: Record<string, unknown> = { ...item };
        applyBusinessRules(table, patch);
        if (TABLE_COLUMNS[table].includes("updated_at")) patch.updated_at = nowIso();
        const cols = Object.keys(patch).filter((c) => TABLE_COLUMNS[table].includes(c) && c !== "id");
        if (cols.length > 0) {
          const setClause = cols.map((c) => `${c} = ?`).join(", ");
          const setValues = cols.map((c) => toSqlValue(c, patch[c]));
          db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...setValues, existing.id);
        }
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(existing.id) as Record<string, unknown>;
        result.push(fromSqlRow(table, row));
      } else {
        const id = (item.id as string) || crypto.randomUUID();
        const ts = nowIso();
        const payload: Record<string, unknown> = { ...item, id };
        applyBusinessRules(table, payload);
        if (TABLE_COLUMNS[table].includes("created_at") && !payload.created_at) payload.created_at = ts;
        if (TABLE_COLUMNS[table].includes("updated_at")) payload.updated_at = ts;
        const cols = Object.keys(payload).filter((c) => TABLE_COLUMNS[table].includes(c));
        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map((c) => toSqlValue(c, payload[c]));
        db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...values);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;
        result.push(fromSqlRow(table, row));
      }
    }
  });
  tx(rows);
  return result;
}

function runDelete(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const { clause, params } = buildWhere(table, q.filters);
  db.prepare(`DELETE FROM ${table} ${clause}`).run(...params);
  return null;
}

export function executeQuery(q: QueryDescriptor): QueryResult {
  try {
    assertTable(q.table);
    const db = getDb();
    let data: unknown;
    switch (q.op) {
      case "select": data = runSelect(db, q.table, q); break;
      case "insert": data = runInsert(db, q.table, q); break;
      case "update": data = runUpdate(db, q.table, q); break;
      case "upsert": data = runUpsert(db, q.table, q); break;
      case "delete": data = runDelete(db, q.table, q); break;
      default: throw new Error(`Operação desconhecida: ${q.op}`);
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
}

// ---------------------------------------------------------------------------
// Armazenamento local de arquivos (fotos e documentos dos colaboradores)
// ---------------------------------------------------------------------------

function safeRelPath(bucket: string, relPath: string): string {
  if (!STORAGE_BUCKETS.has(bucket)) throw new Error("Bucket de arquivo inválido");
  if (!/^[\w.\-/]+$/.test(relPath) || relPath.includes("..")) {
    throw new Error("Caminho de arquivo inválido");
  }
  const root = path.resolve(FILES_DIR, bucket);
  const resolved = path.resolve(root, relPath);
  if (path.relative(root, resolved).startsWith("..") || path.isAbsolute(path.relative(root, resolved))) {
    throw new Error("Caminho de arquivo inválido");
  }
  return resolved;
}

export function storageWrite(bucket: string, relPath: string, base64: string): { path: string } {
  if (base64.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 4) {
    throw new Error("Arquivo excede o limite de 50 MB");
  }
  const abs = safeRelPath(bucket, relPath);
  const contents = Buffer.from(base64, "base64");
  if (contents.length > MAX_ATTACHMENT_BYTES) throw new Error("Arquivo excede o limite de 50 MB");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  return { path: relPath };
}

export function storageRead(bucket: string, relPath: string): { base64: string; size: number } | null {
  const abs = safeRelPath(bucket, relPath);
  if (!fs.existsSync(abs)) return null;
  if (fs.statSync(abs).size > MAX_ATTACHMENT_BYTES) throw new Error("Arquivo excede o limite de 50 MB");
  const buf = fs.readFileSync(abs);
  return { base64: buf.toString("base64"), size: buf.length };
}

export function storageRemove(bucket: string, relPaths: string[]): void {
  for (const relPath of relPaths) {
    const abs = safeRelPath(bucket, relPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}
