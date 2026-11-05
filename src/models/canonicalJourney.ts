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

/**
 * Buffers belong to one side of the commute: home (home address <-> home station) or work (work station <-> work address).
 * The two sides are different places, so no buffer is shared between them (see docs/decisions.md). Every buffer of a
 * side applies in both directions, when leaving towards the station and when arriving from it:
 * - leave: flat <-> front door (stairs, lift); walking and cycling.
 * - bike: getting the bike out or putting it away; cycling only.
 * - bikeParking: bike parking at the station <-> platform; cycling only.
 * Like every duration in the model, buffers are whole seconds (see docs/decisions.md).
 */
export interface CanonicalBuffers {
  bufferLeaveHomeSec: number;
  bufferLeaveWorkSec: number;
  bufferBikeHomeSec: number;
  bufferBikeWorkSec: number;
  bufferBikeParkingHomeSec: number;
  bufferBikeParkingWorkSec: number;
}

/** Buffers in a calculation request use the canonical names; a missing buffer is 0. */
export type InputBuffers = Partial<CanonicalBuffers>;

/** Upper bound of a buffer (1 h). */
export const MAX_BUFFER_SEC = 60 * 60;

/**
 * Durations the user knows better than routing: the whole way between address and platform for one side and one
 * mode, in seconds. A fixed duration replaces the routed duration and every buffer of that side and mode.
 */
export interface FixedDurations {
  homeWalkSec?: number;
  homeBikeSec?: number;
  workWalkSec?: number;
  workBikeSec?: number;
}

/** Upper bound of a fixed duration (3 h, like the longest routed walk). */
export const MAX_FIXED_DURATION_SEC = 3 * 60 * 60;

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
  /** Omitted only when both modes of that side have a fixed duration. */
  homeAddress?: CanonicalPoint;
  homeStation: CanonicalStation;
  workStation: CanonicalStation;
  workAddress?: CanonicalPoint;
  transportWork?: TransportTiming;
  transportHome?: TransportTiming;
  homeStationTime: string;
  workStationTime: string;
  routeHomeWalkSec: number;
  routeHomeBikeSec: number;
  routeWorkWalkSec: number;
  routeWorkBikeSec: number;
  /**
   * Set for each side and mode the user fixed. The matching route*Sec field then holds the same value and
   * no buffer of that side and mode is added.
   */
  fixedHomeWalkSec?: number;
  fixedHomeBikeSec?: number;
  fixedWorkWalkSec?: number;
  fixedWorkBikeSec?: number;
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
  /** Optional only when `fixedDurations` covers both modes of that side. */
  homeAddress?: Coordinates;
  workAddress?: Coordinates;
  /**
   * Coordinates of the stations the user picked. When set, first/last-mile routes start at this
   * fixed point instead of the platform the transit provider reports for each connection.
   */
  homeStationLocation?: Coordinates;
  workStationLocation?: Coordinates;
  direction: ApiDirection;
  /** At least one of departureTime/arrivalTime is required; departureTime wins when both are sent. */
  departureTime?: string;
  arrivalTime?: string;
  buffers?: InputBuffers;
  fixedDurations?: FixedDurations;
  /** Number of connection options to return (1–12, default 1). */
  results?: number;
  /** Skip long-distance trains (ICE/IC/EC) when searching connections. */
  excludeLongDistance?: boolean;
}

export const MAX_JOURNEY_RESULTS = 12;

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

export const CANONICAL_BUFFER_SEC_FIELDS = [
  'bufferLeaveHomeSec',
  'bufferLeaveWorkSec',
  'bufferBikeHomeSec',
  'bufferBikeWorkSec',
  'bufferBikeParkingHomeSec',
  'bufferBikeParkingWorkSec'
] as const;

export const CANONICAL_FIXED_DURATION_FIELDS = ['fixedHomeWalkSec', 'fixedHomeBikeSec', 'fixedWorkWalkSec', 'fixedWorkBikeSec'] as const;

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

