export type VinculoMatricula = { id: string; nome: string; empresa_id: string; matricula: string | null };

export function encontrarConflitosMatricula(registros: VinculoMatricula[], empresaId: string, matricula: string | null | undefined, atualId?: string) {
  const chave = String(matricula ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!chave || !empresaId) return [];
  return registros.filter((p) => p.id !== atualId && p.empresa_id === empresaId && String(p.matricula ?? "").trim().toLocaleLowerCase("pt-BR") === chave);
}

export function mensagemConflitosMatricula(registros: VinculoMatricula[], empresa: string) {
  return `Matrícula já utilizada por: ${registros.map((p) => `${p.nome} — Empresa: ${empresa}`).join("; ")}. Confira a matrícula antes de corrigir o cadastro.`;
}
