import { HttpPhotonClient } from '../../../src/clients/photon.client.ts';
import { PROVIDER_POLICIES } from '../../../src/clients/providerCompliance.ts';
import { AddressGeocodeService } from '../../../src/services/addressGeocode.service.ts';
import { json, upstreamError, validationError } from '../../../src/utils/http.ts';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const limit = parseOptionalNumber(url.searchParams.get('limit'));
  const lat = parseOptionalNumber(url.searchParams.get('lat'));
  const lon = parseOptionalNumber(url.searchParams.get('lon'));
  // Optional bias point; ignored unless both are valid coordinates.
  const near = lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { latitude: lat, longitude: lon }
    : undefined;

  try {
    const data = await new AddressGeocodeService(new HttpPhotonClient()).geocode({ q, limit, near });
    return json({ success: true, data, attribution: { photon: PROVIDER_POLICIES.photon.attribution } });
  } catch (error) {
    if (error instanceof RangeError) {
      return validationError(error.message);
    }
    return upstreamError('photon', error);
  }
};

function parseOptionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
