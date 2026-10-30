import { type AddressGeocodeResult, type PhotonClient, StubPhotonClient } from '../clients/photon.client.ts';
import type { Coordinates } from '../models/canonical.ts';
import { clampLimit } from './stationSearch.service.ts';
import type { JourneyTelemetrySink } from './journeyCalculation.service.ts';

export interface AddressGeocodeOptions {
  q: string;
  limit?: number;
  savedProfileAddress?: {
    label?: string;
    coordinates: Coordinates;
  };
}

export class AddressGeocodeService {
  constructor(
    private readonly photonClient: PhotonClient = new StubPhotonClient(),
    private readonly telemetry?: JourneyTelemetrySink
  ) {}

  async geocode(options: AddressGeocodeOptions): Promise<AddressGeocodeResult[]> {
    const q = options.q.trim();
    const limit = clampLimit(options.limit, 5, 1, 10);

    if (q.length === 0) {
      throw new RangeError('Address geocode query must not be empty.');
    }

    try {
      const result = await this.photonClient.geocode(q, limit);
      this.telemetry?.({ event: 'service.fallback_used', metadata: { domain: 'photon', direction: 'read', outcome: 'primary' } });
      return result;
    } catch (error) {
      if (options.savedProfileAddress) {
        this.telemetry?.({ event: 'service.stale_if_error', metadata: { domain: 'photon', direction: 'read', outcome: 'fallback' } });
        return [
          {
            name: options.savedProfileAddress.label ?? q,
            coordinates: options.savedProfileAddress.coordinates
          }
        ];
      }
      this.telemetry?.({ event: 'service.stale_if_error', metadata: { domain: 'photon', direction: 'read', outcome: 'error' } });
      throw error;
    }
  }
}
