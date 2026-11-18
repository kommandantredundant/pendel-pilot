import { ErrorFactory, ErrorType, isAppError } from './app-error';
import { apiGet } from './api-client';

export interface GeocodeResult {
  lat: number;
  lon: number;
  /** What was found, readable, e.g. "Schloßplatz 1, 10178 Berlin". */
  label: string;
}

export interface AddressCandidate {
  name: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  country?: string;
  countrycode?: string;
  coordinates: { latitude: number; longitude: number };
}

/** "Street 1, 12345 Town" where known, else the place name; the country only outside Germany. */
export function formatAddressLabel(candidate: AddressCandidate): string {
  const streetLine = candidate.street
    ? [candidate.street, candidate.housenumber].filter(Boolean).join(" ")
    : candidate.name;
  const townLine = [candidate.postcode, candidate.city].filter(Boolean).join(" ");
  const country = candidate.countrycode && candidate.countrycode.toUpperCase() !== "DE" ? candidate.country : undefined;
  return [streetLine, townLine !== streetLine ? townLine : "", country]
    .filter((part): part is string => !!part)
    .join(", ");
}

/** Pause before the single retry after a network or upstream failure. */
export const GEOCODE_RETRY_DELAY_MS = 1500;

/**
 * Geocode an address string to coordinates via the backend (Photon behind /api/addresses/geocode).
 * `near` (the station of that place) makes Photon prefer matches close to it; far matches are still possible.
 * @returns Coordinates and readable label of the best match, or throws AppError if nothing matches
 */
export async function geocodeAddress(
  address: string,
  retryDelayMs = GEOCODE_RETRY_DELAY_MS,
  near?: { lat: number; lon: number }
): Promise<GeocodeResult> {
  if (!address || address.trim().length === 0) {
    throw ErrorFactory.validationError(new Error('Address is empty'));
  }

  const params: Record<string, string | number> = { q: address, limit: 1 };
  if (near) Object.assign(params, { lat: near.lat, lon: near.lon });
  const lookup = () => apiGet<AddressCandidate[]>('/api/addresses/geocode', params, 'geocoding');
  let candidates: AddressCandidate[];
  try {
    candidates = await lookup();
  } catch (error) {
    // The public Photon instance occasionally times out or refuses a request; one retry usually succeeds.
    if (!isAppError(error) || error.type !== ErrorType.GEOCODING_NETWORK) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    candidates = await lookup();
  }
  const best = candidates[0];
  if (!best) {
    throw ErrorFactory.geocodingNotFound(new Error('No address candidates returned'));
  }

  return { lat: best.coordinates.latitude, lon: best.coordinates.longitude, label: formatAddressLabel(best) };
}
