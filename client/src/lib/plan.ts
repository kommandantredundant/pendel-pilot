import type { CommuteSuggestion } from "@shared/routes";
import { arriveTime, leaveTime, type ModePreference, type TravelMode } from "./glance";
import type { JourneyAnchor } from "@/hooks/use-transport";

/**
 * Pure helpers for the desktop planning view ("Planner"): door-to-door timeline segments, transfer warnings, the shared time axis, and Europe/Berlin date handling for the planning bar.
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

/** What the timeline is drawn for: one mode, or both at once (bar split into a bike and a walk lane). */
export type TimelineMode = ModePreference;

/** The preferred mode; spontaneous users see both lanes. */
export function defaultTimelineMode(preference: ModePreference): TimelineMode {
  return preference;
}

/** Modes shown in the timeline, walk first (top lane): it leaves earlier, so the lanes read as a staircase. */
export function timelineModes(mode: TimelineMode): TravelMode[] {
  return mode === "both" ? ["walk", "bike"] : [mode];
}

/** Mode used for sorting and dimming; with both lanes the faster bike leads. */
export function leadMode(mode: TimelineMode): TravelMode {
  return mode === "both" ? "bike" : mode;
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

export type Lane = "full" | "top" | "bottom";
export type LanedSegment = TimelineSegment & { lane: Lane };

/**
 * Segments for the bar. With one mode every segment fills the bar; with both, trains and transfers stay
 * full height while the way to and from the station splits horizontally: walk on top, bike below, each
 * with its own length.
 */
export function lanedSegments(suggestion: CommuteSuggestion, mode: TimelineMode): LanedSegment[] {
  if (mode !== "both") return timelineSegments(suggestion, mode).map((segment) => ({ ...segment, lane: "full" as const }));
  const isWay = (segment: TimelineSegment) => segment.kind === "access" || segment.kind === "egress";
  const ways = timelineModes(mode).flatMap((travelMode, index) =>
    timelineSegments(suggestion, travelMode)
      .filter(isWay)
      .map((segment) => ({ ...segment, lane: (index === 0 ? "top" : "bottom") as Lane }))
  );
  const core = timelineSegments(suggestion, "bike")
    .filter((segment) => !isWay(segment))
    .map((segment) => ({ ...segment, lane: "full" as const }));
  return [...ways, ...core];
}

/** Fewest and most connections the planner requests (the backend allows up to 12 per request). */
export const PLAN_MIN_ROWS = 6;
export const PLAN_MAX_ROWS = 12;
/** Height taken by title bar, planning bar, column header, paging row and bottom navigation. */
const PLAN_CHROME_PX = 470;
/** Approximate height of one connection row. */
const PLAN_ROW_PX = 100;

/** How many connections fit the window height, so taller screens show more of the timetable. */
export function planRowCount(viewportHeight: number): number {
  const fitting = Math.floor((viewportHeight - PLAN_CHROME_PX) / PLAN_ROW_PX);
  return Math.min(PLAN_MAX_ROWS, Math.max(PLAN_MIN_ROWS, fitting));
}

/** Connections in the order you would leave, so the timeline reads top to bottom. */
export function sortByLeaveTime(suggestions: CommuteSuggestion[], mode: TravelMode): CommuteSuggestion[] {
  return [...suggestions].sort((a, b) => ms(leaveTime(a, mode)) - ms(leaveTime(b, mode)));
}

export interface TimeAxis {
  start: number;
  end: number;
  /** Labelled tick instants (ms): every 30 min, or every hour on long spans. */
  ticks: number[];
  /** Small unlabelled ticks in between: every 10 min, or every 30 on long spans. */
  minorTicks: number[];
}

const MINUTE = 60_000;
/** Spans up to this long get 30-minute labels and 10-minute minor ticks. */
const FINE_AXIS_MAX_MINUTES = 360;

/** Shared time axis over all rows, padded only to the next minor tick so the timeline keeps its width. */
export function timeAxis(suggestions: CommuteSuggestion[], mode: TimelineMode): TimeAxis | null {
  const segments = suggestions.flatMap((suggestion) => lanedSegments(suggestion, mode));
  if (segments.length === 0) return null;
  const min = Math.min(...segments.map((segment) => segment.start));
  const max = Math.max(...segments.map((segment) => segment.end));
  const fine = (max - min) / MINUTE <= FINE_AXIS_MAX_MINUTES;
  const major = (fine ? 30 : 60) * MINUTE;
  const minor = (fine ? 10 : 30) * MINUTE;
  const start = Math.floor(min / minor) * minor;
  const end = Math.max(start + minor, Math.ceil(max / minor) * minor);
  const ticks: number[] = [];
  const minorTicks: number[] = [];
  for (let tick = start; tick <= end; tick += minor) (tick % major === 0 ? ticks : minorTicks).push(tick);
  return { start, end, ticks, minorTicks };
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
