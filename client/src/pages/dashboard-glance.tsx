import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, Bike, ChevronRight, Footprints, RefreshCw } from "lucide-react";
import type { CommuteSuggestion } from "@shared/routes";
import { useJourneysWithRefresh } from "@/hooks/use-transport";
import { useSettings } from "@/hooks/use-settings";
import { ErrorDisplay } from "@/components/error-display";
import { DepartureTime, LinePill } from "@/components/journey-card";
import { cn } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import {
  arriveTime,
  leaveTime,
  minutesOverdue,
  minutesUntil,
  modeStatus,
  otherMode,
  selectGlance,
  TRAVEL_MODES,
  urgencyFor,
  type ModePreference,
  type TravelMode,
  type Urgency,
} from "@/lib/glance";

const URGENCY_CLASS: Record<Urgency, string> = {
  relaxed: "text-foreground",
  soon: "text-soon",
  now: "text-late",
};

/** Re-render on a short interval so countdowns stay current between data refreshes. */
function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const ModeIcon = ({ mode, className }: { mode: TravelMode; className?: string }) =>
  mode === "walk" ? <Footprints className={className} aria-hidden /> : <Bike className={className} aria-hidden />;

/**
 * Glance: a one-handed "do I need to hurry?" view. Always plans for now; the countdown follows the
 * mode preferred for this direction (or shows both when spontaneous), and controls sit in the thumb zone.
 */
export function DashboardGlance({ destination }: { destination: "work" | "home" }) {
  const { language } = useLanguage();
  const { data: settings } = useSettings();
  const { data: journeys, isLoading, isError, error, refresh, lastUpdated } = useJourneysWithRefresh(destination);
  const now = useNow();

  if (!settings) return null;
  const preference: ModePreference =
    (destination === "work" ? settings.stationModeFromHome : settings.stationModeFromWork) ?? "both";
  const selection = journeys ? selectGlance(journeys, preference, now) : undefined;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold flex items-center justify-center gap-1.5 flex-wrap text-center">
        <span className="sr-only">{t(destination === "work" ? 'dashboard.work.title' : 'dashboard.home.title', language)}:</span>
        <span>{destination === "work" ? settings.homeStationName : settings.workStationName}</span>
        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>{destination === "work" ? settings.workStationName : settings.homeStationName}</span>
      </p>

      {isError && <ErrorDisplay error={error} language={language} showFixAction={true} />}

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-2xl bg-card border border-border/70" />
      ) : selection?.next ? (
        <HeroCard suggestion={selection.next} preference={preference} now={now} />
      ) : (
        !isError && (
          <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            {t('glance.none', language)}
          </div>
        )
      )}

      {selection?.alternative && preference !== "both" && (
        <AlternativeHint suggestion={selection.alternative} mode={otherMode(preference)} now={now} />
      )}

      {!!selection?.missedCount && (
        <p className="text-xs text-muted-foreground text-center">
          {t('glance.missed.count', language).replace('{count}', String(selection.missedCount))}
        </p>
      )}

      {!!selection?.later.length && (
        <LaterList suggestions={selection.later} preference={preference} now={now} />
      )}

      {/* Thumb zone: refresh sticks just above the bottom navigation and settles above the footer at the end. */}
      <div className="sticky bottom-[5.5rem] md:bottom-28 z-40 flex justify-center pt-2 pointer-events-none">
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isLoading}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-card border border-border shadow-md px-4 h-10 text-xs text-muted-foreground"
        >
          <RefreshCw className={cn("w-4 h-4 text-primary", isLoading && "animate-spin")} aria-hidden />
          <span>
            {t('dashboard.refresh', language)}
            {lastUpdated ? ` · ${t('glance.updated', language)} ${format(lastUpdated, "HH:mm")}` : ""}
          </span>
        </button>
      </div>
    </div>
  );
}

const ModeLabel: Record<TravelMode, string> = { walk: 'glance.other.walk', bike: 'glance.other.bike' };

