import test from "node:test";
import assert from "node:assert/strict";
import { geocodeAddress } from "./geocoding-service";
import { AppError, ErrorType, isAppError } from "./app-error";

const originalFetch = globalThis.fetch;

function respond(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

function rejectsWith(type: ErrorType) {
  return (err: unknown) => {
    assert.ok(isAppError(err));
    assert.strictEqual((err as AppError).type, type);
    return true;
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("geocodeAddress returns the first candidate's coordinates from /api/addresses/geocode", async () => {
  let requested = "";
  globalThis.fetch = (async (input: string) => {
    requested = input;
    return new Response(JSON.stringify({
      success: true,
      data: [{ name: "Berlin Hauptbahnhof", coordinates: { latitude: 52.525, longitude: 13.369 } }],
    }));
  }) as unknown as typeof fetch;

  const result = await geocodeAddress("Berlin Hauptbahnhof");

  assert.deepEqual(result, { lat: 52.525, lon: 13.369 });
  assert.match(requested, /^\/api\/addresses\/geocode\?q=Berlin\+Hauptbahnhof&limit=1$/);
});

test("geocodeAddress throws validation error for empty or whitespace-only address", async () => {
  await assert.rejects(() => geocodeAddress(""), rejectsWith(ErrorType.VALIDATION_ERROR));
  await assert.rejects(() => geocodeAddress("   "), rejectsWith(ErrorType.VALIDATION_ERROR));
});

test("geocodeAddress throws geocoding-not-found error when no candidates are returned", async () => {
  globalThis.fetch = respond(200, { success: true, data: [] });
  await assert.rejects(() => geocodeAddress("Nowhere"), rejectsWith(ErrorType.GEOCODING_NOT_FOUND));
});

test("geocodeAddress throws geocoding-rate-limit error on 429 status", async () => {
  globalThis.fetch = respond(429, { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } });
  await assert.rejects(() => geocodeAddress("Berlin"), rejectsWith(ErrorType.GEOCODING_RATE_LIMIT));
});

test("geocodeAddress throws geocoding-network error on 5xx status or failed fetch", async () => {
  globalThis.fetch = respond(502, { success: false, error: { code: "UPSTREAM", message: "Bad gateway" } });
  await assert.rejects(() => geocodeAddress("Berlin"), rejectsWith(ErrorType.GEOCODING_NETWORK));

  globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  await assert.rejects(() => geocodeAddress("Berlin"), rejectsWith(ErrorType.GEOCODING_NETWORK));
});
