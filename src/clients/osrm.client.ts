import type { CanonicalPoint } from '../models/canonical.ts';
import { requestProviderJson } from './providerCompliance.ts';

export type OsrmProfile = 'foot' | 'bike';

export interface RouteDurationResult {
  durationSec: number;
  distanceMeters?: number;
}

export interface OsrmClient {
  getRouteDuration(from: CanonicalPoint, to: CanonicalPoint, profile: OsrmProfile): Promise<RouteDurationResult | null>;
}

export class StubOsrmClient implements OsrmClient {
  async getRouteDuration(_from: CanonicalPoint, _to: CanonicalPoint, _profile: OsrmProfile): Promise<RouteDurationResult | null> {
    return null;
  }
}

export class HttpOsrmClient implements OsrmClient {
  constructor(
    private readonly options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}
  ) {}

  async getRouteDuration(from: CanonicalPoint, to: CanonicalPoint, profile: OsrmProfile): Promise<RouteDurationResult | null> {
    const payload = await requestProviderJson<unknown>({
      provider: 'osrm',
      url: buildRouteUrl(from, to, profile, this.options.baseUrl),
      fetchImpl: this.options.fetchImpl
    });

    return mapRouteDuration(payload);
  }
}

export function buildRouteUrl(
  from: CanonicalPoint,
  to: CanonicalPoint,
  profile: OsrmProfile,
  baseUrl = 'https://router.project-osrm.org'
): URL {
  const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = new URL(`/route/v1/${profile}/${coordinates}`, baseUrl);
  url.searchParams.set('overview', 'false');
  return url;
}

function mapRouteDuration(payload: unknown): RouteDurationResult | null {
  if (!isRecord(payload) || !Array.isArray(payload.routes) || !isRecord(payload.routes[0])) {
    return null;
  }

  const route = payload.routes[0];
  if (typeof route.duration !== 'number' || !Number.isFinite(route.duration)) {
    return null;
  }

  return {
    durationSec: Math.max(0, Math.round(route.duration)),
    ...(typeof route.distance === 'number' && Number.isFinite(route.distance) ? { distanceMeters: Math.max(0, route.distance) } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
