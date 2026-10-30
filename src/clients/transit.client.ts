import type { CanonicalDirection, CanonicalStation, TransportTiming } from '../models/canonical.ts';

export interface StationSearchResult extends CanonicalStation {
  products?: Record<string, boolean>;
}

export interface TransportConnection extends TransportTiming {
  departureStation: CanonicalStation;
  arrivalStation: CanonicalStation;
  /** Name of the first public-transport line, e.g. "RE 1" or "S 5". */
  lineName?: string;
  transfers?: number;
}

export type TransportSearchResult = TransportTiming & Partial<Pick<TransportConnection, 'departureStation' | 'arrivalStation'>>;

export interface TransportSearchInput {
  fromStationId: string;
  toStationId: string;
  direction: CanonicalDirection;
  departureTime?: string;
  arrivalTime?: string;
  excludeLongDistance?: boolean;
}

/** Contract for the public-transport timing provider (implemented by HttpTransitousClient). */
export interface TransitClient {
  searchStations(query: string, limit: number): Promise<StationSearchResult[]>;
  calculateTransport(input: TransportSearchInput): Promise<TransportSearchResult | null>;
  /** Optional multi-connection search; clients without it fall back to calculateTransport. */
  calculateTransportOptions?(input: TransportSearchInput, results: number): Promise<TransportConnection[]>;
}

export class StubTransitClient implements TransitClient {
  async searchStations(_query: string, _limit: number): Promise<StationSearchResult[]> {
    return [];
  }

  async calculateTransport(_input: TransportSearchInput): Promise<TransportSearchResult | null> {
    return null;
  }
}
