import { ErrorFactory } from './app-error';
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
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address || address.trim().length === 0) {
    throw ErrorFactory.validationError(new Error('Address is empty'));
  }

  const candidates = await apiGet<AddressCandidate[]>('/api/addresses/geocode', { q: address, limit: 1 }, 'geocoding');
  const best = candidates[0];
  if (!best) {
    throw ErrorFactory.geocodingNotFound(new Error('No address candidates returned'));
  }

  return { lat: best.coordinates.latitude, lon: best.coordinates.longitude };
}
