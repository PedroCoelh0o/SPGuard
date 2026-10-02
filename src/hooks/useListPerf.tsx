import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

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
type InfiniteSliceOptions = {
  hasMoreRemote?: boolean;
  loadingRemote?: boolean;
  onReachEnd?: () => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
  resetKey?: string;
};

export function useInfiniteSlice<T>(items: T[], pageSize = 50, options: InfiniteSliceOptions = {}) {
  const resetKey = options.resetKey ?? items;
  const [slice, setSlice] = useState({ key: resetKey, pageSize, count: pageSize });
  const isResetting = slice.key !== resetKey || slice.pageSize !== pageSize;
  // A primeira renderização da nova busca já respeita o limite de linhas.
  const count = isResetting ? pageSize : slice.count;
  const node = useRef<HTMLElement | null>(null);

  // reinicia quando a lista muda (nova busca/filtro)
  useEffect(() => {
    setSlice({ key: resetKey, pageSize, count: pageSize });
    const root = options.scrollRootRef?.current;
    if (root) root.scrollTop = 0;
  }, [resetKey, pageSize, options.scrollRootRef]);

  const hasMore = count < items.length || !!options.hasMoreRemote;

  const loadMore = useCallback(() => {
    if (count < items.length) {
      setSlice({ key: resetKey, pageSize, count: Math.min(count + pageSize, items.length) });
    } else if (options.hasMoreRemote && !options.loadingRemote) {
      options.onReachEnd?.();
    }
  }, [count, resetKey, items.length, options.hasMoreRemote, options.loadingRemote, options.onReachEnd, pageSize]);

  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      node.current = el;
    },
    [],
  );

  useEffect(() => {
    const el = node.current;
    if (!el || isResetting || !hasMore || typeof IntersectionObserver === "undefined") return;
    let active = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: options.scrollRootRef?.current ?? null, rootMargin: "300px" },
    );
    io.observe(el);
    return () => { active = false; io.disconnect(); };
  }, [hasMore, isResetting, loadMore, count, items, options.scrollRootRef]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  return { visible, hasMore, loadMore, sentinelRef, shown: visible.length, total: items.length };
}
