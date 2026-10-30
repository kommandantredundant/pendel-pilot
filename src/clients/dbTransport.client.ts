import type { CanonicalDirection, CanonicalStation, TransportDelayStatus, TransportTiming } from '../models/canonical.ts';
import { requestProviderJson } from './providerCompliance.ts';

export interface StationSearchResult extends CanonicalStation {
  products?: Record<string, boolean>;
}

export interface TransportConnection extends TransportTiming {
  departureStation: CanonicalStation;
  arrivalStation: CanonicalStation;
  /** Name of the first public-transport line, e.g. "RE 1" or "S 5". */
  lineName?: string;
  transfers?: number;
}

export type TransportSearchResult = TransportTiming & Partial<Pick<TransportConnection, 'departureStation' | 'arrivalStation'>>;

export interface TransportSearchInput {
  fromStationId: string;
  toStationId: string;
  direction: CanonicalDirection;
  departureTime?: string;
  arrivalTime?: string;
  excludeLongDistance?: boolean;
}

export interface DbTransportClient {
  searchStations(query: string, limit: number): Promise<StationSearchResult[]>;
  calculateTransport(input: TransportSearchInput): Promise<TransportSearchResult | null>;
  /** Optional multi-connection search; clients without it fall back to calculateTransport. */
  calculateTransportOptions?(input: TransportSearchInput, results: number): Promise<TransportConnection[]>;
}

export class StubDbTransportClient implements DbTransportClient {
  async searchStations(_query: string, _limit: number): Promise<StationSearchResult[]> {
    return [];
  }

  async calculateTransport(_input: TransportSearchInput): Promise<TransportSearchResult | null> {
    return null;
  }
}

export class HttpDbTransportClient implements DbTransportClient {
  constructor(
    private readonly options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}
  ) {}

  async searchStations(query: string, limit: number): Promise<StationSearchResult[]> {
    const payload = await requestProviderJson<unknown>({
      provider: 'dbTransport',
      url: buildStationSearchUrl(query, limit, this.options.baseUrl),
      fetchImpl: this.options.fetchImpl
    });

    const stations = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.stations) ? payload.stations : [];
    return stations.map(mapStation).filter((station): station is StationSearchResult => station !== null).slice(0, limit);
  }

  async calculateTransport(input: TransportSearchInput): Promise<TransportSearchResult | null> {
    return (await this.calculateTransportOptions(input, 1))[0] ?? null;
  }

  async calculateTransportOptions(input: TransportSearchInput, results: number): Promise<TransportConnection[]> {
    const payload = await requestProviderJson<unknown>({
      provider: 'dbTransport',
      url: buildJourneyUrl(input, this.options.baseUrl, results),
      fetchImpl: this.options.fetchImpl
    });

    return mapJourneysPayload(payload).slice(0, results);
  }
}

export function buildStationSearchUrl(query: string, limit: number, baseUrl = 'https://v6.db.transport.rest'): URL {
  const url = new URL('/stations', baseUrl);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  return url;
}

export function buildJourneyUrl(input: TransportSearchInput, baseUrl = 'https://v6.db.transport.rest', results = 1): URL {
  const url = new URL('/journeys', baseUrl);
  url.searchParams.set('from', input.fromStationId);
  url.searchParams.set('to', input.toStationId);
  url.searchParams.set('results', String(results));
  // HAFAS accepts either a departure or an arrival anchor, not both.
  if (input.departureTime) {
    url.searchParams.set('departure', input.departureTime);
  } else if (input.arrivalTime) {
    url.searchParams.set('arrival', input.arrivalTime);
  }
  if (input.excludeLongDistance) {
    url.searchParams.set('nationalExpress', 'false');
    url.searchParams.set('national', 'false');
  }
  return url;
}

function mapJourneysPayload(payload: unknown): TransportConnection[] {
  if (!isRecord(payload) || !Array.isArray(payload.journeys)) {
    return [];
  }

  return payload.journeys.filter(isRecord).map(mapJourney).filter((journey): journey is TransportConnection => journey !== null);
}

function mapJourney(journey: Record<string, unknown>): TransportConnection | null {
  if (!Array.isArray(journey.legs)) {
    return null;
  }

  const legs = journey.legs.filter(isRecord);
  const timedLegs = legs.filter((leg) => typeof leg.departure === 'string' && typeof leg.arrival === 'string');
  const firstLeg = timedLegs[0];
  const lastLeg = timedLegs[timedLegs.length - 1];
  if (!firstLeg || !lastLeg) {
    return null;
  }

  const departureStation = mapStation(firstLeg.origin) ?? mapStation(firstLeg.departureStation);
  const arrivalStation = mapStation(lastLeg.destination) ?? mapStation(lastLeg.arrivalStation);
  if (!departureStation || !arrivalStation) {
    return null;
  }

  const departureDelaySec = secondsFromDelay(firstLeg.departureDelay);
  const arrivalDelaySec = secondsFromDelay(lastLeg.arrivalDelay);
  const lineNames = timedLegs
    .map((leg) => (isRecord(leg.line) && typeof leg.line.name === 'string' ? leg.line.name : undefined))
    .filter((name): name is string => name !== undefined);

  return {
    departureStation,
    arrivalStation,
    ...(lineNames[0] ? { lineName: lineNames[0] } : {}),
    transfers: Math.max(0, lineNames.length - 1),
    departureTime: String(firstLeg.departure),
    arrivalTime: String(lastLeg.arrival),
    ...(typeof firstLeg.plannedDeparture === 'string' ? { plannedDepartureTime: firstLeg.plannedDeparture } : {}),
    ...(typeof lastLeg.plannedArrival === 'string' ? { plannedArrivalTime: lastLeg.plannedArrival } : {}),
    ...(departureDelaySec !== undefined ? { departureDelaySec } : {}),
    ...(arrivalDelaySec !== undefined ? { arrivalDelaySec } : {}),
    delayStatus: delayStatus(departureDelaySec, arrivalDelaySec)
  };
}

function mapStation(value: unknown): StationSearchResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const location = isRecord(value.location) ? value.location : value;
  const id = value.id;
  const name = value.name;
  const lat = location.latitude;
  const lon = location.longitude;
  if (typeof id !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
    return null;
  }

  return {
    id,
    ...(typeof name === 'string' ? { name } : {}),
    lat,
    lon,
    ...(isRecord(value.products) ? { products: booleanRecord(value.products) } : {})
  };
}

function booleanRecord(record: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
}

function secondsFromDelay(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.round(value));
}

function delayStatus(departureDelaySec: number | undefined, arrivalDelaySec: number | undefined): TransportDelayStatus {
  if (departureDelaySec === undefined && arrivalDelaySec === undefined) {
    return 'unknown';
  }
  return (departureDelaySec ?? 0) > 0 || (arrivalDelaySec ?? 0) > 0 ? 'delayed' : 'onTime';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