/** Countdown for one mode: big number while there is time, "+N min" in red while hurrying still works. */
function ModeCountdown({
  suggestion,
  mode,
  now,
  size,
}: {
  suggestion: CommuteSuggestion;
  mode: TravelMode;
  now: number;
  size: "lg" | "md";
}) {
  const { language } = useLanguage();
  const leave = leaveTime(suggestion, mode);
  const status = modeStatus(suggestion, mode, now);
  const minutes = minutesUntil(leave, now);
  const urgency = urgencyFor(minutes);
  const numberClass = size === "lg" ? "text-6xl" : "text-5xl";

  const label =
    status === "hurry" ? (
      <span className="text-hurry font-semibold flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
        {t('glance.hurry', language)}
      </span>
    ) : size === "md" ? (
      t(ModeLabel[mode], language)
    ) : urgency === "now" ? (
      t('glance.go.now', language)
    ) : (
      t(`glance.leave.${mode}`, language)
    );

  return (
    <div className={cn("flex flex-col items-center", status === "missed" && "opacity-40")}>
      <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
        <ModeIcon mode={mode} className="w-4 h-4" />
        {label}
      </p>
      {status === "missed" ? (
        <p className={cn("font-mono-numbers font-semibold tracking-tighter leading-none mt-1 line-through", numberClass)}>
          {format(parseISO(leave), "HH:mm")}
        </p>
      ) : (
        <p
          className={cn(
            "font-mono-numbers font-semibold tracking-tighter leading-none mt-1",
            status === "hurry" ? "text-hurry" : URGENCY_CLASS[urgency]
          )}
        >
          <span className={numberClass}>{status === "hurry" ? `+${minutesOverdue(leave, now)}` : minutes}</span>
          <span className="text-xl ml-1.5">{t('journey.min', language)}</span>
        </p>
      )}
      <p className="mt-2 font-mono-numbers text-sm text-muted-foreground">
        {status === "missed"
          ? t(`glance.missed.${mode}`, language)
          : status === "hurry"
            ? `${format(parseISO(leave), "HH:mm")} · ${t('glance.over', language)}`
            : format(parseISO(leave), "HH:mm")}
      </p>
    </div>
  );
}

/** The non-preferred mode in one small line. */
function OtherModeLine({ suggestion, mode, now }: { suggestion: CommuteSuggestion; mode: TravelMode; now: number }) {
  const { language } = useLanguage();
  const leave = leaveTime(suggestion, mode);
  const status = modeStatus(suggestion, mode, now);
  return (
    <p className={cn("mt-2 text-xs flex items-center justify-center gap-1.5", status === "hurry" ? "text-hurry" : "text-muted-foreground")}>
      <ModeIcon mode={mode} className="w-3.5 h-3.5" />
      {status === "missed" ? (
        t(`glance.missed.${mode}`, language)
      ) : (
        <span>
          {t(ModeLabel[mode], language)}{" "}
          <span className={cn("font-mono-numbers", status === "hurry" ? "font-semibold" : "text-foreground/80")}>
            {format(parseISO(leave), "HH:mm")}
          </span>
          {" · "}
          {status === "hurry"
            ? `${t('glance.hurry.short', language)}, +${minutesOverdue(leave, now)} ${t('journey.min', language)}`
            : `${t('glance.in', language)} ${minutesUntil(leave, now)} ${t('journey.min', language)}`}
        </span>
      )}
    </p>
  );
}

