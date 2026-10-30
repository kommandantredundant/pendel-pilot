import type { TransitClient, TransportSearchInput, TransportSearchResult } from '../clients/transit.client.ts';
import { StubTransitClient } from '../clients/transit.client.ts';
import type { OsrmClient } from '../clients/osrm.client.ts';
import { StubOsrmClient } from '../clients/osrm.client.ts';
import {
  apiDirectionToCanonical,
  calculateCanonicalJourney,
  normalizeBuffers,
  validateCalculateJourneyRequest,
  type CalculateJourneyRequest,
  type CanonicalJourney,
  type CanonicalJourneySeed,
  type CanonicalPoint,
  type CanonicalStation,
  type TransportTiming,
  type ValidationErrorDetail
} from '../models/canonical.ts';

export interface JourneyOption {
  journey: CanonicalJourney;
  lineName?: string;
  transfers?: number;
}

export interface JourneyCalculationResult {
  direction: CalculateJourneyRequest['direction'];
  transport: null;
  routes: {
    home: { walk: null; bike: null };
    work: { walk: null; bike: null };
  };
  summary: null;
  calculatedJourneys: {
    journeyWork: CanonicalJourney | null;
    journeyHome: CanonicalJourney | null;
  };
  /** All connection options in departure order; calculatedJourneys holds the first one. */
  options: JourneyOption[];
}

export interface JourneyTelemetryEvent {
  event: string;
  metadata?: Record<string, number | string | boolean>;
}

export type JourneyTelemetrySink = (event: JourneyTelemetryEvent) => void;
export const ITINERARY_CACHE_PERSISTENCE_EVENTS = new Set([
  'itinerary.cache_hit',
  'itinerary.cache_miss',
  'itinerary.cache_stale',
  'itinerary.persistence_read_success',
  'itinerary.persistence_read_error',
  'itinerary.persistence_write_success',
  'itinerary.persistence_write_error'
]);

export class JourneyValidationError extends Error {
  constructor(readonly details: ValidationErrorDetail[]) {
    super('Journey calculation request failed validation.');
  }
}

export class JourneyTransportUnavailableError extends Error {
  readonly code = 'TRANSPORT_DATA_UNAVAILABLE';

  constructor(message = 'Transport data unavailable for segment y station anchors.') {
    super(message);
  }
}

export class JourneyCalculationService {
  constructor(
    private readonly transitClient: TransitClient = new StubTransitClient(),
    private readonly osrmClient: OsrmClient = new StubOsrmClient(),
    private readonly telemetry?: JourneyTelemetrySink
  ) {}

  async calculate(input: unknown): Promise<JourneyCalculationResult> {
    const validation = validateCalculateJourneyRequest(input);
    if (!validation.success || !validation.data) {
      throw new JourneyValidationError(validation.errors ?? []);
    }

    return this.createCalculatedResult(validation.data);
  }

