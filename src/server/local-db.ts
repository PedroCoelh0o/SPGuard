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
  ensureSchemaMigrations(db);
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
  observacoes TEXT,
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
  excluido_em TEXT,
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
  excluido_em TEXT,
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

CREATE TABLE IF NOT EXISTS historico_alteracoes (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL CHECK (entidade IN ('colaborador','eletronico')),
  registro_id TEXT NOT NULL,
  registro_nome TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('criado','editado','movido_para_lixeira','restaurado')),
  alteracoes TEXT NOT NULL DEFAULT '{}',
  autor TEXT NOT NULL DEFAULT 'Usuário local',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_historico_registro ON historico_alteracoes(entidade, registro_id, created_at DESC);
`;

// CREATE TABLE IF NOT EXISTS não altera bancos que já existiam. A migração
// mantém todos os cadastros e acrescenta apenas o novo campo opcional.
function ensureSchemaMigrations(db: Database.Database) {
  const columns = (table: string) => db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const colabColumns = columns("colaboradores");
  if (!colabColumns.some((column) => column.name === "observacoes")) {
    db.exec("ALTER TABLE colaboradores ADD COLUMN observacoes TEXT");
  }
  if (!colabColumns.some((column) => column.name === "excluido_em")) {
    db.exec("ALTER TABLE colaboradores ADD COLUMN excluido_em TEXT");
  }
  const eletrColumns = columns("eletronicos");
  if (!eletrColumns.some((column) => column.name === "excluido_em")) {
    db.exec("ALTER TABLE eletronicos ADD COLUMN excluido_em TEXT");
  }

  // A lixeira é temporária: após 30 dias, o aplicativo remove os registros.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oldColabs = db.prepare("SELECT id, foto_url FROM colaboradores WHERE excluido_em IS NOT NULL AND excluido_em < ?").all(cutoff) as { id: string; foto_url: string | null }[];
  for (const { id, foto_url } of oldColabs) {
    const docs = db.prepare("SELECT storage_path FROM colaborador_documentos WHERE colaborador_id = ?").all(id) as { storage_path: string }[];
    for (const doc of docs) {
      try { fs.unlinkSync(safeRelPath("colaborador-documentos", doc.storage_path)); } catch { /* arquivo já removido */ }
    }
    if (foto_url) {
      try { fs.unlinkSync(safeRelPath("colaborador-fotos", foto_url)); } catch { /* arquivo já removido */ }
    }
    db.prepare("DELETE FROM colaboradores WHERE id = ?").run(id);
  }
  db.prepare("DELETE FROM eletronicos WHERE excluido_em IS NOT NULL AND excluido_em < ?").run(cutoff);
  normalizeAndMergeDuplicateCollaborators(db);
}

// Nota: no Postgres original, "touch updated_at" e "auto-status desligado ao
// preencher data_desligamento" eram triggers de banco. Aqui são aplicados em
// runInsert/runUpdate (ver applyBusinessRules abaixo) — evita qualquer risco
// de recursão de triggers do SQLite e fica mais fácil de auditar.
function applyBusinessRules(table: string, payload: Record<string, unknown>) {
  if (table === "colaboradores" && payload.data_desligamento) {
    payload.status = "desligado";
  }
  if (table === "colaboradores" && typeof payload.nome === "string") {
    payload.nome = formatCollaboratorName(payload.nome);
  }
}

const NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos"]);

function formatCollaboratorName(value: string) {
  return value.trim().replace(/\s+/g, " ").split(" ").map((part) => {
    const lower = part.toLocaleLowerCase("pt-BR");
    if (NAME_PARTICLES.has(lower)) return lower;
    return lower.split("-").map((piece) => piece ? piece[0].toLocaleUpperCase("pt-BR") + piece.slice(1) : piece).join("-");
  }).join(" ");
}

function collaboratorNameKey(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

/**
 * Consolida somente duplicidades muito claras: mesma empresa, mesmo nome sem
 * diferença de maiúsculas/minúsculas ou acentos, sem CPF conflitante. O
 * registro mais antigo é mantido e recebe documentos, eletrônicos e campos
 * preenchidos do outro; o duplicado segue para a lixeira por 30 dias.
 */
function normalizeAndMergeDuplicateCollaborators(db: Database.Database) {
  const active = db.prepare("SELECT * FROM colaboradores WHERE excluido_em IS NULL ORDER BY created_at, id").all() as Record<string, unknown>[];
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of active) {
    const formattedName = formatCollaboratorName(String(row.nome ?? ""));
    if (formattedName && row.nome !== formattedName) {
      db.prepare("UPDATE colaboradores SET nome = ?, updated_at = ? WHERE id = ?").run(formattedName, nowIso(), row.id);
      row.nome = formattedName;
    }
    const key = `${row.empresa_id}|${collaboratorNameKey(row.nome)}`;
    if (!collaboratorNameKey(row.nome)) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const merge = db.transaction((keeper: Record<string, unknown>, duplicate: Record<string, unknown>) => {
    const keeperCpf = String(keeper.cpf ?? "").replace(/\D/g, "");
    const duplicateCpf = String(duplicate.cpf ?? "").replace(/\D/g, "");
    if (keeperCpf && duplicateCpf && keeperCpf !== duplicateCpf) return;

    const merged: Record<string, unknown> = { ...keeper, nome: formatCollaboratorName(String(keeper.nome ?? duplicate.nome ?? "")) };
    for (const column of TABLE_COLUMNS.colaboradores) {
      if (["id", "empresa_id", "created_at", "updated_at", "excluido_em", "nome", "observacoes"].includes(column)) continue;
      if (!hasValue(merged[column]) && hasValue(duplicate[column])) merged[column] = duplicate[column];
    }
    if (hasValue(keeper.observacoes) && hasValue(duplicate.observacoes) && keeper.observacoes !== duplicate.observacoes) {
      merged.observacoes = `${keeper.observacoes}\n\n[Informação consolidada do cadastro duplicado]\n${duplicate.observacoes}`;
    } else if (!hasValue(merged.observacoes) && hasValue(duplicate.observacoes)) {
      merged.observacoes = duplicate.observacoes;
    }
    merged.updated_at = nowIso();
    const fields = Object.keys(merged).filter((column) => TABLE_COLUMNS.colaboradores.includes(column) && !["id", "created_at", "excluido_em"].includes(column));
    db.prepare(`UPDATE colaboradores SET ${fields.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`).run(...fields.map((column) => toSqlValue(column, merged[column])), keeper.id);
    db.prepare("UPDATE colaborador_documentos SET colaborador_id = ?, updated_at = ? WHERE colaborador_id = ?").run(keeper.id, nowIso(), duplicate.id);
    db.prepare("UPDATE eletronicos SET colaborador_id = ?, updated_at = ? WHERE colaborador_id = ?").run(keeper.id, nowIso(), duplicate.id);
    const deletedAt = nowIso();
    db.prepare("UPDATE colaboradores SET excluido_em = ?, updated_at = ? WHERE id = ?").run(deletedAt, deletedAt, duplicate.id);
    const saved = db.prepare("SELECT * FROM colaboradores WHERE id = ?").get(keeper.id) as Record<string, unknown>;
    recordHistory(db, "colaboradores", saved, "editado", { registro: `cadastro unificado com ${duplicate.nome}` });
    recordHistory(db, "colaboradores", { ...duplicate, excluido_em: deletedAt }, "movido_para_lixeira", { registro: `cadastro unificado em ${saved.nome}` });
  });

  for (const rows of groups.values()) {
    const keeper = rows[0];
    for (const duplicate of rows.slice(1)) merge(keeper, duplicate);
  }
}

// ---------------------------------------------------------------------------
// Metadados de colunas (tipos especiais: boolean / json) por tabela
// ---------------------------------------------------------------------------

const TABLE_COLUMNS: Record<string, string[]> = {
  empresas: ["id", "razao_social", "nome_fantasia", "cnpj", "responsavel", "telefone", "email", "endereco", "cidade", "estado", "status", "created_at", "updated_at"],
  colaboradores: ["id", "empresa_id", "nome", "cpf", "rg", "matricula", "cargo", "setor", "escolaridade", "data_nascimento", "sexo", "turno", "data_admissao", "data_desligamento", "motivo_desligamento", "observacoes", "status", "telefone", "celular", "email", "cep", "rua", "numero", "bairro", "cidade", "estado", "foto_url", "eletronicos_autorizado", "excluido_em", "created_at", "updated_at"],
  colaborador_documentos: ["id", "colaborador_id", "nome", "tipo", "storage_path", "tamanho", "uploaded_by", "created_at", "updated_at"],
  eletronicos: ["id", "colaborador_id", "tipo", "descricao", "imei", "modelo", "contato", "numero_selo", "numero_serie", "acessorios", "excluido_em", "created_at", "updated_at"],
  audit_exportacoes: ["id", "tipo", "modulo", "filtros", "total_registros", "created_at"],
  historico_alteracoes: ["id", "entidade", "registro_id", "registro_nome", "acao", "alteracoes", "autor", "created_at"],
};

const BOOLEAN_COLUMNS = new Set(["eletronicos_autorizado"]);
const JSON_COLUMNS = new Set(["filtros", "alteracoes"]);
const SOFT_DELETE_TABLES = new Set(["colaboradores", "eletronicos"]);

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
  trashMode?: "active" | "only" | "all";
};

export type QueryResult = { data: unknown; error: { message: string } | null };

function nowIso(): string {
  return new Date().toISOString();
}

function buildWhere(table: string, filters: Filter[] | undefined, trashMode: QueryDescriptor["trashMode"] = "active"): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (SOFT_DELETE_TABLES.has(table)) {
    if (trashMode === "active") parts.push("excluido_em IS NULL");
    if (trashMode === "only") parts.push("excluido_em IS NOT NULL");
  }
  for (const f of filters ?? []) {
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
  const { clause, params } = buildWhere(table, q.filters, q.trashMode);
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

function historyName(table: string, row: Record<string, unknown>) {
  if (table === "colaboradores") return String(row.nome ?? "Colaborador sem nome");
  return [row.tipo, row.descricao, row.modelo].filter(Boolean).join(" — ") || "Eletrônico sem identificação";
}

function recordHistory(db: Database.Database, table: string, row: Record<string, unknown>, acao: "criado" | "editado" | "movido_para_lixeira" | "restaurado", alteracoes: Record<string, unknown>) {
  if (table !== "colaboradores" && table !== "eletronicos") return;
  db.prepare("INSERT INTO historico_alteracoes (id, entidade, registro_id, registro_nome, acao, alteracoes, autor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), table === "colaboradores" ? "colaborador" : "eletronico", row.id, historyName(table, row), acao, JSON.stringify(alteracoes), "Usuário local", nowIso());
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const ignored = new Set(["id", "created_at", "updated_at", "excluido_em"]);
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (ignored.has(key) || before[key] === after[key]) continue;
    changes[key] = { de: before[key] ?? null, para: after[key] ?? null };
  }
  return changes;
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
      recordHistory(db, table, row, "criado", { registro: "criado" });
      inserted.push(fromSqlRow(table, row));
    }
  });
  insertOne(rows);
  if (table === "colaboradores") normalizeAndMergeDuplicateCollaborators(db);
  return inserted;
}

function runUpdate(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const values = { ...((Array.isArray(q.values) ? q.values[0] : q.values) ?? {}) } as Record<string, unknown>;
  applyBusinessRules(table, values);
  if (TABLE_COLUMNS[table].includes("updated_at")) values.updated_at = nowIso();
  const { clause, params } = buildWhere(table, q.filters, q.trashMode);
  const cols = Object.keys(values).filter((c) => TABLE_COLUMNS[table].includes(c) && c !== "id");
  if (cols.length === 0) return [];
  const before = db.prepare(`SELECT * FROM ${table} ${clause}`).all(...params) as Record<string, unknown>[];
  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const setValues = cols.map((c) => toSqlValue(c, values[c]));
  db.prepare(`UPDATE ${table} SET ${setClause} ${clause}`).run(...setValues, ...params);
  if (table === "colaboradores") normalizeAndMergeDuplicateCollaborators(db);
  const afterWhere = values.excluido_em === null
    ? buildWhere(table, q.filters, "active")
    : { clause, params };
  const rows = db.prepare(`SELECT * FROM ${table} ${afterWhere.clause}`).all(...afterWhere.params) as Record<string, unknown>[];
  for (const row of rows) {
    const old = before.find((item) => item.id === row.id) ?? {};
    const action = old.excluido_em && !row.excluido_em ? "restaurado" : "editado";
    const changes = changedFields(old, row);
    if (action === "restaurado" || Object.keys(changes).length) {
      recordHistory(db, table, row, action, action === "restaurado" ? { registro: "restaurado" } : changes);
    }
  }
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
        ? db.prepare(`SELECT * FROM ${table} WHERE ${conflictCol} = ?`).get(toSqlValue(conflictCol, conflictVal)) as Record<string, unknown> | undefined
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
        const action = existing.excluido_em && !row.excluido_em ? "restaurado" : "editado";
        const changes = changedFields(existing, row);
        if (action === "restaurado" || Object.keys(changes).length) recordHistory(db, table, row, action, action === "restaurado" ? { registro: "restaurado" } : changes);
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
        recordHistory(db, table, row, "criado", { registro: "criado" });
        result.push(fromSqlRow(table, row));
      }
    }
  });
  tx(rows);
  if (table === "colaboradores") normalizeAndMergeDuplicateCollaborators(db);
  return result;
}

function runDelete(db: Database.Database, table: string, q: QueryDescriptor): unknown {
  const { clause, params } = buildWhere(table, q.filters, q.trashMode);
  if (SOFT_DELETE_TABLES.has(table)) {
    const rows = db.prepare(`SELECT * FROM ${table} ${clause}`).all(...params) as Record<string, unknown>[];
    const ts = nowIso();
    db.prepare(`UPDATE ${table} SET excluido_em = ?, updated_at = ? ${clause}`).run(ts, ts, ...params);
    for (const row of rows) recordHistory(db, table, { ...row, excluido_em: ts }, "movido_para_lixeira", { registro: "movido para a lixeira" });
    return null;
  }
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
