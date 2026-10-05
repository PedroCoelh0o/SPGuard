import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("theme") as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    // Change backgrounds and text together: component hover transitions must
    // not leave the old text color briefly on a background from the new theme.
    root.classList.add("theme-changing");
    void root.offsetWidth;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
    let nextFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => root.classList.remove("theme-changing"));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(nextFrame);
      root.classList.remove("theme-changing");
    };
  }, [theme]);

  useEffect(() => {
    if (localStorage.getItem("theme")) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleTheme = () => setTheme((p) => (p === "light" ? "dark" : "light"));
  return { theme, toggleTheme };
}
