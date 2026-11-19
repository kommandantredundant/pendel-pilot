import type { CommuteSuggestion } from "@shared/routes";
import { countedModes, modeStatus, type ModePreference } from "./glance";

/** How long "Gemerkte Verbindung nicht mehr fahrbar" stays visible after a remembered connection is lost. */
export const PIN_LOST_HINT_MS = 5 * 60_000;

/** A pin that ran out longer ago than this (app closed in between) is dropped without the hint. */
export const STALE_PIN_MS = 30 * 60_000;

/** A connection remembered in Glance, one per direction. */
export interface GlancePin {
  key: string;
  /** Planned departure of the first train, ISO 8601: every load has to reach it (see fetchPlanJourneys). */
  departure?: string;
  /** Latest time you could still leave for it (either mode), ISO 8601; used to drop stale pins silently. */
  lastLeave: string;
}

/**
 * Identity of a remembered connection: every train with its planned departure, plus the planned arrival.
 * Planned times stay the same when a train is delayed, so a delay does not lose the connection.
 */
export function pinKey(suggestion: CommuteSuggestion): string {
  const legs = suggestion.journey.legs.map((leg) => `${leg.lineName}@${leg.plannedDeparture}`).join(">");
  return `${legs}|${suggestion.journey.plannedArrival}`;
}

export function pinFor(suggestion: CommuteSuggestion): GlancePin {
  const lastLeave = [suggestion.leaveHomeWalkTime, suggestion.leaveHomeBikeTime].reduce((a, b) =>
    Date.parse(a) >= Date.parse(b) ? a : b
  );
  return { key: pinKey(suggestion), departure: suggestion.journey.legs[0]?.plannedDeparture ?? suggestion.journey.plannedDeparture, lastLeave };
}

export type PinResolution =
  | { state: "none" }
  | { state: "active"; suggestion: CommuteSuggestion }
  /** Missing although the load covered its departure (connection broken, train cancelled), or missed. */
  | { state: "lost" }
  /** Not part of this load (it did not reach that far); kept until a load says more. */
  | { state: "unknown" };

/** Planned departure of a pin (ISO 8601); pins saved before `departure` existed carry it in their key. */
export function pinDeparture(pin: GlancePin): string | undefined {
  return pin.departure ?? pin.key.split("@")[1]?.split(/[>|]/)[0];
}

export function resolvePin(
  suggestions: CommuteSuggestion[],
  pin: GlancePin | undefined,
  preference: ModePreference,
  now: number
): PinResolution {
  if (!pin) return { state: "none" };
  const suggestion = suggestions.find((candidate) => pinKey(candidate) === pin.key);
  if (!suggestion) {
    const departure = Date.parse(pinDeparture(pin) ?? "");
    const covered = suggestions.some((candidate) => Date.parse(candidate.journey.departure) >= departure);
    return covered ? { state: "lost" } : { state: "unknown" };
  }
  const reachable = countedModes(preference).some((mode) => modeStatus(suggestion, mode, now) !== "missed");
  return reachable ? { state: "active", suggestion } : { state: "lost" };
}

/**
 * Whether losing this pin now deserves the hint. A pin found again long after it ran out (the app was
 * closed, e.g. overnight) is dropped without a hint, since the hint is about what just happened.
 */
export function lossIsRecent(pin: GlancePin, now: number): boolean {
  const lastLeave = Date.parse(pin.lastLeave);
  return Number.isNaN(lastLeave) || now - lastLeave <= STALE_PIN_MS;
}
