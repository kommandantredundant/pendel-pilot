export type ProviderName = 'dbTransport' | 'osrm' | 'photon';

/** Public provider details used in the UI and API attribution responses. */
export interface ProviderPolicy {
  attribution: string;
  timeoutMs: number;
}

export interface ProviderLegalNotice {
  provider: ProviderName;
  name: string;
  attribution: string;
  termsUrl?: string;
  licenseUrl?: string;
}

export interface ProviderRequestOptions {
  provider: ProviderName;
  url: URL;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const PROVIDER_LEGAL_METADATA: Record<ProviderName, Omit<ProviderLegalNotice, 'provider' | 'attribution'>> = {
  dbTransport: {
    name: 'DB Transport API',
    termsUrl: 'https://v6.db.transport.rest/api.html'
  },
  osrm: {
    name: 'OSRM routing with OpenStreetMap data',
    termsUrl: 'https://project-osrm.org/docs/',
    licenseUrl: 'https://www.openstreetmap.org/copyright'
  },
  photon: {
    name: 'Photon geocoding with OpenStreetMap data',
    termsUrl: 'https://github.com/komoot/photon',
    licenseUrl: 'https://www.openstreetmap.org/copyright'
  }
};

export const PROVIDER_POLICIES: Record<ProviderName, ProviderPolicy> = {
  dbTransport: { attribution: 'Transit data by DB Transport API', timeoutMs: 2_500 },
  osrm: { attribution: 'Routing by OSRM; map data © OpenStreetMap contributors', timeoutMs: 2_000 },
  photon: { attribution: 'Search by Photon; geocoding data © OpenStreetMap contributors', timeoutMs: 1_500 }
};

export function providerLegalNotices(): ProviderLegalNotice[] {
  return (Object.keys(PROVIDER_POLICIES) as ProviderName[]).map((provider) => ({
    provider,
    attribution: PROVIDER_POLICIES[provider].attribution,
    ...PROVIDER_LEGAL_METADATA[provider]
  }));
}

// Identifies this application to providers that use a User-Agent for policy or support contact.
export const PENDEL_PILOT_USER_AGENT = 'PendelPilot/0.1.0 (+https://github.com/kommandantredundant/pendel-pilot)';

export class ProviderTimeoutError extends Error {
  constructor(readonly provider: ProviderName, readonly timeoutMs: number) {
    super(`${provider} request timed out after ${timeoutMs}ms.`);
  }
}

/** Fetch and decode one provider response with an identity header and a bounded lifetime. */
export async function requestProviderJson<T>(options: ProviderRequestOptions): Promise<T> {
  const response = await fetchWithTimeout(
    options.fetchImpl ?? fetch,
    options.url,
    options.provider,
    options.timeoutMs ?? PROVIDER_POLICIES[options.provider].timeoutMs
  );

  if (!response.ok) {
    throw new Error(`${options.provider} responded with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: URL, provider: ProviderName, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': PENDEL_PILOT_USER_AGENT
      }
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderTimeoutError(provider, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
