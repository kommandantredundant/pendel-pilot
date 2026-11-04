import { ProviderTimeoutError, type ProviderName } from '../clients/providerCompliance.ts';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  attribution?: Record<string, string>;
  telemetryEvents?: string[];
  telemetryPayload?: unknown;
}

export interface ApiError {
  success: false;
  telemetryEvents?: string[];
  telemetryPayload?: unknown;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function json<T>(body: ApiSuccess<T> | ApiError, init: ResponseInit = {}): Response {
  return Response.json(body, {
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
    ...init
  });
}

export function validationError(message: string, details?: unknown): Response {
  return json({ success: false, error: { code: 'VALIDATION_ERROR', message, details } }, { status: 400 });
}

/**
 * A provider (Photon, Transitous, OSRM) failed: answer with the API envelope instead of letting the
 * platform return a bare 500, and log the cause so it shows up in the Cloudflare function logs.
 * Timeouts are 504, every other failure (HTTP error, network, bad JSON) is 503.
 */
export function upstreamError(provider: ProviderName, error: unknown): Response {
  const timeout = error instanceof ProviderTimeoutError;
  const message = error instanceof Error ? error.message : `${provider} request failed.`;
  console.error(`[${provider}] upstream failure: ${message}`);
  return json(
    { success: false, error: { code: 'UPSTREAM_UNAVAILABLE', message, details: { provider, timeout } } },
    { status: timeout ? 504 : 503 }
  );
}
