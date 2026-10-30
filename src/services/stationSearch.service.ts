import { type TransitClient, type StationSearchResult, StubTransitClient } from '../clients/transit.client.ts';
import type { JourneyTelemetrySink } from './journeyCalculation.service.ts';

export interface StationSearchOptions {
  query: string;
  limit?: number;
}

export class StationSearchService {
  constructor(
    private readonly transitClient: TransitClient = new StubTransitClient(),
    private readonly telemetry?: JourneyTelemetrySink
  ) {}

  async searchStations(options: StationSearchOptions): Promise<StationSearchResult[]> {
    const query = options.query.trim();
    const limit = clampLimit(options.limit, 5, 1, 20);

    if (query.length < 2 || query.length > 100) {
      throw new RangeError('Station search query must be between 2 and 100 characters.');
    }

    try {
      const result = await this.transitClient.searchStations(query, limit);
      this.telemetry?.({ event: 'service.fallback_used', metadata: { domain: 'db', direction: 'read', outcome: 'primary' } });
      return result;
    } catch (error) {
      this.telemetry?.({ event: 'service.stale_if_error', metadata: { domain: 'db', direction: 'read', outcome: 'error' } });
      throw error;
    }
  }
}

export function clampLimit(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}
