import { ErrorFactory, ErrorType, isAppError } from './app-error';
import { apiGet } from './api-client';

export interface GeocodeResult {
  lat: number;
  lon: number;
}

interface AddressCandidate {
  name: string;
  coordinates: { latitude: number; longitude: number };
}

/**
 * Geocode an address string to coordinates via the backend (Photon behind /api/addresses/geocode)
 * @param address - The address string to geocode
 * @returns Coordinates of the best match, or throws AppError if nothing matches
 */
/** Pause before the single retry after a network or upstream failure. */
export const GEOCODE_RETRY_DELAY_MS = 1500;

export async function geocodeAddress(address: string, retryDelayMs = GEOCODE_RETRY_DELAY_MS): Promise<GeocodeResult> {
  if (!address || address.trim().length === 0) {
    throw ErrorFactory.validationError(new Error('Address is empty'));
  }

  const lookup = () => apiGet<AddressCandidate[]>('/api/addresses/geocode', { q: address, limit: 1 }, 'geocoding');
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

  return { lat: best.coordinates.latitude, lon: best.coordinates.longitude };
}
