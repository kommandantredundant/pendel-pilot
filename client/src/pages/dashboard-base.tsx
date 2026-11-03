import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Settings as SettingsIcon, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useJourneysWithRefresh } from "@/hooks/use-transport";
import { useSettings as useUserConfig } from "@/hooks/use-settings";
import { JourneyCard } from "@/components/journey-card";
import { ErrorDisplay } from "@/components/error-display";
import { JourneyRefreshButton } from "@/components/journey-refresh-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { Timepicker } from "timepicker-ui-react";
import "timepicker-ui/index.css";
import { TrainIcon } from "@/components/train-icon";

interface DashboardBaseProps {
  destination: "work" | "home";
}

export function DashboardBase({ destination }: DashboardBaseProps) {
  const [timePlanning, setTimePlanning] = useState<"now" | "later">("now");
  const [arrivalDeparture, setArrivalDeparture] = useState<"arrival" | "departure">("arrival");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const timePickerRef = useRef<HTMLInputElement>(null);
  const { language } = useLanguage();

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  const { data: settings, isLoading: isLoadingSettings } = useUserConfig();

  const {
    data: journeys,
    isLoading: isLoadingJourneys,
    isError,
    error,
    refresh,
    lastUpdated,
  } = useJourneysWithRefresh(
    destination,
    timePlanning,
    arrivalDeparture,
    selectedTime || "00:00"
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleTimeConfirm = (eventData: { hour?: string; minutes?: string }) => {
    if (eventData.hour && eventData.minutes && isMountedRef.current) {
      setSelectedTime(`${eventData.hour}:${eventData.minutes}`);
    }
  };

  const handleNowClick = () => {
    if (isMountedRef.current) {
      setTimePlanning("now");
      setSelectedTime("");
    }
  };

  const handleLaterClick = () => {
    if (isMountedRef.current) {
      if (timePlanning === "later" && timePickerRef.current) {
        timePickerRef.current.click();
      } else {
        setTimePlanning("later");
        setTimeout(() => {
          timePickerRef.current?.click();
        }, 100);
      }
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32 rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded" />)}
        </div>
      </div>
    );
  }

  // Empty state if settings are missing
  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <h2 className="text-xl font-semibold">{t('dashboard.setup', language)}</h2>
        <p className="text-muted-foreground max-w-sm">
          {t('dashboard.setup.desc', language)}
        </p>
        <Link href="/settings">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <SettingsIcon className="w-4 h-4 mr-2" />
            {t('dashboard.configure', language)}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        {/* The bottom nav already names the direction; the heading shows the actual route. */}
        <h1 className="text-base font-semibold flex items-center gap-1.5 flex-wrap">
          <span className="sr-only">{t(destination === "work" ? 'dashboard.work.title' : 'dashboard.home.title', language)}:</span>
          <span>{destination === "work" ? settings.homeStationName : settings.workStationName}</span>
          <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{destination === "work" ? settings.workStationName : settings.homeStationName}</span>
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('dashboard.plan', language)}>
            <Tabs
              value={timePlanning}
              onValueChange={(v) => {
                if (v === "now") {
                  handleNowClick();
                } else {
                  handleLaterClick();
                }
              }}
            >
              <TabsList className="grid grid-cols-2 bg-card border border-border/70 h-9">
                <TabsTrigger value="now" className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {t('dashboard.now', language)}
                </TabsTrigger>
                <TabsTrigger value="later" className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {selectedTime ? `${t('dashboard.later', language)} · ${selectedTime}` : t('dashboard.later', language)}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {timePlanning === 'later' && (
              <Tabs
                value={arrivalDeparture}
                onValueChange={(v) => {
                  if (isMountedRef.current) {
                    setArrivalDeparture(v as "arrival" | "departure");
                  }
                }}
              >
                <TabsList className="grid grid-cols-2 bg-card border border-border/70 h-9">
                  <TabsTrigger value="departure" className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    {t('dashboard.departure', language)}
                  </TabsTrigger>
                  <TabsTrigger value="arrival" className="text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    {t('dashboard.arrival', language)}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>

          <JourneyRefreshButton
            onRefresh={refresh}
            isLoading={isLoadingJourneys}
            lastUpdated={lastUpdated}
          />
        </div>
      </header>
      <Timepicker
        ref={timePickerRef}
        value={selectedTime}
        defaultValue={selectedTime}
        onConfirm={handleTimeConfirm}
        options={{
          clock: {
            type: '24h',
          },
          ui: {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'basic',
            mobile: window.innerWidth < 768,
            enableSwitchIcon: false,
          },
        }}
        className="hidden"
      />

      {isError && (
        <ErrorDisplay
          error={error}
          language={language}
          showFixAction={true}
        />
      )}

      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {isLoadingJourneys ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-36 w-full rounded-xl bg-card border border-border/70" />)}
            </motion.div>
          ) : journeys?.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card rounded-xl border border-dashed border-border p-12 text-center flex flex-col items-center justify-center"
            >
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <TrainIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2">{t('dashboard.no-trains.title', language)}</h3>
              <p className="text-muted-foreground">{t('dashboard.no-trains.desc', language)}</p>
            </motion.div>
          ) : (
            <motion.div 
              key="list"
              className="space-y-3"
            >
              {journeys?.map((journey: any, index: number) => (
                <JourneyCard
                  key={index}
                  journey={journey}
                  index={index}
                  preference={destination === "work" ? settings.stationModeFromHome : settings.stationModeFromWork}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
