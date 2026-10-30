import { HttpDbTransportClient } from '../../../src/clients/dbTransport.client.ts';
import { PROVIDER_POLICIES } from '../../../src/clients/providerCompliance.ts';
import { StationSearchService } from '../../../src/services/stationSearch.service.ts';
import { json, validationError } from '../../../src/utils/http.ts';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('query') ?? '';
  const limit = parseOptionalNumber(url.searchParams.get('limit'));

  try {
    const data = await new StationSearchService(new HttpDbTransportClient()).searchStations({ query, limit });
    return json({ success: true, data, attribution: { dbTransport: PROVIDER_POLICIES.dbTransport.attribution } });
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
