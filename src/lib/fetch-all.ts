/**
 * O backend limita cada resposta a 1000 linhas.
 * Esta função busca em blocos (range) até trazer todos os registros.
 */
type RangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

export async function fetchAllRows<T>(
  makeQuery: () => RangeQuery<T>,
  { chunk = 1000, max = 20000 }: { chunk?: number; max?: number } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < max; from += chunk) {
    const { data, error } = await makeQuery().range(from, from + chunk - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < chunk) break;
  }
  return all;
}
