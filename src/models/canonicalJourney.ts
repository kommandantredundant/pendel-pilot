export type ApiDirection = 'work' | 'home';
export type CanonicalDirection = 'journeyWork' | 'journeyHome';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface CanonicalPoint {
  lat: number;
  lon: number;
}

export interface CanonicalStation extends CanonicalPoint {
  id: string;
  name?: string;
}

export interface CanonicalBuffersMin {
  bufferInsideHomeStationMin: number;
  bufferInsideWorkStationMin: number;
  bufferLeaveHomeMin: number;
  bufferLeaveWorkMin: number;
  bufferPrepareWalkMin: number;
  bufferPrepareBikeMin: number;
}

export interface CanonicalBuffersSec {
  bufferInsideHomeStationSec: number;
  bufferInsideWorkStationSec: number;
  bufferLeaveHomeSec: number;
  bufferLeaveWorkSec: number;
  bufferPrepareWalkSec: number;
  bufferPrepareBikeSec: number;
}

export type CanonicalBuffers = CanonicalBuffersMin & CanonicalBuffersSec;

export interface InputBuffers {
  bufferInsideHomeStation?: number;
  bufferInsideWorkStation?: number;
  bufferLeaveHome?: number;
  bufferLeaveWork?: number;
  bufferPrepareWalk?: number;
  bufferPrepareBike?: number;
}

export type TransportDelayStatus = 'onTime' | 'delayed' | 'unknown';

export interface TransportTiming {
  departureTime: string;
  arrivalTime: string;
  plannedDepartureTime?: string;
  plannedArrivalTime?: string;
  departureDelaySec?: number;
  arrivalDelaySec?: number;
  delayStatus?: TransportDelayStatus;
}

export interface CanonicalJourneySeed extends CanonicalBuffers {
  direction: CanonicalDirection;
  homeAddress: CanonicalPoint;
  homeStation: CanonicalStation;
  workStation: CanonicalStation;
  workAddress: CanonicalPoint;
  transportWork?: TransportTiming;
  transportHome?: TransportTiming;
  homeStationTime: string;
  workStationTime: string;
  routeHomeWalkSec: number;
  routeHomeBikeSec: number;
  routeWorkWalkSec: number;
  routeWorkBikeSec: number;
}

export interface CanonicalJourney extends CanonicalJourneySeed {
  homeAddressWalkTime: string;
  homeAddressBikeTime: string;
  workAddressWalkTime: string;
  workAddressBikeTime: string;
}

export interface CalculateJourneyRequest {
  homeStationId: string;
  workStationId: string;
  homeAddress: Coordinates;
  workAddress: Coordinates;
  direction: ApiDirection;
  /** At least one of departureTime/arrivalTime is required; departureTime wins when both are sent. */
  departureTime?: string;
  arrivalTime?: string;
  buffers?: InputBuffers;
  /** Number of connection options to return (1–6, default 1). */
  results?: number;
  /** Skip long-distance trains (ICE/IC/EC) when searching connections. */
  excludeLongDistance?: boolean;
}

export const MAX_JOURNEY_RESULTS = 6;

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

export const CANONICAL_BUFFER_MIN_FIELDS = [
  'bufferInsideHomeStationMin',
  'bufferInsideWorkStationMin',
  'bufferLeaveHomeMin',
  'bufferLeaveWorkMin',
  'bufferPrepareWalkMin',
  'bufferPrepareBikeMin'
] as const;

export const CANONICAL_BUFFER_SEC_FIELDS = [
  'bufferInsideHomeStationSec',
  'bufferInsideWorkStationSec',
  'bufferLeaveHomeSec',
  'bufferLeaveWorkSec',
  'bufferPrepareWalkSec',
  'bufferPrepareBikeSec'
] as const;

export const CANONICAL_ROUTE_DURATION_FIELDS = [
  'routeHomeWalkSec',
  'routeHomeBikeSec',
  'routeWorkWalkSec',
  'routeWorkBikeSec'
] as const;

export const CANONICAL_STATION_ANCHOR_FIELDS = ['homeStationTime', 'workStationTime'] as const;

export const CANONICAL_ADDRESS_TIME_FIELDS = [
  'homeAddressWalkTime',
  'homeAddressBikeTime',
  'workAddressWalkTime',
  'workAddressBikeTime'
] as const;

