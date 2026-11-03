import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bike, Check, ChevronLeft, ChevronRight, Footprints, RefreshCw, Train } from "lucide-react";
import type { CommuteSuggestion } from "@shared/routes";
import { usePlanJourneys, type JourneyAnchor } from "@/hooks/use-transport";
import { useSettings } from "@/hooks/use-settings";
import { ErrorDisplay } from "@/components/error-display";
import { cn } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { loadSettings, saveSettings } from "@/lib/settings-storage";
import { arriveTime, leaveTime, modeStatus, otherMode, type ModePreference, type TravelMode } from "@/lib/glance";
import {
  addDays,
  axisPercent,
  berlinClock,
  berlinDate,
  berlinIso,
  defaultTimelineMode,
  doorToDoorMinutes,
  earlierAnchor,
  lanedSegments,
  laterAnchor,
  leadMode,
  planMarkers,
  PLAN_TIME_ZONE,
  sortByLeaveTime,
  timeAxis,
  timelineModes,
  transferCount,
  worstTransfer,
  type Lane,
  type LanedSegment,
  type TimeAxis,
  type TimelineMode,
  type TimelineSegment,
  type TransferInfo,
  type TransferStatus,
} from "@/lib/plan";
import { DashboardBase } from "./dashboard-base";

/** Leave · timeline · arrive · duration · transfers; the header and every row share it. */
/** Number columns stay narrow so the timeline gets the width (about 1000 px on a 13" laptop). */
const ROW_GRID = "grid grid-cols-[4.75rem_minmax(0,1fr)_4.75rem_4.75rem_6.75rem] gap-x-5 items-start";

const ModeIcon = ({ mode, className }: { mode: TravelMode; className?: string }) =>
  mode === "walk" ? <Footprints className={className} aria-hidden /> : <Bike className={className} aria-hidden />;

const TRANSFER_TEXT: Record<TransferStatus, string> = { ok: "text-muted-foreground", tight: "text-soon", risk: "text-late" };

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const hhmm = (iso: string | number) => format(typeof iso === "number" ? new Date(iso) : parseISO(iso), "HH:mm");

