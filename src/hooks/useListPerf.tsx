import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Valor com atraso — evita refiltrar 2000 registros a cada tecla. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/**
 * Renderização incremental (infinite scroll) de uma lista já carregada.
 * Retorna apenas a fatia visível e um `sentinelRef` para colocar no fim da lista.
 */
export function useInfiniteSlice<T>(items: T[], pageSize = 50) {
  const [count, setCount] = useState(pageSize);
  const node = useRef<HTMLElement | null>(null);

  // reinicia quando a lista muda (nova busca/filtro)
  useEffect(() => {
    setCount(pageSize);
  }, [items, pageSize]);

  const hasMore = count < items.length;

  const loadMore = useCallback(() => {
    setCount((c) => Math.min(c + pageSize, items.length));
  }, [items.length, pageSize]);

  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      node.current = el;
    },
    [],
  );

  useEffect(() => {
    const el = node.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, count, items]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  return { visible, hasMore, loadMore, sentinelRef, shown: visible.length, total: items.length };
}
