import type { CommuteSuggestion } from "@shared/routes";

export type TravelMode = "walk" | "bike";
/** What Glance counts down for: one mode, or both side by side when the choice is spontaneous. */
export type ModePreference = TravelMode | "both";
export type Urgency = "relaxed" | "soon" | "now";
/** `hurry`: the leave time has passed, but by less than {@link HURRY_FRACTION} of the routing time. */
export type ModeStatus = "ok" | "hurry" | "missed";

export const TRAVEL_MODES: TravelMode[] = ["walk", "bike"];

/** Share of the routing time you can still make up by hurrying. */
export const HURRY_FRACTION = 0.1;

export interface GlanceSelection {
  /** Earliest connection still reachable (possibly by hurrying) with a counted-down mode. */
  next?: CommuteSuggestion;
  /** An earlier connection only the other mode can still make (single-mode preference only). */
  alternative?: CommuteSuggestion;
  /** Connections after `next`. */
  later: CommuteSuggestion[];
  /** Connections passed over because no counted-down mode can make them any more. */
  missedCount: number;
}

export function leaveTime(suggestion: CommuteSuggestion, mode: TravelMode): string {
  return mode === "walk" ? suggestion.leaveHomeWalkTime : suggestion.leaveHomeBikeTime;
}

export function arriveTime(suggestion: CommuteSuggestion, mode: TravelMode): string {
  return mode === "walk" ? suggestion.arriveWalkTime : suggestion.arriveBikeTime;
}

function routingMinutes(suggestion: CommuteSuggestion, mode: TravelMode): number {
  return mode === "walk" ? suggestion.walkTimeMinutes : suggestion.bikeTimeMinutes;
}

/** Whole minutes left until `iso`; negative once it has passed. */
export function minutesUntil(iso: string, now: number): number {
  return Math.floor((Date.parse(iso) - now) / 60_000);
}

/** Whole minutes (rounded up) by which the leave time has already passed. */
export function minutesOverdue(iso: string, now: number): number {
  return Math.max(0, Math.ceil((now - Date.parse(iso)) / 60_000));
}

export function modeStatus(suggestion: CommuteSuggestion, mode: TravelMode, now: number): ModeStatus {
  const overdueMs = now - Date.parse(leaveTime(suggestion, mode));
  if (overdueMs <= 0) return "ok";
  return overdueMs <= HURRY_FRACTION * routingMinutes(suggestion, mode) * 60_000 ? "hurry" : "missed";
}

export function urgencyFor(minutes: number): Urgency {
  if (minutes < 3) return "now";
  if (minutes <= 10) return "soon";
  return "relaxed";
}

export function otherMode(mode: TravelMode): TravelMode {
  return mode === "walk" ? "bike" : "walk";
}

export function countedModes(preference: ModePreference): TravelMode[] {
  return preference === "both" ? TRAVEL_MODES : [preference];
}

/** Split the connection list into what Glance shows: the next reachable one, an earlier fallback, the rest. */
export function selectGlance(suggestions: CommuteSuggestion[], preference: ModePreference, now: number): GlanceSelection {
  const reachable = (suggestion: CommuteSuggestion, mode: TravelMode) => modeStatus(suggestion, mode, now) !== "missed";
  const modes = countedModes(preference);
  const nextIndex = suggestions.findIndex((suggestion) => modes.some((mode) => reachable(suggestion, mode)));
  const next = nextIndex === -1 ? undefined : suggestions[nextIndex];
  const before = nextIndex === -1 ? suggestions : suggestions.slice(0, nextIndex);
  const alternative =
    preference === "both" ? undefined : before.find((suggestion) => reachable(suggestion, otherMode(preference)));

  return {
    next,
    alternative,
    later: nextIndex === -1 ? [] : suggestions.slice(nextIndex + 1),
    missedCount: before.filter((suggestion) => suggestion !== alternative).length,
  };
}
