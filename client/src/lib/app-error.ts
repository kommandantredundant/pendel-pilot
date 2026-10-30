import type { Language } from './i18n';
import { t } from './i18n';

/**
 * Defines who has the capability to fix an error
 */
export enum ErrorResponsibility {
  /** User can fix this issue (e.g., incomplete configuration) */
  USER = 'user',
  
  /** Server/service owner needs to fix this (e.g., server down) */
  SERVER = 'server',
  
  /** Transport API provider needs to fix this (e.g., API outage) */
  TRANSPORT_API = 'transport-api',
  
  /** Geocoding API provider needs to fix this (e.g., Photon API outage) */
  GEOCODING_API = 'geocoding-api',
  
  /** OSRM routing API provider needs to fix this (e.g., routing service outage) */
  OSRM_API = 'osrm-api',
}

/**
 * Categorizes errors by their source and nature
 */
export enum ErrorType {
  // Geocoding errors
  GEOCODING_NETWORK = 'geocoding-network',
  GEOCODING_NOT_FOUND = 'geocoding-not-found',
  GEOCODING_RATE_LIMIT = 'geocoding-rate-limit',
  GEOCODING_INVALID_RESPONSE = 'geocoding-invalid-response',
  
  // OSRM routing errors
  OSRM_NETWORK = 'osrm-network',
  OSRM_NO_ROUTE = 'osrm-no-route',
  OSRM_INVALID_RESPONSE = 'osrm-invalid-response',
  
  // Transport API errors
  TRANSPORT_NETWORK = 'transport-network',
  TRANSPORT_NOT_CONFIGURED = 'transport-not-configured',
  TRANSPORT_STATIONS_NOT_SET = 'transport-stations-not-set',
  TRANSPORT_NO_JOURNEYS = 'transport-no-journeys',
  TRANSPORT_INVALID_RESPONSE = 'transport-invalid-response',
  
  // General app errors
  SETTINGS_NOT_CONFIGURED = 'settings-not-configured',
  STORAGE_NOT_AVAILABLE = 'storage-not-available',
  VALIDATION_ERROR = 'validation-error',
  UNKNOWN_ERROR = 'unknown-error',
}

/**
 * Options for creating an AppError
 */
export interface AppErrorOptions {
  /** Who can fix this error */
  responsibility: ErrorResponsibility;
  
  /** Optional route to navigate to fix the issue */
  fixRoute?: string;
  
  /** Label for the fix button/link */
  fixLabel?: string;
  
  /** Original error that caused this (for debugging) */
  cause?: unknown;
}

/**
 * Application error with structured, user-friendly messages
 * All message keys reference i18n translation keys
 */
export class AppError extends Error {
  /** Error type from the ErrorType enum */
  readonly type: ErrorType;
  
  /** Who can fix this error */
  readonly responsibility: ErrorResponsibility;
  
  /** i18n key for the error title */
  readonly titleKey: string;
  
  /** i18n key for "what is wrong" explanation */
  readonly whatIsWrongKey: string;
  
  /** i18n key for "what to check" action item */
  readonly whatToCheckKey: string;
  
  /** Optional route to navigate to fix the issue */
  readonly fixRoute?: string;
  
  /** i18n key for the fix button/link label */
  readonly fixLabelKey?: string;
  
  /** Original error that caused this (for debugging) */
  readonly cause?: unknown;

  constructor(type: ErrorType, options: AppErrorOptions) {
    super(type);
    this.name = 'AppError';
    this.type = type;
    this.responsibility = options.responsibility;
    
    // Generate i18n keys based on error type
    this.titleKey = `error.${type}.title`;
    this.whatIsWrongKey = `error.${type}.whatIsWrong`;
    this.whatToCheckKey = `error.${type}.whatToCheck`;
    
    this.fixRoute = options.fixRoute;
    this.fixLabelKey = options.fixLabel ? `error.${type}.fixLabel` : undefined;
    this.cause = options.cause;
  }

  /**
   * Get the localized title for this error
   */
  getTitle(language: Language): string {
    return t(this.titleKey, language);
  }

  /**
   * Get the localized "what is wrong" message
   */
  getWhatIsWrong(language: Language): string {
    return t(this.whatIsWrongKey, language);
  }