  private async createCalculatedResult(request: CalculateJourneyRequest): Promise<JourneyCalculationResult> {
    const canonicalDirection = apiDirectionToCanonical(request.direction);
    const homeAddress = coordinatesToCanonicalPoint(request.homeAddress);
    const workAddress = coordinatesToCanonicalPoint(request.workAddress);
    const transportConnections = await this.resolveRequiredTransportConnections(request);
    const buffers = normalizeBuffers(request.buffers);
    const routeDurations = new Map<string, Promise<number>>();
    const routeDuration = (from: CanonicalPoint, to: CanonicalPoint, profile: 'foot' | 'bike'): Promise<number> => {
      // Options usually share stations, so each first/last-mile route is requested once per calculation.
      const key = `${from.lat},${from.lon};${to.lat},${to.lon};${profile}`;
      let duration = routeDurations.get(key);
      if (!duration) {
        duration = this.resolveRouteDuration(from, to, profile);
        routeDurations.set(key, duration);
      }
      return duration;
    };

    const options: JourneyOption[] = [];
    for (const transportConnection of transportConnections) {
      this.emitDelayPropagationSignal(transportConnection);
      const transportTiming = normalizeTransportTiming(transportConnection);
      const homeStation = canonicalDirection === 'journeyWork' ? transportConnection.departureStation : transportConnection.arrivalStation;
      const workStation = canonicalDirection === 'journeyWork' ? transportConnection.arrivalStation : transportConnection.departureStation;

      const seed: CanonicalJourneySeed = {
        direction: canonicalDirection,
        homeAddress,
        homeStation,
        workStation,
        workAddress,
        ...(canonicalDirection === 'journeyWork'
          ? {
              transportWork: transportTiming,
              homeStationTime: transportTiming.departureTime,
              workStationTime: transportTiming.arrivalTime
            }
          : {
              transportHome: transportTiming,
              workStationTime: transportTiming.departureTime,
              homeStationTime: transportTiming.arrivalTime
            }),
        routeHomeWalkSec: await routeDuration(homeAddress, homeStation, 'foot'),
        routeHomeBikeSec: await routeDuration(homeAddress, homeStation, 'bike'),
        routeWorkWalkSec: await routeDuration(workStation, workAddress, 'foot'),
        routeWorkBikeSec: await routeDuration(workStation, workAddress, 'bike'),
        ...buffers
      };

      options.push({
        journey: calculateCanonicalJourney(seed),
        ...(transportConnection.lineName ? { lineName: transportConnection.lineName } : {}),
        ...(transportConnection.transfers !== undefined ? { transfers: transportConnection.transfers } : {})
      });
    }

    const selectedJourney = options[0].journey;

    return {
      direction: request.direction,
      transport: null,
      routes: {
        home: { walk: null, bike: null },
        work: { walk: null, bike: null }
      },
      summary: null,
      calculatedJourneys: {
        journeyWork: canonicalDirection === 'journeyWork' ? selectedJourney : null,
        journeyHome: canonicalDirection === 'journeyHome' ? selectedJourney : null
      },
      options
    };
  }

  private emitDelayPropagationSignal(transportTiming: TransportTiming): void {
    const hasDelay = transportTiming.departureDelaySec !== undefined || transportTiming.arrivalDelaySec !== undefined;
    if (!hasDelay) {
      return;
    }

    const departureAnomalous = isDelayAnomalous(
      transportTiming.plannedDepartureTime,
      transportTiming.departureTime,
      transportTiming.departureDelaySec
    );
    const arrivalAnomalous = isDelayAnomalous(transportTiming.plannedArrivalTime, transportTiming.arrivalTime, transportTiming.arrivalDelaySec);

    if (departureAnomalous || arrivalAnomalous) {
      this.telemetry?.({
        event: 'journey.delay_propagation_anomaly.signal',
        metadata: { departureAnomalous, arrivalAnomalous }
      });
    }
  }

  private async resolveRequiredTransportConnections(request: CalculateJourneyRequest): Promise<RequiredTransportSearchResult[]> {
    const canonicalDirection = apiDirectionToCanonical(request.direction);
    const input: TransportSearchInput = {
      direction: canonicalDirection,
      fromStationId: request.direction === 'work' ? request.homeStationId : request.workStationId,
      toStationId: request.direction === 'work' ? request.workStationId : request.homeStationId,
      departureTime: request.departureTime,
      arrivalTime: request.arrivalTime,
      ...(request.excludeLongDistance ? { excludeLongDistance: true } : {})
    };
    const results = request.results ?? 1;
    const transportConnections: TransportSearchResult[] = this.transitClient.calculateTransportOptions
      ? await this.transitClient.calculateTransportOptions(input, results)
      : [await this.transitClient.calculateTransport(input)].filter((connection): connection is TransportSearchResult => connection !== null);
    const complete = transportConnections.filter(
      (connection): connection is RequiredTransportSearchResult => !!connection.departureStation && !!connection.arrivalStation
    );

    if (complete.length === 0) {
      this.telemetry?.({ event: 'service.fallback_used', metadata: { domain: 'db', direction: canonicalDirection, outcome: 'error' } });
      throw new JourneyTransportUnavailableError();
    }

    return complete;
  }