const DEFAULT_BUFFERS: CanonicalBuffers = {
  bufferLeaveHomeSec: 0,
  bufferLeaveWorkSec: 0,
  bufferBikeHomeSec: 0,
  bufferBikeWorkSec: 0,
  bufferBikeParkingHomeSec: 0,
  bufferBikeParkingWorkSec: 0
};

const FIXED_DURATION_KEYS = ['homeWalkSec', 'homeBikeSec', 'workWalkSec', 'workBikeSec'] as const satisfies readonly (keyof FixedDurations)[];

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
  'BufferLeaveHome',
  'BufferLeaveWork',
  'BufferBikeHome',
  'BufferBikeWork',
  'BufferBikeParkingHome',
  'BufferBikeParkingWork',
  // Replaced in November 2026 by per-side buffers in whole seconds; rejected so stale payloads cannot pass as canonical.
  'bufferLeaveHomeMin',
  'bufferLeaveWorkMin',
  'bufferBikeHomeMin',
  'bufferBikeWorkMin',
  'bufferBikeParkingHomeMin',
  'bufferBikeParkingWorkMin',
  'bufferInsideHomeStationMin',
  'bufferInsideHomeStationSec',
  'bufferInsideWorkStationMin',
  'bufferInsideWorkStationSec',
  'bufferPrepareWalkMin',
  'bufferPrepareWalkSec',
  'bufferPrepareBikeMin',
  'bufferPrepareBikeSec',
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
  return { ...DEFAULT_BUFFERS, ...buffers };
}

/** Seconds between the home address and the home station for one mode: the fixed duration, or route plus buffers. */
export function homeSideWalkSec(seed: CanonicalJourneySeed): number {
  return seed.fixedHomeWalkSec ?? seed.routeHomeWalkSec + seed.bufferLeaveHomeSec;
}

export function homeSideBikeSec(seed: CanonicalJourneySeed): number {
  return seed.fixedHomeBikeSec ?? seed.routeHomeBikeSec + seed.bufferLeaveHomeSec + seed.bufferBikeHomeSec + seed.bufferBikeParkingHomeSec;
}

/** Seconds between the work station and the work address for one mode: the fixed duration, or route plus buffers. */
export function workSideWalkSec(seed: CanonicalJourneySeed): number {
  return seed.fixedWorkWalkSec ?? seed.routeWorkWalkSec + seed.bufferLeaveWorkSec;
}

export function workSideBikeSec(seed: CanonicalJourneySeed): number {
  return seed.fixedWorkBikeSec ?? seed.routeWorkBikeSec + seed.bufferLeaveWorkSec + seed.bufferBikeWorkSec + seed.bufferBikeParkingWorkSec;
}

export function calculateJourneyWork(seed: CanonicalJourneySeed): CanonicalJourney {
  return {
    ...seed,
    direction: 'journeyWork',
    homeAddressWalkTime: subtractSeconds(seed.homeStationTime, homeSideWalkSec(seed)),
    homeAddressBikeTime: subtractSeconds(seed.homeStationTime, homeSideBikeSec(seed)),
    workAddressWalkTime: addSeconds(seed.workStationTime, workSideWalkSec(seed)),
    workAddressBikeTime: addSeconds(seed.workStationTime, workSideBikeSec(seed))
  };
}