const DEFAULT_BUFFER_MINUTES: Required<InputBuffers> = {
  bufferInsideHomeStation: 0,
  bufferInsideWorkStation: 0,
  bufferLeaveHome: 0,
  bufferLeaveWork: 0,
  bufferPrepareWalk: 0,
  bufferPrepareBike: 0
};

const BUFFER_MIN_TO_SEC_FIELD: Record<keyof CanonicalBuffersMin, keyof CanonicalBuffersSec> = {
  bufferInsideHomeStationMin: 'bufferInsideHomeStationSec',
  bufferInsideWorkStationMin: 'bufferInsideWorkStationSec',
  bufferLeaveHomeMin: 'bufferLeaveHomeSec',
  bufferLeaveWorkMin: 'bufferLeaveWorkSec',
  bufferPrepareWalkMin: 'bufferPrepareWalkSec',
  bufferPrepareBikeMin: 'bufferPrepareBikeSec'
};

const NON_CANONICAL_SYNONYM_KEYS = new Set([
  'HomeStationTime',
  'WorkStationTime',
  'HomeAddressWalk',
  'HomeAddressBike',
  'WorkAddressWalk',
  'WorkAddressBike',
  'RouteHomeWalk',
  'RouteHomeBike',
  'RouteWorkWalk',
  'RouteWorkBike',
  'BufferInsideHomeStation',
  'BufferInsideWorkStation',
  'BufferLeaveHome',
  'BufferLeaveWork',
  'BufferPrepareWalk',
  'BufferPrepareBike',
  'origin',
  'destination',
  'fromStation',
  'toStation',
  'homeStationTimestamp',
  'workStationTimestamp',
  'homeStationDateTime',
  'workStationDateTime'
]);

export function apiDirectionToCanonical(direction: ApiDirection): CanonicalDirection {
  return direction === 'work' ? 'journeyWork' : 'journeyHome';
}

export function normalizeBuffers(buffers: InputBuffers = {}): CanonicalBuffers {
  const merged = { ...DEFAULT_BUFFER_MINUTES, ...buffers };

  return {
    bufferInsideHomeStationMin: merged.bufferInsideHomeStation,
    bufferInsideWorkStationMin: merged.bufferInsideWorkStation,
    bufferLeaveHomeMin: merged.bufferLeaveHome,
    bufferLeaveWorkMin: merged.bufferLeaveWork,
    bufferPrepareWalkMin: merged.bufferPrepareWalk,
    bufferPrepareBikeMin: merged.bufferPrepareBike,
    bufferInsideHomeStationSec: merged.bufferInsideHomeStation * 60,
    bufferInsideWorkStationSec: merged.bufferInsideWorkStation * 60,
    bufferLeaveHomeSec: merged.bufferLeaveHome * 60,
    bufferLeaveWorkSec: merged.bufferLeaveWork * 60,
    bufferPrepareWalkSec: merged.bufferPrepareWalk * 60,
    bufferPrepareBikeSec: merged.bufferPrepareBike * 60
  };
}

export function calculateJourneyWork(seed: CanonicalJourneySeed): CanonicalJourney {
  return {
    ...seed,
    direction: 'journeyWork',
    homeAddressWalkTime: subtractSeconds(
      seed.homeStationTime,
      seed.bufferInsideHomeStationSec + seed.routeHomeWalkSec + seed.bufferPrepareWalkSec + seed.bufferLeaveHomeSec
    ),
    homeAddressBikeTime: subtractSeconds(
      seed.homeStationTime,
      seed.bufferInsideHomeStationSec + seed.routeHomeBikeSec + seed.bufferPrepareBikeSec + seed.bufferLeaveHomeSec
    ),
    workAddressWalkTime: addSeconds(seed.workStationTime, seed.bufferInsideWorkStationSec + seed.routeWorkWalkSec),
    workAddressBikeTime: addSeconds(seed.workStationTime, seed.bufferInsideWorkStationSec + seed.routeWorkBikeSec)
  };
}

