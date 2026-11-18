import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { isMobileDevice, PLAN_MIN_WIDTH, resolveView, storedChoice, type ViewChoice } from "@/lib/view-mode";

export { PLAN_MIN_WIDTH };

/** "loading" while the stored profile is read, so no dashboard starts a request it would discard. */
export type ActiveView = "loading" | ViewChoice;

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

/** Phone (from the user agent, fixed) and whether the window is wide enough for Planner (live). */
export function useDeviceClass(): { mobile: boolean; wide: boolean } {
  const [mobile] = useState(isMobileDevice);
  const wide = useMediaQuery(`(min-width: ${PLAN_MIN_WIDTH}px)`);
  return { mobile, wide };
}

/**
 * Which dashboard to show: the stored choice, except that Planner falls back to the classic cards on
 * phones and in windows narrower than PLAN_MIN_WIDTH.
 */
export function useActiveView(): ActiveView {
  const { data: settings, isLoading } = useSettings();
  const device = useDeviceClass();
  if (isLoading) return "loading";
  return resolveView(storedChoice(settings, device.mobile), device);
}