export function calculateJourneyHome(seed: CanonicalJourneySeed): CanonicalJourney {
  return {
    ...seed,
    direction: 'journeyHome',
    homeAddressWalkTime: addSeconds(seed.homeStationTime, homeSideWalkSec(seed)),
    homeAddressBikeTime: addSeconds(seed.homeStationTime, homeSideBikeSec(seed)),
    workAddressWalkTime: subtractSeconds(seed.workStationTime, workSideWalkSec(seed)),
    workAddressBikeTime: subtractSeconds(seed.workStationTime, workSideBikeSec(seed))
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
  validateFixedDurations(body.fixedDurations, errors);
  const fixed = isRecord(body.fixedDurations) ? body.fixedDurations : {};
  if (body.homeAddress !== undefined || fixed.homeWalkSec === undefined || fixed.homeBikeSec === undefined) {
    validateCoordinates(body.homeAddress, 'homeAddress', errors);
  }
  if (body.workAddress !== undefined || fixed.workWalkSec === undefined || fixed.workBikeSec === undefined) {
    validateCoordinates(body.workAddress, 'workAddress', errors);
  }
  if (body.homeStationLocation !== undefined) {
    validateCoordinates(body.homeStationLocation, 'homeStationLocation', errors);
  }
  if (body.workStationLocation !== undefined) {
    validateCoordinates(body.workStationLocation, 'workStationLocation', errors);
  }

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

/** Field names a complete canonical journey must carry; listed in the API's error response when one is missing. */
export function explainRequiredCanonicalJourneyFields(): string[] {
  return [
    'direction',
    'homeAddress',
    'homeStation',
    'workStation',
    'workAddress',
    'transportWork|transportHome',
    ...CANONICAL_STATION_ANCHOR_FIELDS,
    ...CANONICAL_ROUTE_DURATION_FIELDS,
    ...CANONICAL_BUFFER_SEC_FIELDS,
    ...CANONICAL_ADDRESS_TIME_FIELDS
  ];
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

  if (input.homeAddress !== undefined || input.fixedHomeWalkSec === undefined || input.fixedHomeBikeSec === undefined) {
    validateCanonicalPoint(input.homeAddress, 'homeAddress', errors);
  }
  validateCanonicalStation(input.homeStation, 'homeStation', errors);
  validateCanonicalStation(input.workStation, 'workStation', errors);
  if (input.workAddress !== undefined || input.fixedWorkWalkSec === undefined || input.fixedWorkBikeSec === undefined) {
    validateCanonicalPoint(input.workAddress, 'workAddress', errors);
  }

  requireIsoDateTime(input, 'homeStationTime', errors);
  requireIsoDateTime(input, 'workStationTime', errors);

  for (const field of CANONICAL_ROUTE_DURATION_FIELDS) {
    requireNonNegativeInteger(input, field, errors);
  }

  for (const field of CANONICAL_BUFFER_SEC_FIELDS) {
    requireNonNegativeInteger(input, field, errors);
  }

  for (const field of CANONICAL_FIXED_DURATION_FIELDS) {
    requireOptionalNonNegativeInteger(input, field, errors);
  }

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

  for (const key of CANONICAL_BUFFER_SEC_FIELDS) {
    const candidate = value[key];
    if (candidate !== undefined && (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < 0 || candidate > MAX_BUFFER_SEC)) {
      errors.push({ field: `buffers.${key}`, message: `${key} must be an integer number of seconds from 0 to ${MAX_BUFFER_SEC}.` });
    }
  }
  for (const key of Object.keys(value)) {
    if (!(CANONICAL_BUFFER_SEC_FIELDS as readonly string[]).includes(key)) {
      errors.push({ field: `buffers.${key}`, message: `${key} is not a buffer; buffers are ${CANONICAL_BUFFER_SEC_FIELDS.join(', ')}.` });
    }
  }
}

function validateFixedDurations(value: unknown, errors: ValidationErrorDetail[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push({ field: 'fixedDurations', message: 'fixedDurations must be an object when provided.' });
    return;
  }

  for (const key of FIXED_DURATION_KEYS) {
    const candidate = value[key];
    if (
      candidate !== undefined &&
      (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < 0 || candidate > MAX_FIXED_DURATION_SEC)
    ) {
      errors.push({ field: `fixedDurations.${key}`, message: `${key} must be an integer number of seconds from 0 to ${MAX_FIXED_DURATION_SEC}.` });
    }
  }
}

function addSeconds(isoDateTime: string, seconds: number): string {
  return new Date(Date.parse(isoDateTime) + seconds * 1000).toISOString();
}

function subtractSeconds(isoDateTime: string, seconds: number): string {
  return addSeconds(isoDateTime, -seconds);
}
