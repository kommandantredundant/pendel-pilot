import {
  CANONICAL_ADDRESS_TIME_FIELDS,
  CANONICAL_BUFFER_MIN_FIELDS,
  CANONICAL_ROUTE_DURATION_FIELDS,
  CANONICAL_STATION_ANCHOR_FIELDS,
  type CanonicalDirection,
  type CanonicalJourney,
  type CanonicalPoint,
  type CanonicalStation,
  type ValidationErrorDetail,
  type ValidationResult,
  validateCanonicalJourney
} from './canonicalJourney.ts';

/** The only browser state retained between visits. */
export const LOCAL_STORAGE_VERSION = 3;
export const LOCAL_STORAGE_PREFIX = `dailyjourney.v${LOCAL_STORAGE_VERSION}`;
export const LOCAL_STORAGE_KEYS = {
  commute: `${LOCAL_STORAGE_PREFIX}.commute`,
  lastSuccessfulJourney: `${LOCAL_STORAGE_PREFIX}.lastSuccessfulJourney`
} as const;

type LocalStorageKey = (typeof LOCAL_STORAGE_KEYS)[keyof typeof LOCAL_STORAGE_KEYS];

export interface LocalAddress extends CanonicalPoint {
  label?: string;
}

export interface LocalStation extends Required<CanonicalStation> {}

/** A single saved commute, rather than a collection of named profiles. */
export interface CommuteProfile {
  id: string;
  name: string;
  homeAddress: LocalAddress;
  homeStation: LocalStation;
  workStation: LocalStation;
  workAddress: LocalAddress;
  defaultDirection?: CanonicalDirection;
  createdAt: string;
  updatedAt: string;
}

/** The six journey-calculation settings associated with the saved commute. */
export interface BufferSettings {
  bufferInsideHomeStationMin: number;
  bufferInsideWorkStationMin: number;
  bufferLeaveHomeMin: number;
  bufferLeaveWorkMin: number;
  bufferPrepareWalkMin: number;
  bufferPrepareBikeMin: number;
}

export interface SavedCommute {
  profile: CommuteProfile;
  bufferSettings: BufferSettings;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function validateCommuteProfile(input: unknown): ValidationResult<CommuteProfile> {
  const errors: ValidationErrorDetail[] = [];
  if (!isRecord(input)) return { success: false, errors: [{ field: 'commuteProfile', message: 'commuteProfile must be an object.' }] };

  requireString(input, 'id', errors);
  requireString(input, 'name', errors);
  validateAddress(input.homeAddress, 'homeAddress', errors);
  validateStation(input.homeStation, 'homeStation', errors);
  validateStation(input.workStation, 'workStation', errors);
  validateAddress(input.workAddress, 'workAddress', errors);
  if (input.defaultDirection !== undefined && input.defaultDirection !== 'journeyWork' && input.defaultDirection !== 'journeyHome') {
    errors.push({ field: 'defaultDirection', message: 'defaultDirection must be journeyWork or journeyHome.' });
  }
  requireIsoDateTime(input, 'createdAt', errors);
  requireIsoDateTime(input, 'updatedAt', errors);
  return result(input, errors);
}

export function validateBufferSettings(input: unknown): ValidationResult<BufferSettings> {
  const errors: ValidationErrorDetail[] = [];
  if (!isRecord(input)) return { success: false, errors: [{ field: 'bufferSettings', message: 'bufferSettings must be an object.' }] };
  for (const field of CANONICAL_BUFFER_MIN_FIELDS) requireNonNegativeNumber(input, field, errors);
  return result(input, errors);
}

export function validateSavedCommute(input: unknown): ValidationResult<SavedCommute> {
  const errors: ValidationErrorDetail[] = [];
  if (!isRecord(input)) return { success: false, errors: [{ field: 'commute', message: 'commute must be an object.' }] };
  appendErrors(validateCommuteProfile(input.profile), 'profile', errors);
  appendErrors(validateBufferSettings(input.bufferSettings), 'bufferSettings', errors);
  return result(input, errors);
}

export function validatePersistedJourney(input: unknown): ValidationResult<CanonicalJourney> {
  return validateCanonicalJourney(input);
}

export function explainRequiredPersistedJourneyFields(): string[] {
  return ['direction', 'homeAddress', 'homeStation', 'workStation', 'workAddress', 'transportWork|transportHome', ...CANONICAL_STATION_ANCHOR_FIELDS, ...CANONICAL_ROUTE_DURATION_FIELDS, ...CANONICAL_ADDRESS_TIME_FIELDS];
}

/** A deliberately small localStorage wrapper with validation at every read boundary. */
export class DailyJourneyLocalStore {
  constructor(private readonly storage: KeyValueStorage) {}

