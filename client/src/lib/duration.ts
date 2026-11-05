import { MAX_FIXED_SECONDS } from "@shared/client-schema";

/**
 * Parse a duration typed as "mm:ss" (or whole minutes, "12") into seconds.
 * Returns undefined for anything else, including more than MAX_FIXED_SECONDS.
 */
export function parseMinutesSeconds(text: string): number | undefined {
  const match = text.trim().match(/^(\d{1,3})(?::([0-5]\d))?$/);
  if (!match) return undefined;
  const seconds = Number(match[1]) * 60 + (match[2] === undefined ? 0 : Number(match[2]));
  return seconds <= MAX_FIXED_SECONDS ? seconds : undefined;
}

/** Seconds as "m:ss", e.g. 754 -> "12:34". */
export function formatMinutesSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
