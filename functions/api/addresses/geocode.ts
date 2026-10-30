import { HttpPhotonClient } from '../../../src/clients/photon.client.ts';
import { PROVIDER_POLICIES } from '../../../src/clients/providerCompliance.ts';
import { AddressGeocodeService } from '../../../src/services/addressGeocode.service.ts';
import { json, validationError } from '../../../src/utils/http.ts';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const limit = parseOptionalNumber(url.searchParams.get('limit'));

  try {
    const data = await new AddressGeocodeService(new HttpPhotonClient()).geocode({ q, limit });
    return json({ success: true, data, attribution: { photon: PROVIDER_POLICIES.photon.attribution } });
  } catch (error) {
    if (error instanceof RangeError) {
      return validationError(error.message);
    }
    throw error;
  }
};

function parseOptionalNumber(value: string | null): number | undefined {
  return value === null ? undefined : Number(value);
}