function anchorLabel(anchor: JourneyAnchor, language: Language, today: string): string {
  if (anchor.kind === "now") return t("plan.anchor.now", language);
  const instant = Date.parse(anchor.time);
  const sameDay = berlinDate(instant) === today;
  const formatted = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    timeZone: PLAN_TIME_ZONE,
    ...(sameDay ? {} : { weekday: "short", day: "2-digit", month: "2-digit" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
  return t(anchor.kind === "departure" ? "plan.anchor.departure" : "plan.anchor.arrival", language).replace("{time}", formatted);
}

function transferLabel(info: Pick<TransferInfo, "minutes" | "status" | "station">, language: Language): string {
  const station = info.station ? ` ${t("plan.transfer.at", language).replace("{station}", info.station)}` : "";
  return `${t(`plan.transfer.${info.status}`, language)}${station}: ${info.minutes} ${t("plan.min", language)}`;
}

/** Ignore shortcuts while typing or when a modifier is held. */
function isTypingTarget(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.getAttribute("role") === "switch";
}

/**
 * Plan: the desktop view for planning ahead. A planning bar (day, departure/arrival, time, long-distance)
 * drives the search; every connection becomes one door-to-door timeline on a shared time axis so they can
 * be compared at a glance. Earlier/Later page through the timetable.
 */
export function DashboardPlan({ destination }: { destination: "work" | "home" }) {
  const { language } = useLanguage();
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();
  const now = useNow();
  const today = berlinDate(now);

  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<"departure" | "arrival">("departure");
  const [page, setPage] = useState<JourneyAnchor | null>(null);
  const [modeOverride, setModeOverride] = useState<TimelineMode | null>(null);

  const preference: ModePreference =
    (destination === "work" ? settings?.stationModeFromHome : settings?.stationModeFromWork) ?? "both";
  const mode = modeOverride ?? defaultTimelineMode(preference);
  const lead = leadMode(mode);
  const includeLongDistance = settings?.excludeFernverkehr !== 1;

  const barAnchor: JourneyAnchor = useMemo(() => {
    if (!time && date <= today) return { kind: "now" };
    return { kind, time: berlinIso(date, time || "00:00") };
  }, [date, time, kind, today]);
  const anchor = page ?? barAnchor;

  const { data: journeys, isLoading, isFetching, isError, error, refresh } = usePlanJourneys(destination, anchor, !includeLongDistance);

  const sorted = useMemo(() => (journeys ? sortByLeaveTime(journeys, lead) : []), [journeys, lead]);
  const axis = useMemo(() => timeAxis(sorted, mode), [sorted, mode]);
  const markers = useMemo(() => planMarkers(sorted, lead), [sorted, lead]);

  const resetToNow = useCallback(() => {
    setDate(today);
    setTime("");
    setKind("departure");
    setPage(null);
  }, [today]);

  const pageEarlier = useCallback(() => {
    const next = journeys && earlierAnchor(journeys);
    if (next) setPage(next);
  }, [journeys]);
  const pageLater = useCallback(() => {
    const next = journeys && laterAnchor(journeys);
    if (next) setPage(next);
  }, [journeys]);

  const toggleLongDistance = useCallback(
    (include: boolean) => {
      const current = loadSettings();
      if (!current) return;
      saveSettings({ ...current, excludeFernverkehr: include ? 0 : 1 });
      queryClient.invalidateQueries({ queryKey: ["local-settings"] });
      // The classic dashboards read the preference from storage and do not key on it.
      queryClient.invalidateQueries({ queryKey: ["transport", "journeys"] });
    },
    [queryClient]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) return;
      const key = event.key.toLowerCase();
      if (key === "f") toggleLongDistance(!includeLongDistance);
      else if (key === "r") refresh();
      else if (key === "n") resetToNow();
      else if (event.key === "ArrowLeft") pageEarlier();
      else if (event.key === "ArrowRight") pageLater();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [includeLongDistance, toggleLongDistance, refresh, resetToNow, pageEarlier, pageLater]);

  // Without a profile the classic dashboard shows the setup prompt.
  if (!settings) return <DashboardBase destination={destination} />;

  const chooseDay = (next: string) => {
    if (!next) return;
    setDate(next);
    if (!time && next !== today) setTime(berlinClock(now));
    setPage(null);
  };
  const chooseKind = (next: "departure" | "arrival") => {
    setKind(next);
    if (!time) setTime(berlinClock(now));
    setPage(null);
  };

  const [fromName, toName] =
    destination === "work" ? [settings.homeStationName, settings.workStationName] : [settings.workStationName, settings.homeStationName];

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <span className="sr-only">{t(destination === "work" ? "dashboard.work.title" : "dashboard.home.title", language)}:</span>
            <span>{fromName}</span>
            <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{toName}</span>
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="plan-anchor">
            {anchorLabel(anchor, language, today)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border/70 bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label={t("dashboard.refresh", language)}
          data-testid="plan-refresh"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} aria-hidden />
          {t("dashboard.refresh", language)}
        </button>
      </header>

      {/* Planning bar */}
      <section
        aria-label={t("plan.bar", language)}
        className="bg-card rounded-xl border border-border/70 shadow-sm px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3"
      >
        <Field label={t("plan.date", language)}>
          <div className="flex items-center gap-2">
            <Segmented
              value={date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : ""}
              options={[
                { value: "today", label: t("plan.today", language) },
                { value: "tomorrow", label: t("plan.tomorrow", language) },
              ]}
              onChange={(value) => chooseDay(value === "today" ? today : addDays(today, 1))}
            />
            <input
              type="date"
              value={date}
              min={today}
              onChange={(event) => chooseDay(event.target.value)}
              className={INPUT_CLASS}
              aria-label={t("plan.date", language)}
              data-testid="plan-date"
            />
          </div>
        </Field>

        <Field label={t("plan.time", language)}>
          <div className="flex items-center gap-2">
            <Segmented
              value={time ? kind : ""}
              options={[
                { value: "departure", label: t("dashboard.departure", language) },
                { value: "arrival", label: t("dashboard.arrival", language) },
              ]}
              onChange={(value) => chooseKind(value as "departure" | "arrival")}
            />
            <input
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setPage(null);
              }}
              className={cn(INPUT_CLASS, "w-[6.5rem]", !time && "text-muted-foreground")}
              aria-label={t("plan.time", language)}
              data-testid="plan-time"
            />
            <button
              type="button"
              onClick={resetToNow}
              className={cn(
                "h-9 px-3 rounded-lg text-sm font-medium transition-colors",
                anchor.kind === "now"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/70 text-foreground hover:bg-secondary"
              )}
              data-testid="plan-now"
            >
              {t("plan.now", language)}
            </button>
          </div>
        </Field>

        <Field label={t("plan.mode", language)}>
          <Segmented
            value={mode}
            options={(["bike", "walk", "both"] as const).map((value) => ({
              value,
              label:
                value === "both" ? (
                  <span className="flex items-center gap-0.5">
                    <Bike className="w-3.5 h-3.5" aria-hidden />+<Footprints className="w-3.5 h-3.5" aria-hidden />
                  </span>
                ) : (
                  <ModeIcon mode={value} className="w-4 h-4" />
                ),
              title: t(value === "both" ? "plan.mode.both" : `plan.access.${value}`, language),
            }))}
            onChange={(value) => setModeOverride(value as TimelineMode)}
          />
        </Field>

        <label className="flex items-center gap-2.5 h-9 cursor-pointer" title={t("plan.longDistance.desc", language)}>
          <Switch checked={includeLongDistance} onCheckedChange={toggleLongDistance} data-testid="plan-long-distance" />
          <span className="text-sm font-medium">{t("plan.longDistance", language)}</span>
        </label>
      </section>

      {isError && <ErrorDisplay error={error} language={language} showFixAction={true} />}

      {/* Connections */}
      <section className="bg-card rounded-xl border border-border/70 shadow-sm">
        <div className={cn(ROW_GRID, "px-5 pt-3 pb-2 border-b border-border/70 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground")}>
          <span>{t("plan.col.leave", language)}</span>
          <div>
            <span className="sr-only">{t("plan.col.timeline", language)}</span>
            {axis ? <AxisLabels axis={axis} /> : <span aria-hidden>{t("plan.col.timeline", language)}</span>}
          </div>
          <span>{t("plan.col.arrive", language)}</span>
          <span>{t("plan.col.duration", language)}</span>
          <span>{t("plan.col.transfers", language)}</span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : sorted.length === 0 && !isError ? (
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <Train className="w-8 h-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">{t("dashboard.no-trains.title", language)}</p>
            <p className="text-sm text-muted-foreground">{t("dashboard.no-trains.desc", language)}</p>
          </div>
        ) : (
          <ol className={cn("divide-y divide-border/70 transition-opacity", isFetching && "opacity-60")}>
            {sorted.map((suggestion, index) => (
              <PlanRow
                key={`${suggestion.journey.departure}-${suggestion.journey.lineName}`}
                suggestion={suggestion}
                index={index}
                mode={mode}
                axis={axis}
                now={now}
                fastest={markers.fastest.has(index)}
                fewestTransfers={markers.fewestTransfers.has(index)}
              />
            ))}
          </ol>
        )}

        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-border/70">
          <PageButton onClick={pageEarlier} disabled={!journeys?.length} testId="plan-earlier">
            <ChevronLeft className="w-4 h-4" aria-hidden />
            {t("plan.earlier", language)}
          </PageButton>
          <Legend language={language} />
          <PageButton onClick={pageLater} disabled={!journeys?.length} testId="plan-later">
            {t("plan.later", language)}
            <ChevronRight className="w-4 h-4" aria-hidden />
          </PageButton>
        </div>
      </section>

      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={t("plan.shortcuts", language)}>
        <span className="font-medium">{t("plan.shortcuts", language)}</span>
        <Shortcut keys={["F"]} label={t("plan.key.longDistance", language)} />
        <Shortcut keys={["R"]} label={t("plan.key.refresh", language)} />
        <Shortcut keys={["←", "→"]} label={t("plan.key.page", language)} />
        <Shortcut keys={["N"]} label={t("plan.key.now", language)} />
      </p>
    </div>
  );
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-border/70 bg-card px-2.5 text-sm font-mono-numbers text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:[color-scheme:dark]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: React.ReactNode; title?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex h-9 rounded-lg border border-border/70 bg-card p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-label={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-3 rounded-md text-xs font-medium flex items-center transition-colors",
            value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PageButton({ onClick, disabled, testId, children }: { onClick: () => void; disabled: boolean; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-border/70 text-sm font-medium hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd key={key} className="min-w-[1.4rem] text-center rounded border border-border bg-card px-1 py-px font-mono-numbers text-[11px] text-foreground">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}

function AxisLabels({ axis }: { axis: TimeAxis }) {
  return (
    <div className="relative h-4" aria-hidden>
      {/* The outer ticks only pad the axis to round times; labelling them would crowd the edges. */}
      {axis.ticks.slice(1, -1).map((tick) => (
        <span
          key={tick}
          className="absolute top-0 -translate-x-1/2 font-mono-numbers normal-case tracking-normal"
          style={{ left: `${axisPercent(axis, tick)}%` }}
        >
          {hhmm(tick)}
        </span>
      ))}
    </div>
  );
}

function Legend({ language }: { language: Language }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
      <span className="flex items-center gap-1.5">
        <span className="w-4 h-2.5 rounded-sm bg-muted-foreground/20" />
        {t("plan.legend.way", language)}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-4 h-2.5 rounded-sm bg-primary" />
        {t("plan.legend.train", language)}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-4 h-2.5 rounded-sm text-muted-foreground/50" style={STRIPES} />
        {t("plan.legend.transfer", language)}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-0.5 h-3 bg-hurry" />
        {t("plan.legend.now", language)}
      </span>
    </div>
  );
}

const STRIPES: React.CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 5px)",
};

