import { Fragment } from "react";
import { Train, ChevronRight, Footprints, Bike, Check, type LucideIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "./layout";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";

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
}

/**
 * One connection as three labelled sections: when to leave, which trains, when you arrive.
 * Sections sit side by side from `sm` upwards and stack on phones, centred, separated by hairlines
 * instead of nested boxes. Colour is reserved for punctuality; transport modes use icons only.
 */
export function JourneyCard({ journey, index }: JourneyCardProps) {
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
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-3 w-full justify-items-center sm:w-fit sm:justify-items-start">
            <ModeTime
              icon={Footprints}
              time={journey.leaveHomeWalkTime}
              detail={`${journey.walkTimeMinutes} ${t('journey.walk', language)}`}
              missed={Date.parse(journey.leaveHomeWalkTime) < now}
              emphasis
              testId={`leave-walk-time-${index}`}
            />
            <ModeTime
              icon={Bike}
              time={journey.leaveHomeBikeTime}
              detail={`${journey.bikeTimeMinutes} ${t('journey.bike', language)}`}
              missed={Date.parse(journey.leaveHomeBikeTime) < now}
              emphasis
              testId={`leave-bike-time-${index}`}
            />
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
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-3 w-full justify-items-center sm:w-fit sm:justify-items-start">
            <ModeTime
              icon={Footprints}
              time={journey.arriveWalkTime}
              detail={`${journey.arriveWalkMinutes} ${t('journey.walk', language)}`}
              testId={`arrive-walk-time-${index}`}
            />
            <ModeTime
              icon={Bike}
              time={journey.arriveBikeTime}
              detail={`${journey.arriveBikeMinutes} ${t('journey.bike', language)}`}
              testId={`arrive-bike-time-${index}`}
            />
          </div>
        </Section>
      </div>
    </motion.article>
  );
}

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
  missed = false,
  testId,
}: {
  icon: LucideIcon;
  time: string;
  detail: string;
  emphasis?: boolean;
  missed?: boolean;
  testId: string;
}) {
  const { language } = useLanguage();
  return (
    <div
      data-testid={testId}
      className={cn("flex items-center gap-2.5", missed && "opacity-40")}
      title={missed ? t('journey.missed', language) : undefined}
    >
      <span className="w-8 h-8 rounded-full bg-secondary text-foreground/70 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-mono-numbers tracking-tighter",
            emphasis ? "text-2xl font-semibold text-foreground" : "text-lg font-medium text-foreground/80",
            missed && "line-through"
          )}
        >
          {format(parseISO(time), "HH:mm")}
        </span>
        <span className="text-xs text-muted-foreground mt-1">{detail}</span>
      </span>
    </div>
  );
}

function LinePill({
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
        <Train className="w-3 h-3" aria-hidden />
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

function DepartureTime({
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
