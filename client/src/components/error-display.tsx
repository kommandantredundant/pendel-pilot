import { Link } from 'wouter';
import { Settings, Server, Train, MapPin, Route, AlertCircle } from 'lucide-react';
import { AppError, ErrorResponsibility, isAppError } from '@/lib/app-error';
import type { Language } from '@/lib/i18n';
import { t } from '@/lib/i18n';

interface ErrorDisplayProps {
  /** The error to display */
  error: AppError | Error | unknown;
  
  /** Current language for translations */
  language: Language;
  
  /** Optional CSS class name */
  className?: string;
  
  /** Whether to show the fix action button/link */
  showFixAction?: boolean;
  
  /** Custom fix action handler (overrides default) */
  onFixAction?: () => void;
}

const responsibilityIcons: Record<ErrorResponsibility, React.ComponentType<{ className?: string }>> = {
  [ErrorResponsibility.USER]: Settings,
  [ErrorResponsibility.SERVER]: Server,
  [ErrorResponsibility.TRANSPORT_API]: Train,
  [ErrorResponsibility.GEOCODING_API]: MapPin,
  [ErrorResponsibility.OSRM_API]: Route,
};

const responsibilityColors: Record<ErrorResponsibility, string> = {
  [ErrorResponsibility.USER]: 'text-primary',
  [ErrorResponsibility.SERVER]: 'text-destructive',
  [ErrorResponsibility.TRANSPORT_API]: 'text-amber-500',
  [ErrorResponsibility.GEOCODING_API]: 'text-amber-500',
  [ErrorResponsibility.OSRM_API]: 'text-amber-500',
};

const responsibilityBgColors: Record<ErrorResponsibility, string> = {
  [ErrorResponsibility.USER]: 'bg-primary/10',
  [ErrorResponsibility.SERVER]: 'bg-destructive/10',
  [ErrorResponsibility.TRANSPORT_API]: 'bg-amber-500/10',
  [ErrorResponsibility.GEOCODING_API]: 'bg-amber-500/10',
  [ErrorResponsibility.OSRM_API]: 'bg-amber-500/10',
};

const responsibilityBorderColors: Record<ErrorResponsibility, string> = {
  [ErrorResponsibility.USER]: 'border-primary/20',
  [ErrorResponsibility.SERVER]: 'border-destructive/20',
  [ErrorResponsibility.TRANSPORT_API]: 'border-amber-500/20',
  [ErrorResponsibility.GEOCODING_API]: 'border-amber-500/20',
  [ErrorResponsibility.OSRM_API]: 'border-amber-500/20',
};

export function ErrorDisplay({ 
  error, 
  language, 
  className = '',
  showFixAction = true,
  onFixAction 
}: ErrorDisplayProps) {
  // Handle non-AppError objects
  let appError: AppError | null = null;
  let genericMessage = '';
  
  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof Error) {
    genericMessage = error.message;
  } else {
    genericMessage = t('error.generic.unknown', language);
  }

  if (!appError) {
    // Fallback for generic errors
    return (
      <div className={`bg-destructive/10 border border-destructive/20 rounded-2xl p-6 flex items-start gap-4 ${className}`}>
        <AlertCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
        <div>
          <h3 className="text-destructive font-bold text-lg">{t('error.generic.title', language)}</h3>
          <p className="text-destructive/80 mt-1">{genericMessage}</p>
        </div>
      </div>
    );
  }

  const Icon = responsibilityIcons[appError.responsibility];
  const iconColor = responsibilityColors[appError.responsibility];
  const bgColor = responsibilityBgColors[appError.responsibility];
  const borderColor = responsibilityBorderColors[appError.responsibility];

  return (
    <div className={`${bgColor} border ${borderColor} rounded-2xl p-6 flex items-start gap-4 ${className}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bgColor}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={`font-bold text-lg ${iconColor}`}>
          {appError.getTitle(language)}
        </h3>
        <p className="text-sm mt-1">
          {appError.getWhatIsWrong(language)}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {appError.getWhatToCheck(language)}
        </p>
        {showFixAction && appError.fixRoute && (
          <div className="mt-4">
            {onFixAction ? (
              <button
                onClick={onFixAction}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {appError.getFixLabel(language)} →
              </button>
            ) : (
              <Link
                to={appError.fixRoute}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {appError.getFixLabel(language)} →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
