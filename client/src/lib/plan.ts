import type { CommuteSuggestion } from "@shared/routes";
import { arriveTime, leaveTime, type ModePreference, type TravelMode } from "./glance";
import type { JourneyAnchor } from "@/hooks/use-transport";

/**
 * Pure helpers for the desktop planning view ("Plan"): door-to-door timeline segments, comparison
 * markers, transfer warnings, the shared time axis, and Europe/Berlin date handling for the planning bar.
 */

export const PLAN_TIME_ZONE = "Europe/Berlin";

/** Transfers shorter than this are flagged as tight. */
export const TIGHT_TRANSFER_MINUTES = 5;
/** At or below this the connection is at risk (e.g. the first train runs late). */
export const RISKY_TRANSFER_MINUTES = 1;

export type TransferStatus = "ok" | "tight" | "risk";

export type TimelineSegment =
  | { kind: "access"; start: number; end: number; mode: TravelMode }
  | { kind: "ride"; start: number; end: number; lineName: string; legIndex: number }
  | { kind: "transfer"; start: number; end: number; minutes: number; status: TransferStatus; station?: string }
  | { kind: "egress"; start: number; end: number; mode: TravelMode };

export interface TransferInfo {
  minutes: number;
  status: TransferStatus;
  station?: string;
}

const ms = (iso: string) => Date.parse(iso);

/** Mode the timeline is drawn for: the preferred one, or bike when the choice is spontaneous. */
export function defaultTimelineMode(preference: ModePreference): TravelMode {
  return preference === "walk" ? "walk" : "bike";
}

export function transferStatus(minutes: number): TransferStatus {
  if (minutes <= RISKY_TRANSFER_MINUTES) return "risk";
  if (minutes < TIGHT_TRANSFER_MINUTES) return "tight";
  return "ok";
}

/** Transfer time between consecutive legs; legs without an arrival time give no transfer information. */
export function transfers(suggestion: CommuteSuggestion): TransferInfo[] {
  const { legs } = suggestion.journey;
  const result: TransferInfo[] = [];
  for (let i = 1; i < legs.length; i++) {
    const arrival = legs[i - 1].arrival;
    if (!arrival) continue;
    const minutes = Math.floor((ms(legs[i].departure) - ms(arrival)) / 60_000);
    result.push({ minutes, status: transferStatus(minutes), station: legs[i - 1].destination ?? legs[i].origin });
  }
  return result;
}

/** Worst transfer of a connection, for the row marker. */
export function worstTransfer(suggestion: CommuteSuggestion): TransferInfo | undefined {
  const rank: Record<TransferStatus, number> = { ok: 0, tight: 1, risk: 2 };
  return transfers(suggestion).reduce<TransferInfo | undefined>(
    (worst, info) => (!worst || rank[info.status] > rank[worst.status] || (rank[info.status] === rank[worst.status] && info.minutes < worst.minutes) ? info : worst),
    undefined
  );
}

export function transferCount(suggestion: CommuteSuggestion): number {
  return Math.max(0, suggestion.journey.legs.length - 1);
}

/** Door to door, from leaving the origin address to reaching the destination address. */
export function doorToDoorMinutes(suggestion: CommuteSuggestion, mode: TravelMode): number {
  return Math.round((ms(arriveTime(suggestion, mode)) - ms(leaveTime(suggestion, mode))) / 60_000);
}

/**
 * Timeline from door to door: way to the station (including buffers), each train, the transfers between
 * them, and the way from the arrival station. Legs without arrival times collapse into one ride block.
 */
export function timelineSegments(suggestion: CommuteSuggestion, mode: TravelMode): TimelineSegment[] {
  const { journey } = suggestion;
  const departure = ms(journey.departure);
  const arrival = ms(journey.arrival);
  const segments: TimelineSegment[] = [{ kind: "access", start: ms(leaveTime(suggestion, mode)), end: departure, mode }];

  const legs = journey.legs;
  const complete = legs.length > 0 && legs.every((leg) => leg.arrival);
  if (complete) {
    legs.forEach((leg, legIndex) => {
      if (legIndex > 0) {
        const previousEnd = ms(legs[legIndex - 1].arrival!);
        const start = ms(leg.departure);
        const minutes = Math.floor((start - previousEnd) / 60_000);
        segments.push({
          kind: "transfer",
          start: previousEnd,
          end: Math.max(previousEnd, start),
          minutes,
          status: transferStatus(minutes),
          station: legs[legIndex - 1].destination ?? leg.origin,
        });
      }
      segments.push({ kind: "ride", start: ms(leg.departure), end: ms(leg.arrival!), lineName: leg.lineName, legIndex });
    });
  } else {
    segments.push({
      kind: "ride",
      start: departure,
      end: arrival,
      lineName: legs.map((leg) => leg.lineName).filter(Boolean).join(" · ") || journey.lineName,
      legIndex: 0,
    });
  }

  segments.push({ kind: "egress", start: arrival, end: ms(arriveTime(suggestion, mode)), mode });
  return segments;
}

