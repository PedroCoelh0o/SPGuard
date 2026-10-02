import { useEffect, type RefObject } from "react";

/** A barra inferior e a tabela usam o mesmo alcance, inclusive após recolher o menu. */
export function useSyncedTableScroll(
  viewportRef: RefObject<HTMLDivElement | null>,
  tableRef: RefObject<HTMLTableElement | null>,
  scrollbarRef: RefObject<HTMLDivElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const viewport = viewportRef.current;
    const table = tableRef.current;
    const scrollbar = scrollbarRef.current;
    const track = trackRef.current;
    if (!viewport || !table || !scrollbar || !track) return;

    let frame = 0;
    const measure = () => {
      // A tabela reserva espaço para a barra vertical; a barra inferior não.
      // Igualar o alcance evita cortar a última coluna ao chegar à direita.
      const range = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      track.style.width = `${range + scrollbar.clientWidth}px`;
      scrollbar.scrollLeft = viewport.scrollLeft;
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const fromTable = () => {
      if (Math.abs(scrollbar.scrollLeft - viewport.scrollLeft) > 0.5)
        scrollbar.scrollLeft = viewport.scrollLeft;
    };
    const fromScrollbar = () => {
      if (Math.abs(viewport.scrollLeft - scrollbar.scrollLeft) > 0.5)
        viewport.scrollLeft = scrollbar.scrollLeft;
    };
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(viewport);
    observer.observe(table);
    observer.observe(scrollbar);
    viewport.addEventListener("scroll", fromTable, { passive: true });
    scrollbar.addEventListener("scroll", fromScrollbar, { passive: true });
    scheduleMeasure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener("scroll", fromTable);
      scrollbar.removeEventListener("scroll", fromScrollbar);
    };
  }, [viewportRef, tableRef, scrollbarRef, trackRef]);
}
