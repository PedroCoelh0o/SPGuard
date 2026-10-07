type PessoaComSetor = { id: string; setor: string | null };
type AparelhoVinculado = { colaborador_id: string };

/** Comparação de quantidades absolutas: cada aparelho autorizado conta uma vez,
 * no setor atual da ficha. Barras horizontais ordenadas, eixo iniciado em zero;
 * fichas sem setor ficam em "Sem setor" e vínculos inexistentes são ignorados. */
export function agruparEletronicosPorSetor(pessoas: PessoaComSetor[], aparelhos: AparelhoVinculado[]) {
  const setores = new Map(pessoas.map((p) => [p.id, p.setor?.trim().replace(/\s+/g, " ") || "Sem setor"]));
  const totais = new Map<string, { name: string; total: number }>();
  for (const aparelho of aparelhos) {
    const setor = setores.get(aparelho.colaborador_id);
    if (!setor) continue;
    const chave = setor.toLocaleLowerCase("pt-BR");
    const grupo = totais.get(chave) ?? { name: setor, total: 0 };
    grupo.total++;
    totais.set(chave, grupo);
  }
  return [...totais.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}