export interface PlanMarkers {
  /** Indices of the connections with the shortest door-to-door time. */
  fastest: Set<number>;
  /** Indices of the connections with the fewest transfers (only when the counts differ). */
  fewestTransfers: Set<number>;
}

/** Comparison markers; nothing is marked when there is only one connection or all are equal. */
export function planMarkers(suggestions: CommuteSuggestion[], mode: TravelMode): PlanMarkers {
  const markers: PlanMarkers = { fastest: new Set(), fewestTransfers: new Set() };
  if (suggestions.length < 2) return markers;

  const durations = suggestions.map((suggestion) => doorToDoorMinutes(suggestion, mode));
  const minDuration = Math.min(...durations);
  if (Math.max(...durations) > minDuration) {
    durations.forEach((duration, index) => duration === minDuration && markers.fastest.add(index));
  }

  const counts = suggestions.map(transferCount);
  const minCount = Math.min(...counts);
  if (Math.max(...counts) > minCount) {
    counts.forEach((count, index) => count === minCount && markers.fewestTransfers.add(index));
  }
  return markers;
}

/** Connections in the order you would leave, so the timeline reads top to bottom. */
export function sortByLeaveTime(suggestions: CommuteSuggestion[], mode: TravelMode): CommuteSuggestion[] {
  return [...suggestions].sort((a, b) => ms(leaveTime(a, mode)) - ms(leaveTime(b, mode)));
}

export interface TimeAxis {
  start: number;
  end: number;
  /** Tick instants (ms) inside the axis. */
  ticks: number[];
}

const MINUTE = 60_000;

/** Shared time axis over all rows, padded to whole tick steps so labels land on round times. */
export function timeAxis(suggestions: CommuteSuggestion[], mode: TravelMode): TimeAxis | null {
  const segments = suggestions.flatMap((suggestion) => timelineSegments(suggestion, mode));
  if (segments.length === 0) return null;
  const min = Math.min(...segments.map((segment) => segment.start));
  const max = Math.max(...segments.map((segment) => segment.end));
  const spanMinutes = (max - min) / MINUTE;
  const step = (spanMinutes <= 150 ? 15 : spanMinutes <= 300 ? 30 : 60) * MINUTE;
  const start = Math.floor(min / step) * step;
  const end = Math.max(start + step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let tick = start; tick <= end; tick += step) ticks.push(tick);
  return { start, end, ticks };
}

/** Position of an instant on the axis in percent (clamped). */
export function axisPercent(axis: TimeAxis, instant: number): number {
  return Math.min(100, Math.max(0, ((instant - axis.start) / (axis.end - axis.start)) * 100));
}

/** Anchor that pages to the connections after the list: one minute after the last train departure. */
export function laterAnchor(suggestions: CommuteSuggestion[]): JourneyAnchor | null {
  if (suggestions.length === 0) return null;
  const last = Math.max(...suggestions.map((suggestion) => ms(suggestion.journey.departure)));
  return { kind: "departure", time: new Date(last + MINUTE).toISOString() };
}

/** Anchor that pages to the connections before the list: arriving one minute before the first train arrives. */
export function earlierAnchor(suggestions: CommuteSuggestion[]): JourneyAnchor | null {
  if (suggestions.length === 0) return null;
  const first = Math.min(...suggestions.map((suggestion) => ms(suggestion.journey.arrival)));
  return { kind: "arrival", time: new Date(first - MINUTE).toISOString() };
}

// --- Europe/Berlin dates for the planning bar -------------------------------------------------

function berlinParts(instant: number): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLAN_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Calendar date in Berlin as YYYY-MM-DD. */
export function berlinDate(instant: number): string {
  const p = berlinParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Wall-clock time in Berlin as HH:MM. */
export function berlinClock(instant: number): string {
  const p = berlinParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function berlinOffsetMs(instant: number): number {
  const p = berlinParts(instant);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** Berlin wall-clock date and time (YYYY-MM-DD, HH:MM) as an ISO 8601 instant, correct across DST changes. */
export function berlinIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wall - berlinOffsetMs(wall);
  instant = wall - berlinOffsetMs(instant);
  return new Date(instant).toISOString();
}
