import { Fragment } from "react";
import { Train, ArrowRight, Footprints, Bike, Briefcase, Home as HomeIcon } from "lucide-react";
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

export function JourneyCard({ journey, index }: JourneyCardProps) {
  const {
    journey: j,
    leaveHomeWalkTime,
    leaveHomeBikeTime,
    walkTimeMinutes,
    bikeTimeMinutes,
    arriveWalkTime,
    arriveBikeTime,
    arriveWalkMinutes,
    arriveBikeMinutes,
    finalDestinationType,
  } = journey;
  const DestIcon = finalDestinationType === 'work' ? Briefcase : HomeIcon;
  const { language } = useLanguage();

  const destLabel = finalDestinationType === 'work' ? t('journey.work', language) : t('journey.home', language);


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="border border-border rounded p-4 hover:bg-secondary/30 transition-colors"
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">

        {/* Left Column: Leave Home Times — side by side on narrow screens, stacked from sm upwards */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col flex-1">
          <div
            data-testid={`leave-walk-time-${index}`}
            className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2.5"
          >
            <div className="w-7 h-7 rounded-md bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <Footprints className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold font-mono-numbers tracking-tighter leading-none text-foreground">
                {format(parseISO(leaveHomeWalkTime), "HH:mm")}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">{walkTimeMinutes}{t('journey.walk', language)}</span>
            </div>
          </div>

          <div
            data-testid={`leave-bike-time-${index}`}
            className="flex items-center gap-3 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2.5"
          >
            <div className="w-7 h-7 rounded-md bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
              <Bike className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold font-mono-numbers tracking-tighter leading-none text-foreground">
                {format(parseISO(leaveHomeBikeTime), "HH:mm")}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">{bikeTimeMinutes}{t('journey.bike', language)}</span>
            </div>
          </div>
        </div>

        {/* Middle Column: one pill per train with its track and its departure time underneath */}
        <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-2 px-2 py-1">
          {j.legs.map((leg, legIndex) => {
            const platformChanged = !!leg.platform && !!leg.plannedPlatform && leg.platform !== leg.plannedPlatform;
            const legDelayed = leg.delay !== null && leg.delay > 0;
            return (
              <Fragment key={legIndex}>
                {legIndex > 0 && <ArrowRight className="w-3 h-3 opacity-40 shrink-0 mt-1.5" />}
                <div data-testid={`leg-${index}-${legIndex}`} className="flex flex-col items-center gap-1">
                  <div className="bg-secondary pl-2 pr-1 py-0.5 rounded-full border border-border/50 text-xs flex items-center gap-1.5 whitespace-nowrap shadow-sm">
                    <span className="font-bold text-primary flex items-center gap-1">
                      <Train className="w-3 h-3" />
                      {leg.lineName}
                    </span>
                    {leg.platform && (
                      <span className="bg-background rounded-full px-1.5 text-muted-foreground">
                        {t('journey.platform.short', language)}{" "}
                        <span className={cn("font-semibold", platformChanged ? "text-destructive" : "text-foreground/80")}>
                          {leg.platform}
                        </span>
                        {platformChanged && <span className="ml-1 line-through opacity-50">{leg.plannedPlatform}</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-mono-numbers whitespace-nowrap">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        legDelayed ? "text-destructive" : leg.delay === 0 ? "text-emerald-600" : "text-foreground/70"
                      )}
                      title={leg.delay === 0 ? t('journey.on-time', language) : undefined}
                    >
                      {format(parseISO(leg.departure), "HH:mm")}
                    </span>
                    {legDelayed && (
                      <>
                        <span className="text-xs line-through opacity-50">{format(parseISO(leg.plannedDeparture), "HH:mm")}</span>
                        <span className="text-xs text-destructive font-medium">+{leg.delay}{t('journey.min', language)}</span>
                      </>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        {/* Right Column: Arrival at the destination address — walking and biking the last mile */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col flex-1">
          <div
            data-testid={`arrive-walk-time-${index}`}
            className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2.5"
          >
            <div className="w-7 h-7 rounded-md bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <Footprints className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold font-mono-numbers tracking-tighter leading-none text-foreground">
                {format(parseISO(arriveWalkTime), "HH:mm")}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">{arriveWalkMinutes}{t('journey.walk', language)}</span>
            </div>
            <DestIcon className="w-4 h-4 text-amber-500 ml-auto shrink-0" aria-label={destLabel} />
          </div>

          <div
            data-testid={`arrive-bike-time-${index}`}
            className="flex items-center gap-3 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2.5"
          >
            <div className="w-7 h-7 rounded-md bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
              <Bike className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold font-mono-numbers tracking-tighter leading-none text-foreground">
                {format(parseISO(arriveBikeTime), "HH:mm")}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">{arriveBikeMinutes}{t('journey.bike', language)}</span>
            </div>
            <DestIcon className="w-4 h-4 text-amber-500 ml-auto shrink-0" aria-label={destLabel} />
          </div>
        </div>

      </div>
    </motion.div>
  );
}
