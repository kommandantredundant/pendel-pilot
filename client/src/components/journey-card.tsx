import { Fragment } from "react";
import { TrainFront, ChevronRight, Footprints, Bike, Check, type LucideIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "./layout";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { modeStatus, TRAVEL_MODES, type ModePreference, type TravelMode } from "@/lib/glance";

interface JourneyCardProps {
  journey: {
    journey: {
      origin: string;
      destination: string;
      departure: string;
      arrival: string;
      delay: number | null;
      plannedDeparture: string;
      plannedArrival: string;
      lineName: string;
      legs: {
        lineName: string;
        departure: string;
        plannedDeparture: string;
        delay: number | null;
        platform?: string;
        plannedPlatform?: string;
      }[];
    };
    walkTimeMinutes: number;
    bikeTimeMinutes: number;
    leaveHomeWalkTime: string;
    leaveHomeBikeTime: string;
    arriveWalkMinutes: number;
    arriveBikeMinutes: number;
    arriveWalkTime: string;
    arriveBikeTime: string;
    finalDestinationType: 'work' | 'home';
  };
  index: number;
  /** Preferred way to the station for this direction: it comes first and stands out; "both" treats them equally. */
  preference?: ModePreference;
}

const MODE_ICON: Record<TravelMode, LucideIcon> = { walk: Footprints, bike: Bike };

/** Preferred mode first; the other one follows. */
function modeOrder(preference: ModePreference): TravelMode[] {
  return preference === "bike" ? ["bike", "walk"] : TRAVEL_MODES;
}

/**
 * One connection as three labelled sections: when to leave, which trains, when you arrive.
 * Sections sit side by side from `sm` upwards and stack on phones, centred, separated by hairlines
 * instead of nested boxes. Colour is reserved for punctuality; transport modes use icons only.
 */
export function JourneyCard({ journey, index, preference = "both" }: JourneyCardProps) {
  const { journey: j, finalDestinationType } = journey;
  const { language } = useLanguage();
  const now = Date.now();
  const destLabel = finalDestinationType === 'work' ? t('journey.work', language) : t('journey.home', language);

  return (
    <motion.article
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="bg-card rounded-xl border border-border/70 shadow-sm"
    >
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] divide-y sm:divide-y-0 sm:divide-x divide-border/70">
        <Section label={t('journey.section.leave', language)}>
          <div className={MODE_GRID}>
            {modeOrder(preference).map((mode) => (
              <ModeTime
                key={mode}
                icon={MODE_ICON[mode]}
                time={mode === "walk" ? journey.leaveHomeWalkTime : journey.leaveHomeBikeTime}
                detail={`${mode === "walk" ? journey.walkTimeMinutes : journey.bikeTimeMinutes} ${t(`journey.${mode}`, language)}`}
                missed={modeStatus(journey, mode, now) === "missed"}
                hurry={modeStatus(journey, mode, now) === "hurry"}
                emphasis={preference === "both" || preference === mode}
                testId={`leave-${mode}-time-${index}`}
              />
            ))}
          </div>
        </Section>

        <Section label={t('journey.section.ride', language)}>
          <ol className="flex flex-wrap items-start justify-center gap-x-1 gap-y-2">
            {j.legs.map((leg, legIndex) => (
              <Fragment key={legIndex}>
                {legIndex > 0 && <ChevronRight className="w-3.5 h-3.5 mt-1 text-muted-foreground shrink-0" aria-hidden />}
                <li data-testid={`leg-${index}-${legIndex}`} className="flex flex-col items-center gap-1">
                  <LinePill leg={leg} platformLabel={t('journey.platform.short', language)} />
                  <DepartureTime leg={leg} onTimeLabel={t('journey.on-time', language)} />
                </li>
              </Fragment>
            ))}
          </ol>
        </Section>

        <Section label={`${t('journey.section.arrive', language)} · ${destLabel}`}>
          <div className={MODE_GRID}>
            {modeOrder(preference).map((mode) => (
              <ModeTime
                key={mode}
                icon={MODE_ICON[mode]}
                time={mode === "walk" ? journey.arriveWalkTime : journey.arriveBikeTime}
                detail={`${mode === "walk" ? journey.arriveWalkMinutes : journey.arriveBikeMinutes} ${t(`journey.${mode}`, language)}`}
                muted={preference !== "both" && preference !== mode}
                testId={`arrive-${mode}-time-${index}`}
              />
            ))}
          </div>
        </Section>
      </div>
    </motion.article>
  );
}

