import type {
  TransitClient,
  StationSearchResult,
  TransportConnection,
  TransportSearchInput,
  TransportSearchResult
} from './transit.client.ts';
import type { TransportDelayStatus } from '../models/canonical.ts';
import { requestProviderJson } from './providerCompliance.ts';

const TRANSITOUS_BASE_URL = 'https://api.transitous.org';

// MOTIS transit modes without long-distance rail (ICE/IC/EC, night trains) and long-distance coaches.
const REGIONAL_TRANSIT_MODES = ['REGIONAL_FAST_RAIL', 'REGIONAL_RAIL', 'SUBURBAN', 'SUBWAY', 'TRAM', 'BUS', 'FERRY'];

/**
 * Public-transport timing and stop search via Transitous (MOTIS 2 API, open GTFS/GTFS-RT data).
 * Implements the same contract as the DB Transport client; stop IDs are Transitous IDs such as
 * `de-DELFI_de:03241:31`.
 */
export class HttpTransitousClient implements TransitClient {
  constructor(private readonly options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {}

  async searchStations(query: string, limit: number): Promise<StationSearchResult[]> {
    const payload = await requestProviderJson<unknown>({
      provider: 'transitous',
      url: buildTransitousStopSearchUrl(query, this.options.baseUrl),
      fetchImpl: this.options.fetchImpl
    });

    const matches = Array.isArray(payload) ? payload.filter(isRecord) : [];
    return matches
      .filter((match) => match.type === 'STOP')
      .map(mapGeocodeStop)
      .filter((station): station is StationSearchResult => station !== null)
      .slice(0, limit);
  }

  async calculateTransport(input: TransportSearchInput): Promise<TransportSearchResult | null> {
    return (await this.calculateTransportOptions(input, 1))[0] ?? null;
  }

  async calculateTransportOptions(input: TransportSearchInput, results: number): Promise<TransportConnection[]> {
    const payload = await requestProviderJson<unknown>({
      provider: 'transitous',
      url: buildTransitousPlanUrl(input, this.options.baseUrl, results),
      fetchImpl: this.options.fetchImpl
    });

    if (!isRecord(payload) || !Array.isArray(payload.itineraries)) {
      return [];
    }
    return payload.itineraries
      .filter(isRecord)
      .map(mapItinerary)
      .filter((connection): connection is TransportConnection => connection !== null)
      .slice(0, results);
  }
}

export function buildTransitousStopSearchUrl(query: string, baseUrl = TRANSITOUS_BASE_URL): URL {
  const url = new URL('/api/v1/geocode', baseUrl);
  url.searchParams.set('text', query);
  url.searchParams.set('type', 'STOP');
  return url;
}

export function buildTransitousPlanUrl(input: TransportSearchInput, baseUrl = TRANSITOUS_BASE_URL, results = 1): URL {
  const url = new URL('/api/v5/plan', baseUrl);
  url.searchParams.set('fromPlace', input.fromStationId);
  url.searchParams.set('toPlace', input.toStationId);
  url.searchParams.set('numItineraries', String(results));
  // Like HAFAS, MOTIS takes one time anchor: departure wins when both are sent.
  if (input.departureTime) {
    url.searchParams.set('time', input.departureTime);
  } else if (input.arrivalTime) {
    url.searchParams.set('time', input.arrivalTime);
    url.searchParams.set('arriveBy', 'true');
  }
  if (input.excludeLongDistance) {
    url.searchParams.set('transitModes', REGIONAL_TRANSIT_MODES.join(','));
  }
  return url;
}

function mapGeocodeStop(match: Record<string, unknown>): StationSearchResult | null {
  const { id, name, lat, lon } = match;
  if (typeof id !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
    return null;
  }
  return { id, ...(typeof name === 'string' ? { name } : {}), lat, lon };
}

function mapItinerary(itinerary: Record<string, unknown>): TransportConnection | null {
  if (!Array.isArray(itinerary.legs)) {
    return null;
  }

  const transitLegs = itinerary.legs.filter(isRecord).filter((leg) => leg.mode !== 'WALK' && isRecord(leg.from) && isRecord(leg.to));
  const firstLeg = transitLegs[0];
  const lastLeg = transitLegs[transitLegs.length - 1];
  if (!firstLeg || !lastLeg || typeof firstLeg.startTime !== 'string' || typeof lastLeg.endTime !== 'string') {
    return null;
  }

  const from = firstLeg.from as Record<string, unknown>;
  const to = lastLeg.to as Record<string, unknown>;
  const departureStation = mapPlace(from);
  const arrivalStation = mapPlace(to);
  if (!departureStation || !arrivalStation) {
    return null;
  }

  const plannedDepartureTime = stringOrUndefined(firstLeg.scheduledStartTime);
  const plannedArrivalTime = stringOrUndefined(lastLeg.scheduledEndTime);
  const departureDelaySec = firstLeg.realTime === true ? delaySeconds(plannedDepartureTime, firstLeg.startTime) : undefined;
  const arrivalDelaySec = lastLeg.realTime === true ? delaySeconds(plannedArrivalTime, lastLeg.endTime) : undefined;
  const lineName = stringOrUndefined(firstLeg.displayName) ?? stringOrUndefined(firstLeg.routeShortName);

  return {
    departureStation,
    arrivalStation,
    departureTime: firstLeg.startTime,
    arrivalTime: lastLeg.endTime,
    ...(plannedDepartureTime ? { plannedDepartureTime } : {}),
    ...(plannedArrivalTime ? { plannedArrivalTime } : {}),
    ...(departureDelaySec !== undefined ? { departureDelaySec } : {}),
    ...(arrivalDelaySec !== undefined ? { arrivalDelaySec } : {}),
    delayStatus: delayStatus(departureDelaySec, arrivalDelaySec),
    ...(lineName ? { lineName } : {}),
    transfers: typeof itinerary.transfers === 'number' ? itinerary.transfers : Math.max(0, transitLegs.length - 1)
  };
}

function mapPlace(place: Record<string, unknown>): StationSearchResult | null {
  const id = place.stopId;
  const { name, lat, lon } = place;
  if (typeof id !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
    return null;
  }
  return { id, ...(typeof name === 'string' ? { name } : {}), lat, lon };
}

function delaySeconds(planned: string | undefined, actual: string): number | undefined {
  if (!planned) {
    return undefined;
  }
  const delay = Math.round((Date.parse(actual) - Date.parse(planned)) / 1_000);
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

function delayStatus(departureDelaySec: number | undefined, arrivalDelaySec: number | undefined): TransportDelayStatus {
  if (departureDelaySec === undefined && arrivalDelaySec === undefined) {
    return 'unknown';
  }
  return (departureDelaySec ?? 0) > 0 || (arrivalDelaySec ?? 0) > 0 ? 'delayed' : 'onTime';
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
