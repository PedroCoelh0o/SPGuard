export const grausOcorrencia = ["Baixo", "Médio", "Alto"] as const;
export type GrauOcorrencia = (typeof grausOcorrencia)[number];

export function grauOcorrenciaLabel(grau: unknown): GrauOcorrencia | "Não informado" {
  return grausOcorrencia.includes(grau as GrauOcorrencia) ? grau as GrauOcorrencia : "Não informado";
}

export function correspondeGrauOcorrencia(grau: unknown, filtro: string): boolean {
  return filtro === "todos" || grauOcorrenciaLabel(grau) === filtro;
}