const MODE_GRID =
  "grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-3 w-full justify-items-center sm:w-fit sm:justify-items-start";

function Section({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("px-4 py-3 sm:py-4 flex flex-col items-center gap-2", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">{label}</h3>
      {children}
    </section>
  );
}

function ModeTime({
  icon: Icon,
  time,
  detail,
  emphasis = false,
  muted = false,
  missed = false,
  hurry = false,
  testId,
}: {
  icon: LucideIcon;
  time: string;
  detail: string;
  /** Large leave time (preferred mode). */
  emphasis?: boolean;
  /** Smaller and lighter (non-preferred mode). */
  muted?: boolean;
  missed?: boolean;
  /** Leave time just passed but still makeable by hurrying. */
  hurry?: boolean;
  testId: string;
}) {
  const { language } = useLanguage();
  return (
    <div
      data-testid={testId}
      className={cn("flex items-center gap-2.5", missed && "opacity-40", muted && "opacity-70")}
      title={missed ? t('journey.missed', language) : hurry ? t('glance.hurry', language) : undefined}
    >
      <span className="w-8 h-8 rounded-full bg-secondary text-foreground/70 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-mono-numbers tracking-tighter",
            emphasis ? "text-2xl font-semibold text-foreground" : "text-lg font-medium text-foreground/80",
            missed && "line-through",
            hurry && "text-hurry"
          )}
        >
          {format(parseISO(time), "HH:mm")}
        </span>
        <span className={cn("text-xs mt-1", hurry ? "text-hurry font-medium" : "text-muted-foreground")}>
          {hurry ? t('glance.hurry', language) : detail}
        </span>
      </span>
    </div>
  );
}

export function LinePill({
  leg,
  platformLabel,
}: {
  leg: JourneyCardProps['journey']['journey']['legs'][number];
  platformLabel: string;
}) {
  const platformChanged = !!leg.platform && !!leg.plannedPlatform && leg.platform !== leg.plannedPlatform;
  return (
    // Styled like a passenger information display: line in brand blue, track in a tinted field.
    <span className="inline-flex items-stretch rounded-md overflow-hidden text-xs font-mono-numbers font-medium whitespace-nowrap border border-primary">
      <span className="bg-primary text-primary-foreground px-1.5 py-0.5 flex items-center gap-1">
        <TrainFront className="w-3 h-3" aria-hidden />
        {leg.lineName}
      </span>
      {leg.platform && (
        <span className={cn("bg-primary-tint px-1.5 py-0.5", platformChanged ? "text-late" : "text-foreground")}>
          {platformLabel} {leg.platform}
          {platformChanged && <span className="ml-1 line-through text-muted-foreground font-normal">{leg.plannedPlatform}</span>}
        </span>
      )}
    </span>
  );
}

export function DepartureTime({
  leg,
  onTimeLabel,
}: {
  leg: JourneyCardProps['journey']['journey']['legs'][number];
  onTimeLabel: string;
}) {
  const late = leg.delay !== null && leg.delay > 0;
  const onTime = leg.delay === 0;
  return (
    <span className="flex items-baseline gap-1 font-mono-numbers whitespace-nowrap">
      <span className={cn("text-sm font-medium", late ? "text-late" : onTime ? "text-success" : "text-foreground/80")}>
        {format(parseISO(leg.departure), "HH:mm")}
      </span>
      {late && (
        <>
          <span className="text-xs line-through text-muted-foreground">{format(parseISO(leg.plannedDeparture), "HH:mm")}</span>
          <span className="text-xs font-semibold text-late">+{leg.delay}</span>
        </>
      )}
      {onTime && (
        <span className="self-center text-success" title={onTimeLabel}>
          <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />
          <span className="sr-only">{onTimeLabel}</span>
        </span>
      )}
    </span>
  );
}
