import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/local-db/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { encontrarConflitosMatricula, type VinculoMatricula } from "@/lib/matricula-conflitos";

export function useMatriculaConflitos(empresaId: string | undefined, matricula: string | null | undefined, atualId: string | undefined, enabled: boolean) {
  const chave = String(matricula ?? "").trim().toLocaleLowerCase("pt-BR");
  const query = useQuery({
    queryKey: ["matricula-conflitos", empresaId],
    enabled: enabled && !!empresaId && !!chave,
    staleTime: 30_000,
    queryFn: () => fetchAllRows<VinculoMatricula>(() => supabase.from("colaboradores").select("id, nome, empresa_id, matricula").eq("empresa_id", empresaId!).order("id") as never),
  });
  const conflitos = useMemo(() => enabled ? encontrarConflitosMatricula(query.data ?? [], empresaId ?? "", chave, atualId) : [], [query.data, empresaId, chave, atualId, enabled]);
  return { ...query, conflitos };
}
