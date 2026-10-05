import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

/** Executada uma vez por banco, preservando contatos preenchidos e itens da lixeira. */
export function migrateElectronicContacts(db: Database.Database) {
  db.exec("CREATE TABLE IF NOT EXISTS spguard_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const migrationId = "eletronicos-contato-colaborador-v1";
  db.transaction(() => {
    if (db.prepare("SELECT id FROM spguard_data_migrations WHERE id = ?").get(migrationId)) return;
    const rows = db.prepare(`
      SELECT e.id, e.contato, e.descricao, c.nome,
        COALESCE(NULLIF(trim(c.telefone), ''), NULLIF(trim(c.celular), '')) AS telefone
      FROM eletronicos e JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE (e.contato IS NULL OR trim(e.contato) = '')
        AND COALESCE(NULLIF(trim(c.telefone), ''), NULLIF(trim(c.celular), '')) IS NOT NULL
        AND e.excluido_em IS NULL AND c.excluido_em IS NULL
    `).all() as { id: string; contato: string | null; descricao: string | null; nome: string; telefone: string }[];
    const stamp = new Date().toISOString();
    const update = db.prepare("UPDATE eletronicos SET contato = ?, updated_at = ? WHERE id = ? AND (contato IS NULL OR trim(contato) = '')");
    const history = db.prepare("INSERT INTO historico_alteracoes (id, entidade, registro_id, registro_nome, acao, alteracoes, autor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const row of rows) {
      if (!update.run(row.telefone, stamp, row.id).changes) continue;
      history.run(randomUUID(), "eletronico", row.id, row.descricao || row.nome, "editado",
        JSON.stringify({ contato: { de: row.contato, para: row.telefone } }), "Atualização automática do contato", stamp);
    }
    db.prepare("INSERT INTO spguard_data_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, stamp);
  })();
}