export function calculateJourneyHome(seed: CanonicalJourneySeed): CanonicalJourney {
  return {
    ...seed,
    direction: 'journeyHome',
    homeAddressWalkTime: addSeconds(seed.homeStationTime, seed.bufferInsideHomeStationSec + seed.routeHomeWalkSec),
    homeAddressBikeTime: addSeconds(seed.homeStationTime, seed.bufferInsideHomeStationSec + seed.routeHomeBikeSec),
    workAddressWalkTime: subtractSeconds(
      seed.workStationTime,
      seed.bufferInsideWorkStationSec + seed.routeWorkWalkSec + seed.bufferPrepareWalkSec + seed.bufferLeaveWorkSec
    ),
    workAddressBikeTime: subtractSeconds(
      seed.workStationTime,
      seed.bufferInsideWorkStationSec + seed.routeWorkBikeSec + seed.bufferPrepareBikeSec + seed.bufferLeaveWorkSec
    )
  };
}

export function calculateCanonicalJourney(seed: CanonicalJourneySeed): CanonicalJourney {
  return seed.direction === 'journeyWork' ? calculateJourneyWork(seed) : calculateJourneyHome(seed);
}

export function validateCalculateJourneyRequest(input: unknown): ValidationResult<CalculateJourneyRequest> {
  const errors: ValidationErrorDetail[] = [];
  const body = isRecord(input) ? input : undefined;

  if (!body) {
    return { success: false, errors: [{ field: 'body', message: 'Request body must be an object.' }] };
  }

  requireString(body, 'homeStationId', errors);
  requireString(body, 'workStationId', errors);
  validateCoordinates(body.homeAddress, 'homeAddress', errors);
  validateCoordinates(body.workAddress, 'workAddress', errors);

  if (body.direction !== 'work' && body.direction !== 'home') {
    errors.push({ field: 'direction', message: 'Direction must be either work or home.' });
  }

  if (body.departureTime === undefined && body.arrivalTime === undefined) {
    errors.push({ field: 'departureTime', message: 'Either departureTime or arrivalTime is required.' });
  }
  requireOptionalIsoDateTime(body, 'departureTime', errors);
  requireOptionalIsoDateTime(body, 'arrivalTime', errors);
  validateInputBuffers(body.buffers, errors);

  if (
    body.results !== undefined &&
    (typeof body.results !== 'number' || !Number.isInteger(body.results) || body.results < 1 || body.results > MAX_JOURNEY_RESULTS)
  ) {
    errors.push({ field: 'results', message: `results must be an integer between 1 and ${MAX_JOURNEY_RESULTS}.` });
  }
  if (body.excludeLongDistance !== undefined && typeof body.excludeLongDistance !== 'boolean') {
    errors.push({ field: 'excludeLongDistance', message: 'excludeLongDistance must be a boolean when provided.' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: body as unknown as CalculateJourneyRequest };
}

export function validateCanonicalJourneySeed(input: unknown): ValidationResult<CanonicalJourneySeed> {
  const errors = validateCanonicalJourneyShape(input, false);
  return errors.length > 0 ? { success: false, errors } : { success: true, data: input as CanonicalJourneySeed };
}

export function validateCanonicalJourney(input: unknown): ValidationResult<CanonicalJourney> {
  const errors = validateCanonicalJourneyShape(input, true);
  return errors.length > 0 ? { success: false, errors } : { success: true, data: input as CanonicalJourney };
}

function validateCanonicalJourneyShape(input: unknown, requireCalculatedTimes: boolean): ValidationErrorDetail[] {
  const errors: ValidationErrorDetail[] = [];
  if (!isRecord(input)) {
    return [{ field: 'body', message: 'Canonical journey payload must be an object.' }];
  }

  validateNoNonCanonicalSynonyms(input, errors);

  if (input.direction !== 'journeyWork' && input.direction !== 'journeyHome') {
    errors.push({ field: 'direction', message: 'Direction must be journeyWork or journeyHome.' });
  }

  validateCanonicalPoint(input.homeAddress, 'homeAddress', errors);
  validateCanonicalStation(input.homeStation, 'homeStation', errors);
  validateCanonicalStation(input.workStation, 'workStation', errors);
  validateCanonicalPoint(input.workAddress, 'workAddress', errors);

  requireIsoDateTime(input, 'homeStationTime', errors);
  requireIsoDateTime(input, 'workStationTime', errors);

  for (const field of CANONICAL_ROUTE_DURATION_FIELDS) {
    requireNonNegativeInteger(input, field, errors);
  }

  for (const field of CANONICAL_BUFFER_MIN_FIELDS) {
    requireNonNegativeNumber(input, field, errors);
  }

  for (const field of CANONICAL_BUFFER_SEC_FIELDS) {
    requireNonNegativeInteger(input, field, errors);
  }

  validateDerivedBufferSeconds(input, errors);
  validateDirectionTransport(input, errors);

  if (requireCalculatedTimes) {
    for (const field of CANONICAL_ADDRESS_TIME_FIELDS) {
      requireIsoDateTime(input, field, errors);
    }
  }

  return errors;
}

function validateDirectionTransport(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  if (input.direction === 'journeyWork') {
    validateTransportTiming(input.transportWork, 'transportWork', errors);
    if (input.transportHome !== undefined) {
      errors.push({ field: 'transportHome', message: 'journeyWork payloads must not include transportHome.' });
    }
    validateTransportAnchor(input.transportWork, 'transportWork.departureTime', input.homeStationTime, 'homeStationTime', errors);
    validateTransportAnchor(input.transportWork, 'transportWork.arrivalTime', input.workStationTime, 'workStationTime', errors);
  }

  if (input.direction === 'journeyHome') {
    validateTransportTiming(input.transportHome, 'transportHome', errors);
    if (input.transportWork !== undefined) {
      errors.push({ field: 'transportWork', message: 'journeyHome payloads must not include transportWork.' });
    }
    validateTransportAnchor(input.transportHome, 'transportHome.departureTime', input.workStationTime, 'workStationTime', errors);
    validateTransportAnchor(input.transportHome, 'transportHome.arrivalTime', input.homeStationTime, 'homeStationTime', errors);
  }
}

function validateTransportAnchor(
  transport: unknown,
  transportField: string,
  anchor: unknown,
  anchorField: string,
  errors: ValidationErrorDetail[]
): void {
  const [, timingField] = transportField.split('.');
  if (!isRecord(transport) || !timingField || typeof transport[timingField] !== 'string' || typeof anchor !== 'string') {
    return;
  }

  if (transport[timingField] !== anchor) {
    errors.push({ field: anchorField, message: `${anchorField} must match ${transportField}.` });
  }
}

function validateTransportTiming(value: unknown, field: string, errors: ValidationErrorDetail[]): void {
  if (!isRecord(value)) {
    errors.push({ field, message: `${field} is required for this journey direction.` });
    return;
  }

  requireIsoDateTime(value, 'departureTime', errors, field);
  requireIsoDateTime(value, 'arrivalTime', errors, field);
  requireOptionalIsoDateTime(value, 'plannedDepartureTime', errors, field);
  requireOptionalIsoDateTime(value, 'plannedArrivalTime', errors, field);
  requireOptionalNonNegativeInteger(value, 'departureDelaySec', errors, field);
  requireOptionalNonNegativeInteger(value, 'arrivalDelaySec', errors, field);
  validateDelayStatus(value, errors, field);
}

function validateDerivedBufferSeconds(input: Record<string, unknown>, errors: ValidationErrorDetail[]): void {
  for (const minField of CANONICAL_BUFFER_MIN_FIELDS) {
    const secField = BUFFER_MIN_TO_SEC_FIELD[minField];
    const minValue = input[minField];
    const secValue = input[secField];
    if (typeof minValue === 'number' && typeof secValue === 'number' && secValue !== minValue * 60) {
      errors.push({ field: secField, message: `${secField} must equal ${minField} * 60.` });
    }
  }
}

function validateNoNonCanonicalSynonyms(input: unknown, errors: ValidationErrorDetail[], path = ''): void {
  if (!isRecord(input)) {
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    const field = path ? `${path}.${key}` : key;
    if (NON_CANONICAL_SYNONYM_KEYS.has(key)) {
      errors.push({ field, message: `${key} is not a canonical journey field.` });
    }
    validateNoNonCanonicalSynonyms(value, errors, field);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(body: Record<string, unknown>, field: string, errors: ValidationErrorDetail[], prefix?: string): void {
  const value = body[field];
  const fullField = prefix ? `${prefix}.${field}` : field;
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push({ field: fullField, message: `${fullField} is required.` });
  }
}

function requireIsoDateTime(body: Record<string, unknown>, field: string, errors: ValidationErrorDetail[], prefix?: string): void {
  const value = body[field];
  const fullField = prefix ? `${prefix}.${field}` : field;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push({ field: fullField, message: `${fullField} must be an ISO 8601 datetime.` });
  }
}

function requireOptionalIsoDateTime(body: Record<string, unknown>, field: string, errors: ValidationErrorDetail[], prefix?: string): void {
  if (body[field] === undefined) {
    return;
  }
  requireIsoDateTime(body, field, errors, prefix);
}

function requireNonNegativeNumber(body: Record<string, unknown>, field: string, errors: ValidationErrorDetail[]): void {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push({ field, message: `${field} must be a non-negative finite number.` });
  }
}

function requireNonNegativeInteger(body: Record<string, unknown>, field: string, errors: ValidationErrorDetail[]): void {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    errors.push({ field, message: `${field} must be a non-negative integer number of seconds.` });
  }
}

