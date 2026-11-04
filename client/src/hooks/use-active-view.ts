import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";

/** Plan needs room for the timeline: Tailwind's `lg` breakpoint. */
export const PLAN_MIN_WIDTH = 1024;

/** "loading" while the stored profile is read, so no dashboard starts a request it would discard. */
export type ActiveView = "loading" | "classic" | "glance" | "plan";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Which dashboard to show. Plan applies on wide screens only; below that Glance (when enabled) or the
 * classic cards take over, so one profile can use Plan at the desk and Glance on the phone.
 */
export function useActiveView(): ActiveView {
  const { data: settings, isLoading } = useSettings();
  const wide = useMediaQuery(`(min-width: ${PLAN_MIN_WIDTH}px)`);
  if (isLoading) return "loading";
  if (settings?.planMode === 1 && wide) return "plan";
  if (settings?.glanceMode === 1) return "glance";
  return "classic";
}
