import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";

interface JourneyRefreshButtonProps {
  onRefresh: () => void;
  isLoading: boolean;
  lastUpdated: number | undefined;
}

export function JourneyRefreshButton({ 
  onRefresh, 
  isLoading,
  lastUpdated 
}: JourneyRefreshButtonProps) {
  const { language } = useLanguage();

  const formatLastUpdated = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return t('dashboard.updated.justNow', language);
    if (minutes < 60) return t('dashboard.updated.minutesAgo', language).replace('{minutes}', String(minutes));
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('dashboard.updated.hoursAgo', language).replace('{hours}', String(hours));
    
    const days = Math.floor(hours / 24);
    return t('dashboard.updated.daysAgo', language).replace('{days}', String(days));
  };

  return (
    <div className="flex items-center gap-2">
      {lastUpdated && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatLastUpdated(lastUpdated)}</span>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="gap-1"
      >
        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">
          {t('dashboard.refresh', language)}
        </span>
      </Button>
    </div>
  );
}
