import type { KeyboardEvent, MouseEvent } from "react";

/** Open the row's details without intercepting nested controls or text selection. */
export function clickableTableRow(label: string, open: () => void) {
  return {
    tabIndex: 0,
    "aria-label": label,
    title: label,
    className: "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if ((event.target as Element).closest("button, a, input, textarea, select, [role='button'], [role='menuitem'], [role='dialog'], [data-row-actions]")) return;
      if (window.getSelection()?.toString().trim()) return;
      open();
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget || event.defaultPrevented || event.repeat) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    },
  };
}
