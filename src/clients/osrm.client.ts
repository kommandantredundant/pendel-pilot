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

// Address-to-station routes rarely change; FOSSGIS asks for light use, so cache them for 14 days.
const ROUTE_CACHE_TTL_SEC = 14 * 24 * 60 * 60;
// FOSSGIS usage policy: at most one request per second.
const MIN_REQUEST_INTERVAL_MS = 1_000;

export interface RouteCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export class HttpOsrmClient implements OsrmClient {
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: {
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      cache?: RouteCache | null;
      minRequestIntervalMs?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {}
  ) {}

  async getRouteDuration(from: CanonicalPoint, to: CanonicalPoint, profile: OsrmProfile): Promise<RouteDurationResult | null> {
    const url = buildRouteUrl(from, to, profile, this.options.baseUrl);
    const cache = this.options.cache === undefined ? defaultRouteCache() : this.options.cache;
    const cacheKey = new Request(url);

    const cached = await cache?.match(cacheKey);
    if (cached) {
      return mapRouteDuration(await cached.json());
    }

    const payload = await this.throttled(() =>
      requestProviderJson<unknown>({ provider: 'osrm', url, fetchImpl: this.options.fetchImpl })
    );
    const result = mapRouteDuration(payload);
    if (result && cache) {
      await cache
        .put(cacheKey, Response.json(payload, { headers: { 'cache-control': `public, max-age=${ROUTE_CACHE_TTL_SEC}` } }))
        .catch(() => undefined);
    }
    return result;
  }

  /** Serializes uncached provider calls and keeps them at least MIN_REQUEST_INTERVAL_MS apart. */
  private throttled<T>(call: () => Promise<T>): Promise<T> {
    const interval = this.options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + interval - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      this.lastRequestAt = Date.now();
      return call();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function defaultRouteCache(): RouteCache | null {
  // Cloudflare Workers expose a per-colo HTTP cache as caches.default; Node does not.
  const storage = (globalThis as { caches?: { default?: RouteCache } }).caches;
  return storage?.default ?? null;
}

const FOSSGIS_ROUTING_BASE_URL = 'https://routing.openstreetmap.de';

/**
 * FOSSGIS runs one OSRM instance per profile (`/routed-foot`, `/routed-bike`). The public
 * project-osrm.org demo only serves the car profile and silently ignores foot/bike.
 * The profile segment in the OSRM path is not evaluated by these instances.
 */
export function buildRouteUrl(
  from: CanonicalPoint,
  to: CanonicalPoint,
  profile: OsrmProfile,
  baseUrl = FOSSGIS_ROUTING_BASE_URL
): URL {
  const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = new URL(`/routed-${profile}/route/v1/driving/${coordinates}`, baseUrl);
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
