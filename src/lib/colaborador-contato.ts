/** Prefere Telefone; usa Celular quando o primeiro campo estiver vazio. */
export function contatoDoColaborador(colaborador?: { telefone?: string | null; celular?: string | null } | null): string {
  return colaborador?.telefone?.trim() || colaborador?.celular?.trim() || "";
}
