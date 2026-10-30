import type { Coordinates } from '../models/canonical.ts';
import { requestProviderJson } from './providerCompliance.ts';

export interface AddressGeocodeResult {
  name: string;
  city?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  coordinates: Coordinates;
}

export interface PhotonClient {
  geocode(q: string, limit: number): Promise<AddressGeocodeResult[]>;
}

export class StubPhotonClient implements PhotonClient {
  async geocode(_q: string, _limit: number): Promise<AddressGeocodeResult[]> {
    return [];
  }
}

export class HttpPhotonClient implements PhotonClient {
  constructor(
    private readonly options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}
  ) {}

  async geocode(q: string, limit: number): Promise<AddressGeocodeResult[]> {
    const payload = await requestProviderJson<unknown>({
      provider: 'photon',
      url: buildGeocodeUrl(q, limit, this.options.baseUrl),
      fetchImpl: this.options.fetchImpl
    });

    if (!isRecord(payload) || !Array.isArray(payload.features)) {
      return [];
    }

    return payload.features.map(mapFeature).filter((result): result is AddressGeocodeResult => result !== null).slice(0, limit);
  }
}

export function buildGeocodeUrl(q: string, limit: number, baseUrl = 'https://photon.komoot.io'): URL {
  const url = new URL('/api', baseUrl);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));
  return url;
}

function mapFeature(feature: unknown): AddressGeocodeResult | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry) || !Array.isArray(feature.geometry.coordinates)) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  const name = normalizedName(feature.properties);
  if (!name) {
    return null;
  }

  return {
    name,
    ...(typeof feature.properties.city === 'string' ? { city: feature.properties.city } : {}),
    ...(typeof feature.properties.state === 'string' ? { state: feature.properties.state } : {}),
    ...(typeof feature.properties.country === 'string' ? { country: feature.properties.country } : {}),
    ...(typeof feature.properties.countrycode === 'string' ? { countrycode: feature.properties.countrycode } : {}),
    coordinates: { latitude, longitude }
  };
}

function normalizedName(properties: Record<string, unknown>): string | null {
  const parts = [properties.name, properties.street, properties.city].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return parts[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