  /**
   * Get the localized "what to check" message
   */
  getWhatToCheck(language: Language): string {
    return t(this.whatToCheckKey, language);
  }

  /**
   * Get the localized fix label (if available)
   */
  getFixLabel(language: Language): string | undefined {
    return this.fixLabelKey ? t(this.fixLabelKey, language) : undefined;
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Error factory for creating typed AppError instances
 */
export class ErrorFactory {
  static geocodingNetwork(cause?: unknown): AppError {
    return new AppError(ErrorType.GEOCODING_NETWORK, {
      responsibility: ErrorResponsibility.GEOCODING_API,
      cause,
    });
  }

  static geocodingNotFound(cause?: unknown): AppError {
    return new AppError(ErrorType.GEOCODING_NOT_FOUND, {
      responsibility: ErrorResponsibility.USER,
      cause,
    });
  }

  static geocodingRateLimit(cause?: unknown): AppError {
    return new AppError(ErrorType.GEOCODING_RATE_LIMIT, {
      responsibility: ErrorResponsibility.GEOCODING_API,
      cause,
    });
  }

  static geocodingInvalidResponse(cause?: unknown): AppError {
    return new AppError(ErrorType.GEOCODING_INVALID_RESPONSE, {
      responsibility: ErrorResponsibility.GEOCODING_API,
      cause,
    });
  }

  static osrmNetwork(cause?: unknown): AppError {
    return new AppError(ErrorType.OSRM_NETWORK, {
      responsibility: ErrorResponsibility.OSRM_API,
      cause,
    });
  }

  static osrmNoRoute(cause?: unknown): AppError {
    return new AppError(ErrorType.OSRM_NO_ROUTE, {
      responsibility: ErrorResponsibility.USER,
      cause,
    });
  }

  static osrmInvalidResponse(cause?: unknown): AppError {
    return new AppError(ErrorType.OSRM_INVALID_RESPONSE, {
      responsibility: ErrorResponsibility.OSRM_API,
      cause,
    });
  }

  static transportNetwork(cause?: unknown): AppError {
    return new AppError(ErrorType.TRANSPORT_NETWORK, {
      responsibility: ErrorResponsibility.TRANSPORT_API,
      cause,
    });
  }

  static transportNotConfigured(cause?: unknown): AppError {
    return new AppError(ErrorType.TRANSPORT_NOT_CONFIGURED, {
      responsibility: ErrorResponsibility.SERVER,
      fixRoute: '/settings',
      fixLabel: 'Go to Settings',
      cause,
    });
  }

  static transportStationsNotSet(cause?: unknown): AppError {
    return new AppError(ErrorType.TRANSPORT_STATIONS_NOT_SET, {
      responsibility: ErrorResponsibility.USER,
      fixRoute: '/settings',
      fixLabel: 'Configure Stations',
      cause,
    });
  }

  static transportNoJourneys(cause?: unknown): AppError {
    return new AppError(ErrorType.TRANSPORT_NO_JOURNEYS, {
      responsibility: ErrorResponsibility.USER,
      fixRoute: '/settings',
      fixLabel: 'Check Stations',
      cause,
    });
  }

  static transportInvalidResponse(cause?: unknown): AppError {
    return new AppError(ErrorType.TRANSPORT_INVALID_RESPONSE, {
      responsibility: ErrorResponsibility.TRANSPORT_API,
      cause,
    });
  }

  static settingsNotConfigured(cause?: unknown): AppError {
    return new AppError(ErrorType.SETTINGS_NOT_CONFIGURED, {
      responsibility: ErrorResponsibility.USER,
      fixRoute: '/settings',
      fixLabel: 'Setup Now',
      cause,
    });
  }

  static storageNotAvailable(cause?: unknown): AppError {
    return new AppError(ErrorType.STORAGE_NOT_AVAILABLE, {
      responsibility: ErrorResponsibility.SERVER,
      cause,
    });
  }

  static validationError(cause?: unknown): AppError {
    return new AppError(ErrorType.VALIDATION_ERROR, {
      responsibility: ErrorResponsibility.USER,
      cause,
    });
  }

  static unknownError(cause?: unknown): AppError {
    return new AppError(ErrorType.UNKNOWN_ERROR, {
      responsibility: ErrorResponsibility.SERVER,
      cause,
    });
  }
}
