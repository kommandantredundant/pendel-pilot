import test from "node:test";
import assert from "node:assert/strict";
import { formatAddressLabel, geocodeAddress } from "./geocoding-service";
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

  assert.deepEqual(result, { lat: 52.525, lon: 13.369, label: "Berlin Hauptbahnhof" });
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

test("geocodeAddress throws geocoding-network error on 5xx status or failed fetch, after one retry", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ success: false, error: { code: "UPSTREAM_UNAVAILABLE", message: "photon responded with HTTP 403." } }), { status: 503 });
  }) as typeof fetch;
  await assert.rejects(() => geocodeAddress("Berlin", 0), rejectsWith(ErrorType.GEOCODING_NETWORK));
  assert.equal(calls, 2);

  globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  await assert.rejects(() => geocodeAddress("Berlin", 0), rejectsWith(ErrorType.GEOCODING_NETWORK));
});

test("geocodeAddress succeeds when the retry after an upstream failure works", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({ success: false, error: { code: "UPSTREAM_UNAVAILABLE", message: "timed out" } }), { status: 504 })
      : new Response(JSON.stringify({ success: true, data: [{ name: "Domplatz", coordinates: { latitude: 51.96, longitude: 7.62 } }] }));
  }) as typeof fetch;
  assert.deepEqual(await geocodeAddress("Domplatz 10, Münster", 0), { lat: 51.96, lon: 7.62, label: "Domplatz" });
  assert.equal(calls, 2);
});

test("geocodeAddress does not retry when the address is simply not found", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ success: true, data: [] }));
  }) as typeof fetch;
  await assert.rejects(() => geocodeAddress("Nowhere", 0), rejectsWith(ErrorType.GEOCODING_NOT_FOUND));
  assert.equal(calls, 1);
});

test("geocodeAddress sends the bias point when given", async () => {
  let requested = "";
  globalThis.fetch = (async (input: string) => {
    requested = input;
    return new Response(JSON.stringify({ success: true, data: [{ name: "X", coordinates: { latitude: 1, longitude: 2 } }] }));
  }) as unknown as typeof fetch;

  await geocodeAddress("Hauptstraße 1", 0, { lat: 52.5, lon: 13.4 });

  assert.match(requested, /[?&]lat=52\.5&lon=13\.4$/);
});

test("formatAddressLabel shows street, house number, postcode and town, and the country only abroad", () => {
  const coordinates = { latitude: 0, longitude: 0 };
  assert.equal(
    formatAddressLabel({ name: "Berliner Schloss", street: "Schloßplatz", housenumber: "1", postcode: "10178", city: "Berlin", countrycode: "DE", country: "Deutschland", coordinates }),
    "Schloßplatz 1, 10178 Berlin",
  );
  assert.equal(
    formatAddressLabel({ name: "Kehkeh", country: "Liberia", countrycode: "LR", coordinates }),
    "Kehkeh, Liberia",
  );
  assert.equal(formatAddressLabel({ name: "Berlin", city: "Berlin", countrycode: "DE", coordinates }), "Berlin");
});
