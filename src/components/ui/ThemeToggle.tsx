"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark toggle for the dual-scheme token system.
 * The scheme itself is applied before first paint by the inline script in
 * the root layout (stored choice → system preference → dark); this button
 * flips it, persists the choice, and keeps color-scheme in sync via the
 * .dark class on <html>.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Sync with the scheme the pre-paint script already applied to <html>;
    // there is no React state to derive this from during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("pp-theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode): the flip still applies.
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:text-foreground ${className}`}
    >
      {dark === null ? (
        <span className="h-[18px] w-[18px]" aria-hidden />
      ) : dark ? (
        <Sun className="h-[18px] w-[18px]" aria-hidden />
      ) : (
        <Moon className="h-[18px] w-[18px]" aria-hidden />
      )}
    </button>
  );
}