function requireOptionalNonNegativeInteger(
  body: Record<string, unknown>,
  field: string,
  errors: ValidationErrorDetail[],
  prefix?: string
): void {
  const value = body[field];
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    errors.push({ field: prefix ? `${prefix}.${field}` : field, message: `${field} must be a non-negative integer number of seconds.` });
  }
}

function validateDelayStatus(body: Record<string, unknown>, errors: ValidationErrorDetail[], prefix?: string): void {
  const value = body.delayStatus;
  if (value === undefined) {
    return;
  }

  if (value !== 'onTime' && value !== 'delayed' && value !== 'unknown') {
    errors.push({
      field: prefix ? `${prefix}.delayStatus` : 'delayStatus',
      message: 'delayStatus must be onTime, delayed, or unknown when provided.'
    });
  }
}

function validateCoordinates(value: unknown, field: string, errors: ValidationErrorDetail[]): void {
  if (!isRecord(value)) {
    errors.push({ field, message: `${field} must include latitude and longitude.` });
    return;
  }

  const latitude = value.latitude;
  const longitude = value.longitude;
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
    errors.push({ field: `${field}.latitude`, message: 'Latitude must be a number from -90 to 90.' });
  }
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    errors.push({ field: `${field}.longitude`, message: 'Longitude must be a number from -180 to 180.' });
  }
}

