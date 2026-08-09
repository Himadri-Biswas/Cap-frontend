import React, { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, setTheme } from "../../lib/theme.js";

export default function ThemeToggle() {
  const [theme, setLocal] = useState(getTheme);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setLocal(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="flex h-9 w-9 items-center justify-center rounded-tile border border-ink-600 bg-ink-850 text-mist-500 transition-colors hover:border-ink-400 hover:text-paper"
    >
      {theme === "dark"
        ? <Sun  className="h-4 w-4" aria-hidden="true" />
        : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