  private async resolveRouteDuration(from: CanonicalPoint, to: CanonicalPoint, profile: 'foot' | 'bike'): Promise<number> {
    try {
      const route = await this.osrmClient.getRouteDuration(from, to, profile);
      if (route) {
        this.telemetry?.({ event: 'service.fallback_used', metadata: { domain: 'osrm', direction: profile, outcome: 'primary' } });
        return Math.max(0, Math.round(route.durationSec));
      }
    } catch {
      // OSRM is explicitly fail-open: fall through to a conservative bounded estimate.
    }
    this.telemetry?.({ event: 'service.fallback_used', metadata: { domain: 'osrm', direction: profile, outcome: 'fallback' } });
    return estimateRouteDurationSec(from, to, profile);
  }
}

type RequiredTransportSearchResult = TransportSearchResult & {
  departureStation: CanonicalStation;
  arrivalStation: CanonicalStation;
  lineName?: string;
  transfers?: number;
};

export function estimateRouteDurationSec(from: CanonicalPoint, to: CanonicalPoint, profile: 'foot' | 'bike'): number {
  const distanceMeters = haversineMeters(from, to);
  const speedMetersPerSecond = profile === 'foot' ? 1.1 : 3.3;
  const rawEstimate = Math.ceil((distanceMeters * 1.35) / speedMetersPerSecond);
  const maxEstimate = profile === 'foot' ? 3 * 60 * 60 : 90 * 60;
  return Math.max(60, Math.min(maxEstimate, rawEstimate));
}

function coordinatesToCanonicalPoint(coordinates: CalculateJourneyRequest['homeAddress']): CanonicalPoint {
  return { lat: coordinates.latitude, lon: coordinates.longitude };
}

function normalizeTransportTiming(timing: TransportTiming): TransportTiming {
  const departureDelaySec = timing.departureDelaySec !== undefined ? Math.max(0, Math.round(timing.departureDelaySec)) : undefined;
  const arrivalDelaySec = timing.arrivalDelaySec !== undefined ? Math.max(0, Math.round(timing.arrivalDelaySec)) : undefined;
  const plannedDepartureTime = timing.plannedDepartureTime ? normalizeIsoDateTime(timing.plannedDepartureTime) : undefined;
  const plannedArrivalTime = timing.plannedArrivalTime ? normalizeIsoDateTime(timing.plannedArrivalTime) : undefined;

  const normalized = {
    ...timing,
    departureTime: plannedDepartureTime && departureDelaySec !== undefined ? addSeconds(plannedDepartureTime, departureDelaySec) : normalizeIsoDateTime(timing.departureTime),
    arrivalTime: plannedArrivalTime && arrivalDelaySec !== undefined ? addSeconds(plannedArrivalTime, arrivalDelaySec) : normalizeIsoDateTime(timing.arrivalTime),
    ...(plannedDepartureTime ? { plannedDepartureTime } : {}),
    ...(plannedArrivalTime ? { plannedArrivalTime } : {}),
    ...(departureDelaySec !== undefined ? { departureDelaySec } : {}),
    ...(arrivalDelaySec !== undefined ? { arrivalDelaySec } : {})
  };

  return normalized;
}

function normalizeIsoDateTime(dateTime: string): string {
  return new Date(Date.parse(dateTime)).toISOString();
}

function addSeconds(dateTime: string, seconds: number): string {
  return new Date(Date.parse(dateTime) + seconds * 1_000).toISOString();
}

function isDelayAnomalous(planned: string | undefined, actual: string, delaySec: number | undefined): boolean {
  if (!planned || delaySec === undefined) {
    return false;
  }
  const observedDelay = Math.round((Date.parse(actual) - Date.parse(planned)) / 1_000);
  return Math.abs(observedDelay - delaySec) > 60;
}

function haversineMeters(from: CanonicalPoint, to: CanonicalPoint): number {
  const earthRadiusMeters = 6_371_000;
  const fromLat = radians(from.lat);
  const toLat = radians(to.lat);
  const deltaLat = radians(to.lat - from.lat);
  const deltaLon = radians(to.lon - from.lon);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