function PlanRow({
  suggestion,
  index,
  mode,
  axis,
  now,
  fastest,
  fewestTransfers,
}: {
  suggestion: CommuteSuggestion;
  index: number;
  mode: TimelineMode;
  axis: TimeAxis | null;
  now: number;
  fastest: boolean;
  fewestTransfers: boolean;
}) {
  const { language } = useLanguage();
  const both = mode === "both";
  const lead = leadMode(mode);
  const other = otherMode(lead);
  const status = modeStatus(suggestion, lead, now);
  // With both lanes a row only counts as missed once neither mode can make it.
  const missed = timelineModes(mode).every((travelMode) => modeStatus(suggestion, travelMode, now) === "missed");
  const count = transferCount(suggestion);
  const worst = worstTransfer(suggestion);

  return (
    <li
      data-testid={`plan-row-${index}`}
      className={cn(ROW_GRID, "px-5 py-3.5 hover:bg-secondary/40 transition-colors", missed && "opacity-50")}
      title={missed ? t("journey.missed", language) : undefined}
    >
      {/* Leave */}
      {both ? (
        <div className="flex flex-col gap-0.5">
          {timelineModes(mode).map((travelMode) => (
            <LeaveTime key={travelMode} suggestion={suggestion} mode={travelMode} now={now} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className={cn("flex items-center gap-1.5 font-mono-numbers text-xl font-semibold tracking-tighter", status === "missed" && "line-through", status === "hurry" && "text-hurry")}>
            <ModeIcon mode={lead} className="w-4 h-4 text-muted-foreground shrink-0" />
            {hhmm(leaveTime(suggestion, lead))}
          </span>
          {status === "hurry" ? (
            <span className="text-xs font-medium text-hurry">{t("glance.hurry", language)}</span>
          ) : (
            <span className={cn("flex items-center gap-1.5 font-mono-numbers text-xs text-muted-foreground", modeStatus(suggestion, other, now) === "missed" && "line-through")}>
              <ModeIcon mode={other} className="w-3.5 h-3.5 shrink-0" />
              {hhmm(leaveTime(suggestion, other))}
            </span>
          )}
        </div>
      )}

      {/* Timeline and legs */}
      <div className="min-w-0">
        {axis && <TimelineBar suggestion={suggestion} mode={mode} axis={axis} now={now} />}
      </div>

      {/* Arrive */}
      {both ? (
        <div className="flex flex-col gap-0.5">
          {timelineModes(mode).map((travelMode) => (
            <span key={travelMode} className="flex items-center gap-1.5 font-mono-numbers text-lg font-semibold tracking-tighter">
              <ModeIcon mode={travelMode} className="w-4 h-4 text-muted-foreground shrink-0" />
              {hhmm(arriveTime(suggestion, travelMode))}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-mono-numbers text-xl font-semibold tracking-tighter">
            <ModeIcon mode={lead} className="w-4 h-4 text-muted-foreground shrink-0" />
            {hhmm(arriveTime(suggestion, lead))}
          </span>
          <span className="flex items-center gap-1.5 font-mono-numbers text-xs text-muted-foreground">
            <ModeIcon mode={other} className="w-3.5 h-3.5 shrink-0" />
            {hhmm(arriveTime(suggestion, other))}
          </span>
        </div>
      )}

      {/* Duration */}
      <div className="flex flex-col items-start gap-1">
        {timelineModes(mode).map((travelMode) => (
          <span key={travelMode} className="flex items-center gap-1.5 font-mono-numbers text-base font-medium">
            {both && <ModeIcon mode={travelMode} className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            {doorToDoorMinutes(suggestion, travelMode)} <span className="text-xs text-muted-foreground">{t("plan.min", language)}</span>
          </span>
        ))}
        {fastest && <Marker>{t("plan.fastest", language)}</Marker>}
      </div>

      {/* Transfers */}
      <div className="flex flex-col items-start gap-1">
        <span className="flex items-center gap-1.5 text-base font-medium">
          <span className="font-mono-numbers">{count === 0 ? t("plan.direct", language) : count}</span>
          {worst && worst.status !== "ok" && (
            <AlertTriangle className={cn("w-4 h-4", TRANSFER_TEXT[worst.status])} aria-label={transferLabel(worst, language)} />
          )}
        </span>
        {fewestTransfers && <Marker>{t("plan.fewest", language)}</Marker>}
      </div>
    </li>
  );
}

/** One of two equal leave times (both lanes shown), struck through once missed. */
function LeaveTime({ suggestion, mode, now }: { suggestion: CommuteSuggestion; mode: TravelMode; now: number }) {
  const { language } = useLanguage();
  const status = modeStatus(suggestion, mode, now);
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 font-mono-numbers text-lg font-semibold tracking-tighter",
        status === "missed" && "line-through opacity-50",
        status === "hurry" && "text-hurry"
      )}
      title={status === "hurry" ? t("glance.hurry", language) : status === "missed" ? t("journey.missed", language) : undefined}
    >
      <ModeIcon mode={mode} className="w-4 h-4 text-muted-foreground shrink-0" />
      {hhmm(leaveTime(suggestion, mode))}
    </span>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-primary-tint text-primary px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

function segmentTitle(segment: TimelineSegment, language: Language): string {
  const span = `${hhmm(segment.start)}–${hhmm(segment.end)}`;
  switch (segment.kind) {
    case "access":
      return `${t(`plan.access.${segment.mode}`, language)} · ${span}`;
    case "egress":
      return `${t(`plan.egress.${segment.mode}`, language)} · ${span}`;
    case "ride":
      return `${segment.lineName} · ${span}`;
    case "transfer":
      return `${transferLabel(segment, language)} · ${span}`;
  }
}

const LANE_CLASS: Record<Lane, string> = {
  full: "top-0.5 bottom-0.5",
  top: "top-0.5 bottom-[calc(50%+1px)]",
  bottom: "top-[calc(50%+1px)] bottom-0.5",
};

function TimelineBar({ suggestion, mode, axis, now }: { suggestion: CommuteSuggestion; mode: TimelineMode; axis: TimeAxis; now: number }) {
  const { language } = useLanguage();
  const segments = lanedSegments(suggestion, mode);
  const showNow = now > axis.start && now < axis.end;
  const split = mode === "both";
  const legs = suggestion.journey.legs;
  const transferSegments = segments.filter((segment): segment is Extract<typeof segment, { kind: "transfer" }> => segment.kind === "transfer");

  return (
    <div>
      {/* Margins hold the labels: departure times above each train, transfer minutes below. */}
      <div className={cn("relative mt-4 mb-4", split ? "h-9" : "h-7")}>
        {axis.ticks.map((tick) => (
          <span key={tick} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${axisPercent(axis, tick)}%` }} />
        ))}
        {segments.map((segment, index) => {
          const left = axisPercent(axis, segment.start);
          const width = Math.max(axisPercent(axis, segment.end) - left, segment.kind === "transfer" ? 0.6 : 0.3);
          if (segment.kind === "ride") {
            return (
              <RideSegment
                key={index}
                segment={segment}
                leg={legs[segment.legIndex]}
                left={left}
                width={width}
                title={segmentTitle(segment, language)}
                language={language}
              />
            );
          }
          const way = segment.kind === "access" || segment.kind === "egress";
          return (
            <div
              key={index}
              aria-hidden
              title={segmentTitle(segment, language)}
              className={cn(
                "absolute overflow-hidden flex items-center justify-center",
                LANE_CLASS[segment.lane],
                segment.kind === "access" ? "border-r-2" : "border-l-2",
                "border-card",
                way && "bg-muted-foreground/20 text-foreground/70 rounded-[3px]",
                segment.kind === "transfer" && TRANSFER_TEXT[segment.status],
                segment.kind === "transfer" && segment.status !== "ok" && "ring-1 ring-inset ring-current rounded-[3px]"
              )}
              style={{ left: `${left}%`, width: `${width}%`, ...(segment.kind === "transfer" ? STRIPES : {}) }}
            >
              {way && <ModeIcon mode={segment.mode} className={cn("shrink-0", split ? "w-3 h-3" : "w-3.5 h-3.5")} />}
            </div>
          );
        })}
        {transferSegments.map((segment, index) => (
          <span
            key={`transfer-${index}`}
            className={cn(
              "absolute top-[calc(100%+3px)] -translate-x-1/2 inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] leading-none font-mono-numbers",
              TRANSFER_TEXT[segment.status],
              segment.status !== "ok" && "font-semibold"
            )}
            style={{ left: `${axisPercent(axis, (segment.start + segment.end) / 2)}%` }}
            title={transferLabel(segment, language)}
          >
            {segment.status !== "ok" && <AlertTriangle className="w-3 h-3" aria-hidden />}
            {segment.minutes}′
            <span className="sr-only">{transferLabel(segment, language)}</span>
          </span>
        ))}
        {showNow && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-hurry rounded-full" style={{ left: `${axisPercent(axis, now)}%` }} />}
      </div>
    </div>
  );
}

type RideSegmentData = Extract<LanedSegment, { kind: "ride" }>;
type Leg = CommuteSuggestion["journey"]["legs"][number];

/**
 * One train in the bar: line name and the track as a light chip, always in the same place. On a
 * segment too short for both the line name gives way (ellipsis, full name in the tooltip).
 */
function RideSegment({
  segment,
  leg,
  left,
  width,
  title,
  language,
}: {
  segment: RideSegmentData;
  leg: Leg | undefined;
  left: number;
  width: number;
  title: string;
  language: Language;
}) {
  const platformChanged = !!leg?.platform && !!leg.plannedPlatform && leg.platform !== leg.plannedPlatform;
  return (
    <>
      {leg && <RideTime leg={leg} left={left} language={language} />}
      <div
        title={title}
        className={cn(
          "absolute flex items-center gap-1.5 overflow-hidden px-1.5 bg-primary text-primary-foreground rounded-[3px]",
          LANE_CLASS[segment.lane],
          segment.legIndex > 0 && "border-l-2 border-card"
        )}
        style={{ left: `${left}%`, width: `${width}%` }}
      >
        <span className="min-w-0 truncate text-[11px] font-mono-numbers font-semibold">{segment.lineName}</span>
        {leg?.platform && (
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[3px] bg-card/90 px-1 text-[10px] leading-4 font-mono-numbers font-medium",
              platformChanged ? "text-late" : "text-foreground"
            )}
          >
            {t("journey.platform.short", language)} {leg.platform}
          </span>
        )}
      </div>
    </>
  );
}

/** "07:41 ✓" on time, "08:21 +2" late (planned time in the tooltip), plain without real-time data. */
function RideTime({
  leg,
  left,
  language,
}: {
  leg: Leg;
  left: number;
  language: Language;
}) {
  const late = leg.delay !== null && leg.delay > 0;
  const onTime = leg.delay === 0;
  return (
    <span
      className={cn(
        "absolute bottom-[calc(100%+3px)] inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] leading-none font-mono-numbers font-medium",
        late ? "text-late" : onTime ? "text-success" : "text-foreground/80"
      )}
      style={{ left: `${left}%` }}
      title={late ? `${leg.lineName}: ${hhmm(leg.plannedDeparture)} +${leg.delay}` : onTime ? t("journey.on-time", language) : undefined}
    >
      {hhmm(leg.departure)}
      {late && <span className="font-semibold">+{leg.delay}</span>}
      {onTime && <Check className="w-3 h-3" strokeWidth={3} aria-hidden />}
      {late && <span className="sr-only">{t("journey.delayed", language)} {leg.delay} {t("plan.min", language)}</span>}
    </span>
  );
}
