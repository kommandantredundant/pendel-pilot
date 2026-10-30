import { AppError, ErrorFactory } from "./app-error";

/**
 * Thin client for the Pages Functions under /api.
 * Every endpoint answers with { success: true, data } or { success: false, error: { code, message } }.
 */

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export type ApiDomain = "transport" | "geocoding";

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function apiGet<T>(path: string, params: Record<string, string | number>, domain: ApiDomain): Promise<T> {
  const search = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return request<T>(`${path}?${search}`, { method: "GET" }, domain);
}

export async function apiPost<T>(path: string, body: unknown, domain: ApiDomain): Promise<T> {
  return request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, domain);
}

async function request<T>(path: string, init: RequestInit, domain: ApiDomain): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw networkError(domain, error);
  }

  let envelope: ApiEnvelope<T> | undefined;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = undefined;
  }

  if (envelope?.success) {
    return envelope.data;
  }

  // Non-envelope bodies (e.g. a platform error page) still map by HTTP status.
  const failure = envelope && envelope.success === false && envelope.error ? envelope.error : undefined;
  const status = response.ok && !failure ? 502 : response.status;
  throw toAppError(domain, new ApiRequestError(status, failure?.code ?? `HTTP_${response.status}`, failure?.message ?? response.statusText));
}

function networkError(domain: ApiDomain, cause: unknown): AppError {
  return domain === "geocoding" ? ErrorFactory.geocodingNetwork(cause) : ErrorFactory.transportNetwork(cause);
}

function toAppError(domain: ApiDomain, error: ApiRequestError): AppError {
  if (error.code === "VALIDATION_ERROR") return ErrorFactory.validationError(error);
  if (error.code === "TRANSPORT_DATA_UNAVAILABLE") return ErrorFactory.transportNoJourneys(error);
  if (error.status === 429) return domain === "geocoding" ? ErrorFactory.geocodingRateLimit(error) : ErrorFactory.transportNetwork(error);
  if (error.status >= 500) return networkError(domain, error);
  return domain === "geocoding" ? ErrorFactory.geocodingInvalidResponse(error) : ErrorFactory.transportInvalidResponse(error);
}