function HeroCard({ suggestion, preference, now }: { suggestion: CommuteSuggestion; preference: ModePreference; now: number }) {
  const { language } = useLanguage();
  const hurrying =
    preference === "both"
      ? TRAVEL_MODES.every((mode) => modeStatus(suggestion, mode, now) !== "ok")
      : modeStatus(suggestion, preference, now) === "hurry";
  const arrivalMode: TravelMode =
    preference !== "both" ? preference : modeStatus(suggestion, "bike", now) !== "missed" ? "bike" : "walk";

  return (
    <article
      className={cn(
        "bg-card rounded-2xl border shadow-sm px-5 py-5 text-center",
        hurrying ? "border-hurry/70 ring-1 ring-hurry/40" : "border-border/70"
      )}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('glance.next', language)}</h2>

      {preference === "both" ? (
        <div className="mt-3 grid grid-cols-2 divide-x divide-border/70">
          {TRAVEL_MODES.map((mode) => (
            <ModeCountdown key={mode} suggestion={suggestion} mode={mode} now={now} size="md" />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <ModeCountdown suggestion={suggestion} mode={preference} now={now} size="lg" />
          <OtherModeLine suggestion={suggestion} mode={otherMode(preference)} now={now} />
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border/70 flex flex-wrap items-start justify-center gap-x-1 gap-y-2">
        {suggestion.journey.legs.map((leg, legIndex) => (
          <div key={legIndex} className="flex items-start gap-1">
            {legIndex > 0 && <ChevronRight className="w-3.5 h-3.5 mt-1 text-muted-foreground shrink-0" aria-hidden />}
            <div className="flex flex-col items-center gap-1">
              <LinePill leg={leg} platformLabel={t('journey.platform.short', language)} />
              <DepartureTime leg={leg} onTimeLabel={t('journey.on-time', language)} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {t('glance.arrive', language)}{" "}
        <span className="font-mono-numbers text-foreground/80">{format(parseISO(arriveTime(suggestion, arrivalMode)), "HH:mm")}</span>
      </p>
    </article>
  );
}

function AlternativeHint({ suggestion, mode, now }: { suggestion: CommuteSuggestion; mode: TravelMode; now: number }) {
  const { language } = useLanguage();
  const leave = leaveTime(suggestion, mode);
  const hurry = modeStatus(suggestion, mode, now) === "hurry";
  const minutes = minutesUntil(leave, now);
  return (
    <div className="rounded-xl bg-primary-tint text-foreground px-4 py-3 flex items-center justify-center gap-2 text-sm flex-wrap text-center">
      <ModeIcon mode={mode} className="w-4 h-4 text-primary" />
      <span>{t(ModeLabel[mode], language)}</span>
      <LinePill leg={suggestion.journey.legs[0]} platformLabel={t('journey.platform.short', language)} />
      <span className={cn("font-mono-numbers font-semibold", hurry ? "text-hurry" : URGENCY_CLASS[urgencyFor(minutes)])}>
        {hurry
          ? `${t('glance.hurry.short', language)}, +${minutesOverdue(leave, now)} ${t('journey.min', language)}`
          : `${t('glance.in', language)} ${minutes} ${t('journey.min', language)}`}
      </span>
    </div>
  );
}

/** Later connections as a small timetable: when to leave on foot and by bike first, the train second. */
function LaterList({ suggestions, preference, now }: { suggestions: CommuteSuggestion[]; preference: ModePreference; now: number }) {
  const { language } = useLanguage();
  return (
    <section className="bg-card rounded-xl border border-border/70 shadow-sm">
      <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
        {t('glance.later', language)}
      </h3>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            {TRAVEL_MODES.map((mode) => (
              <th key={mode} scope="col" className="font-medium px-4 py-1">
                <span className="flex items-center gap-1">
                  <ModeIcon mode={mode} className="w-3.5 h-3.5" />
                  {t('glance.leave', language)}
                  <span className="sr-only">{t(ModeLabel[mode], language)}</span>
                </span>
              </th>
            ))}
            <th scope="col" className="font-medium px-4 py-1 text-right">{t('glance.departs', language)}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70 border-t border-border/70">
          {suggestions.map((suggestion, index) => (
            <tr key={index}>
              {TRAVEL_MODES.map((mode) => {
                const status = modeStatus(suggestion, mode, now);
                const preferred = preference === "both" || preference === mode;
                return (
                  <td
                    key={mode}
                    className={cn(
                      "px-4 py-2.5 font-mono-numbers",
                      preferred ? "text-base font-semibold" : "text-sm text-foreground/75",
                      status === "hurry" && "text-hurry",
                      status === "missed" && "line-through opacity-40"
                    )}
                  >
                    {format(parseISO(leaveTime(suggestion, mode)), "HH:mm")}
                  </td>
                );
              })}
              <td className="px-4 py-2.5 text-right text-xs font-mono-numbers text-muted-foreground">
                <span className="block truncate">{suggestion.journey.legs.map((leg) => leg.lineName).join(" › ")}</span>
                <TrainDeparture leg={suggestion.journey.legs[0]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TrainDeparture({ leg }: { leg: CommuteSuggestion["journey"]["legs"][number] }) {
  const { language } = useLanguage();
  const late = leg.delay !== null && leg.delay > 0;
  return (
    <span className="block whitespace-nowrap">
      {leg.platform && `${t('journey.platform.short', language)} ${leg.platform} · `}
      <span className={late ? "text-late font-semibold" : undefined}>{format(parseISO(leg.departure), "HH:mm")}</span>
      {late && <span className="text-late"> +{leg.delay}</span>}
    </span>
  );
}