  readCommute(): SavedCommute | undefined {
    const parsed = this.readJson(LOCAL_STORAGE_KEYS.commute);
    const validation = validateSavedCommute(parsed);
    return validation.success ? validation.data : undefined;
  }

  saveCommute(commute: SavedCommute): void {
    this.write(LOCAL_STORAGE_KEYS.commute, commute, validateSavedCommute, 'commute');
  }

  readLastSuccessfulJourney(): CanonicalJourney | undefined {
    const parsed = this.readJson(LOCAL_STORAGE_KEYS.lastSuccessfulJourney);
    const validation = validatePersistedJourney(parsed);
    return validation.success ? validation.data : undefined;
  }

  saveLastSuccessfulJourney(journey: CanonicalJourney): void {
    this.write(LOCAL_STORAGE_KEYS.lastSuccessfulJourney, journey, validatePersistedJourney, 'journey');
  }

  clearLastSuccessfulJourney(): void {
    this.storage.removeItem(LOCAL_STORAGE_KEYS.lastSuccessfulJourney);
  }

  private readJson(key: LocalStorageKey): unknown {
    const value = this.storage.getItem(key);
    if (value === null) return undefined;
    try { return JSON.parse(value) as unknown; } catch { return undefined; }
  }

  private write<T>(key: LocalStorageKey, value: T, validate: (input: unknown) => ValidationResult<T>, label: string): void {
    const validation = validate(value);
    if (!validation.success) throw new Error(`Cannot persist invalid ${label}: ${formatErrors(validation.errors)}`);
    this.storage.setItem(key, JSON.stringify(value));
  }
}

function appendErrors(validation: ValidationResult<unknown>, prefix: string, errors: ValidationErrorDetail[]): void {
  for (const error of validation.errors ?? []) errors.push({ field: `${prefix}.${error.field}`, message: error.message });
}
function result<T>(input: unknown, errors: ValidationErrorDetail[]): ValidationResult<T> {
  return errors.length ? { success: false, errors } : { success: true, data: input as T };
}
function isRecord(input: unknown): input is Record<string, unknown> { return typeof input === 'object' && input !== null && !Array.isArray(input); }
function requireString(input: Record<string, unknown>, field: string, errors: ValidationErrorDetail[], prefix = ''): void {
  if (typeof input[field] !== 'string' || (input[field] as string).trim() === '') errors.push({ field: prefix ? `${prefix}.${field}` : field, message: `${field} is required.` });
}
function requireIsoDateTime(input: Record<string, unknown>, field: string, errors: ValidationErrorDetail[]): void {
  if (typeof input[field] !== 'string' || Number.isNaN(Date.parse(input[field] as string))) errors.push({ field, message: `${field} must be an ISO 8601 datetime.` });
}
function requireNonNegativeNumber(input: Record<string, unknown>, field: string, errors: ValidationErrorDetail[]): void {
  if (typeof input[field] !== 'number' || !Number.isFinite(input[field]) || (input[field] as number) < 0) errors.push({ field, message: `${field} must be a non-negative finite number.` });
}
function validateAddress(input: unknown, field: string, errors: ValidationErrorDetail[]): void {
  validatePoint(input, field, errors);
  if (isRecord(input) && input.label !== undefined && (typeof input.label !== 'string' || input.label.trim() === '')) errors.push({ field: `${field}.label`, message: `${field}.label must be a non-empty string when provided.` });
}
function validateStation(input: unknown, field: string, errors: ValidationErrorDetail[]): void {
  validatePoint(input, field, errors);
  if (isRecord(input)) { requireString(input, 'id', errors, field); requireString(input, 'name', errors, field); }
}
function validatePoint(input: unknown, field: string, errors: ValidationErrorDetail[]): void {
  if (!isRecord(input)) { errors.push({ field, message: `${field} must include lat and lon.` }); return; }
  if (typeof input.lat !== 'number' || input.lat < -90 || input.lat > 90) errors.push({ field: `${field}.lat`, message: 'lat must be a number from -90 to 90.' });
  if (typeof input.lon !== 'number' || input.lon < -180 || input.lon > 180) errors.push({ field: `${field}.lon`, message: 'lon must be a number from -180 to 180.' });
}
function formatErrors(errors?: ValidationErrorDetail[]): string { return (errors ?? []).map((error) => `${error.field}: ${error.message}`).join('; '); }
