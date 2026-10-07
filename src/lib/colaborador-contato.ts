/** Prefere Celular 01 (telefone legado); usa Celular 02 quando estiver vazio. */
export function contatoDoColaborador(colaborador?: { telefone?: string | null; celular?: string | null } | null): string {
  return colaborador?.telefone?.trim() || colaborador?.celular?.trim() || "";
}
