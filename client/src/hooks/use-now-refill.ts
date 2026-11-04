import { useEffect, useRef } from "react";

/** Minimum pause between two quiet reloads. */
const REFILL_INTERVAL_MS = 60_000;

/**
 * "Now" lists lose rows as connections fall out of reach. When fewer than `target - 1` reachable rows are
 * left, reload quietly so the list fills up again, at most once a minute.
 */
export function useNowRefill(options: {
  active: boolean;
  hasData: boolean;
  isFetching: boolean;
  reachable: number;
  target: number;
  refresh: () => unknown;
}) {
  const { active, hasData, isFetching, reachable, target, refresh } = options;
  const lastRefill = useRef(0);
  useEffect(() => {
    if (!active || !hasData || isFetching || reachable >= target - 1) return;
    if (Date.now() - lastRefill.current < REFILL_INTERVAL_MS) return;
    lastRefill.current = Date.now();
    refresh();
  }, [active, hasData, isFetching, reachable, target, refresh]);
}