function validateCanonicalPoint(value: unknown, field: string, errors: ValidationErrorDetail[]): void {
  if (!isRecord(value)) {
    errors.push({ field, message: `${field} must include lat and lon.` });
    return;
  }

  const lat = value.lat;
  const lon = value.lon;
  if (typeof lat !== 'number' || lat < -90 || lat > 90) {
    errors.push({ field: `${field}.lat`, message: 'lat must be a number from -90 to 90.' });
  }
  if (typeof lon !== 'number' || lon < -180 || lon > 180) {
    errors.push({ field: `${field}.lon`, message: 'lon must be a number from -180 to 180.' });
  }
}

function validateCanonicalStation(value: unknown, field: string, errors: ValidationErrorDetail[]): void {
  validateCanonicalPoint(value, field, errors);
  if (!isRecord(value)) {
    return;
  }
  requireString(value, 'id', errors, field);
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.trim().length === 0)) {
    errors.push({ field: `${field}.name`, message: `${field}.name must be a non-empty string when provided.` });
  }
}

function validateInputBuffers(value: unknown, errors: ValidationErrorDetail[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push({ field: 'buffers', message: 'Buffers must be an object when provided.' });
    return;
  }

  for (const key of Object.keys(DEFAULT_BUFFER_MINUTES)) {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0)) {
      errors.push({ field: `buffers.${key}`, message: `${key} must be a non-negative number of minutes.` });
    }
  }
}

function addSeconds(isoDateTime: string, seconds: number): string {
  return new Date(Date.parse(isoDateTime) + seconds * 1000).toISOString();
}

function subtractSeconds(isoDateTime: string, seconds: number): string {
  return addSeconds(isoDateTime, -seconds);
}
