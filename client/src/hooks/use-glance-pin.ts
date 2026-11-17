import { useCallback, useEffect, useState } from "react";
import type { CommuteSuggestion } from "@shared/routes";
import { pinFor, PIN_LOST_HINT_MS, type GlancePin } from "@/lib/glance-pin";

type Direction = "work" | "home";

interface StoredPins {
  work?: GlancePin;
  home?: GlancePin;
  /** When a pin was lost, per direction (epoch ms), for the "no longer possible" hint. */
  lostAt?: Partial<Record<Direction, number>>;
  /** Set once anything was remembered; hides the long-press hint. */
  used?: boolean;
}

// Kept on this device only, separate from the settings: it is about the next trip, not a preference.
const STORAGE_KEY = "pendelpilot.glance.pins.v1";
const CHANGE_EVENT = "pendelpilot:glance-pins";

function read(): StoredPins {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as StoredPins) : {};
  } catch {
    return {};
  }
}

function write(update: (pins: StoredPins) => StoredPins): void {
  const next = update(load());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); the pin then lasts for this page view.
    memory = next;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Fallback when storage is unavailable.
let memory: StoredPins | undefined;
const load = (): StoredPins => memory ?? read();

/** The connection remembered for one direction in Glance, plus the hint state around it. */
export function useGlancePin(direction: Direction) {
  const [pins, setPins] = useState<StoredPins>(load);

  useEffect(() => {
    const sync = () => setPins(load());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const pin = useCallback(
    (suggestion: CommuteSuggestion) =>
      write((stored) => ({
        ...stored,
        [direction]: pinFor(suggestion),
        lostAt: { ...stored.lostAt, [direction]: undefined },
        used: true,
      })),
    [direction]
  );

  const unpin = useCallback(() => write((stored) => ({ ...stored, [direction]: undefined })), [direction]);

  /** Drops the pin; with `hint`, shows "no longer possible" for {@link PIN_LOST_HINT_MS}. */
  const markLost = useCallback(
    (hint: boolean) =>
      write((stored) => ({
        ...stored,
        [direction]: undefined,
        lostAt: { ...stored.lostAt, [direction]: hint ? Date.now() : undefined },
      })),
    [direction]
  );

  const lostAt = pins.lostAt?.[direction];
  return {
    current: pins[direction],
    pin,
    unpin,
    markLost,
    /** Whether the "no longer possible" hint is still due at `now`. */
    lostHintVisible: (now: number) => lostAt !== undefined && now - lostAt < PIN_LOST_HINT_MS,
    used: !!pins.used,
  };
}
