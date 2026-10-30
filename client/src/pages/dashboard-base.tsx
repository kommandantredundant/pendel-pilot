import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Settings as SettingsIcon, Train, AlertCircle } from "lucide-react";
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
        <Link href="/how">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <SettingsIcon className="w-4 h-4 mr-2" />
            {t('dashboard.configure', language)}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium">Plan ahead:</span>

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
          <TabsList className="grid grid-cols-2 gap-1 bg-secondary">
            <TabsTrigger
              value="now"
              className="rounded text-xs font-medium data-[state=active]:bg-background"
            >
              Now
            </TabsTrigger>
            <TabsTrigger
              value="later"
              className="rounded text-xs font-medium data-[state=active]:bg-background"
            >
              {selectedTime ? `Later: ${selectedTime}` : "Later"}
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
            <TabsList className="grid grid-cols-2 gap-1 bg-secondary">
              <TabsTrigger
                value="arrival"
                className="rounded text-xs font-medium data-[state=active]:bg-background"
              >
                {t('dashboard.arrival', language)}
              </TabsTrigger>
              <TabsTrigger
                value="departure"
                className="rounded text-xs font-medium data-[state=active]:bg-background"
              >
                {t('dashboard.departure', language)}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <JourneyRefreshButton
          onRefresh={refresh}
          isLoading={isLoadingJourneys}
          lastUpdated={lastUpdated}
        />
      </div>
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
            theme: 'basic',
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
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl bg-card border border-border/50" />)}
            </motion.div>
          ) : journeys?.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center justify-center border-dashed"
            >
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Train className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2">{t('dashboard.no-trains.title', language)}</h3>
              <p className="text-muted-foreground">{t('dashboard.no-trains.desc', language)}</p>
            </motion.div>
          ) : (
            <motion.div 
              key="list"
              className="space-y-5"
            >
              {journeys?.map((journey: any, index: number) => (
                <JourneyCard key={index} journey={journey} index={index} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
