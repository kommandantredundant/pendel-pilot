import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

// Must match the key read by the pre-paint script in client/index.html.
const THEME_KEY = "pendelpilot.theme";

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyPreference(preference: ThemePreference): void {
  const dark =
    preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Theme preference kept per browser; "system" follows the OS setting live. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    applyPreference(preference);
    try {
      if (preference === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, preference);
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts for this page view.
    }
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPreference("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const cycle = () => setPreference((current) => (current === "system" ? "light" : current === "light" ? "dark" : "system"));
  return { preference, cycle };
}
