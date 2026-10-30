import type { CanonicalDirection } from '../models/canonical.ts';

export const ITINERARY_TELEMETRY_VERSION = 'v1';

export type ItineraryLatencyBucket = 'lt_250ms' | '250ms_1s' | '1s_3s' | '3s_plus';

export interface ItineraryTelemetryPayload {
  direction: CanonicalDirection;
  latencyBucket: ItineraryLatencyBucket;
  timestamp: string;
  version: typeof ITINERARY_TELEMETRY_VERSION;
  errorCode?: string;
}

export function classifyLatencyBucket(latencyMs: number): ItineraryLatencyBucket {
  if (latencyMs < 250) {
    return 'lt_250ms';
  }
  if (latencyMs < 1_000) {
    return '250ms_1s';
  }
  if (latencyMs < 3_000) {
    return '1s_3s';
  }
  return '3s_plus';
}

export function createItineraryTelemetryPayload(input: {
  direction: CanonicalDirection;
  latencyMs?: number;
  timestamp?: string;
  errorCode?: string;
}): ItineraryTelemetryPayload {
  return {
    direction: input.direction,
    latencyBucket: classifyLatencyBucket(Math.max(0, Math.round(input.latencyMs ?? 0))),
    timestamp: input.timestamp ?? new Date().toISOString(),
    version: ITINERARY_TELEMETRY_VERSION,
    ...(input.errorCode ? { errorCode: input.errorCode } : {})
  };
}
