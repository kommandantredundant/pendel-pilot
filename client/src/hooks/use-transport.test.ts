import test from "node:test";
import assert from "node:assert/strict";
import { fetchJourneys, toCommuteSuggestion } from "./use-transport";
import { AppError, ErrorType, isAppError } from "../lib/app-error";

const sampleSettings = {
  homeAddress: "Musterstraße 1, Berlin",
  homeStationId: "de:11000:900003201",
  homeStationName: "Berlin Hbf",
  workAddress: "Bürostraße 42, Berlin",
  workStationId: "de:11000:900100003",
  workStationName: "Berlin Alexanderplatz",
  homeLat: 52.525,
  homeLon: 13.369,
  workLat: 52.521,
  workLon: 13.411,
  walkBufferMinutes: 5,
  bikeBufferMinutes: 3,
  homeLeavingBufferMinutes: 2,
  workLeavingBufferMinutes: 2,
  excludeFernverkehr: 0,
  language: "de",
};

const SETTINGS_KEY = "pendelpilot.settings.v1";
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as any).window;

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

test.beforeEach(() => {
  const localStorage = makeLocalStorageStub();
  (globalThis as any).window = { localStorage };
  globalThis.fetch = originalFetch;
});

test.after(() => {
  globalThis.fetch = originalFetch;
  (globalThis as any).window = originalWindow;
});

test("fetchJourneys throws settings-not-configured error if no local settings exist", async () => {
  await assert.rejects(
    () => fetchJourneys("work"),
    (err: unknown) => {
      assert.ok(isAppError(err));
      const appError = err as AppError;
      assert.strictEqual(appError.type, ErrorType.SETTINGS_NOT_CONFIGURED);
      return true;
    }
  );
});

test("fetchJourneys posts the saved profile to /api/journeys/calculate and maps every option", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...sampleSettings, excludeFernverkehr: 1 }));
  let request: { url: string; body: any } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    request = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ success: true, data: { options: [sampleOption("S 2"), sampleOption("RE 1")] } }));
  }) as unknown as typeof fetch;

  const suggestions = await fetchJourneys("work");

  assert.equal(request?.url, "/api/journeys/calculate");
  assert.equal(request?.body.direction, "work");
  assert.deepEqual(request?.body.homeAddress, { latitude: 52.525, longitude: 13.369 });
  assert.equal(request?.body.results, 5);
  assert.equal(request?.body.excludeLongDistance, true);
  assert.deepEqual(request?.body.buffers, { bufferLeaveHome: 2, bufferLeaveWork: 2, bufferPrepareWalk: 5, bufferPrepareBike: 3 });
  assert.ok(request?.body.departureTime);
  assert.deepEqual(suggestions.map((s) => s.journey.lineName), ["S 2", "RE 1"]);
});

test("fetchJourneys sends an arrival anchor when planning ahead by arrival time", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sampleSettings));
  let body: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ success: true, data: { options: [sampleOption("S 2", "home")] } }));
  }) as unknown as typeof fetch;

  await fetchJourneys("home", "later", "arrival", "18:30");

  assert.ok(body.arrivalTime);
  assert.equal(body.departureTime, undefined);
});

test("toCommuteSuggestion takes leave times from the origin address and arrive times from the destination address", () => {
  const work = toCommuteSuggestion(sampleOption("S 2"), "work");
  assert.equal(work.leaveHomeWalkTime, "2026-04-10T05:31:00.000Z");
  assert.equal(work.walkTimeMinutes, 11);
  assert.equal(work.journey.origin, "Berlin Südkreuz");
  assert.equal(work.journey.delay, 3);
  assert.equal(work.arriveWalkTime, "2026-04-10T15:15:00.000Z");
  assert.equal(work.arriveBikeTime, "2026-04-10T15:20:00.000Z");
  assert.equal(work.arriveWalkMinutes, 9);
  assert.equal(work.arriveBikeMinutes, 4);

  const home = toCommuteSuggestion(sampleOption("S 2", "home"), "home");
  assert.equal(home.leaveHomeWalkTime, "2026-04-10T15:15:00.000Z");
  assert.equal(home.walkTimeMinutes, 9);
  assert.equal(home.journey.origin, "Berlin Hbf");
  assert.equal(home.arriveWalkTime, "2026-04-10T05:31:00.000Z");
  assert.equal(home.arriveBikeMinutes, 5);
});

test("fetchJourneys maps TRANSPORT_DATA_UNAVAILABLE to transport-no-journeys", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sampleSettings));
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: false, error: { code: "TRANSPORT_DATA_UNAVAILABLE", message: "none" } }), { status: 503 })
  ) as unknown as typeof fetch;

  await assert.rejects(
    () => fetchJourneys("work"),
    (err: unknown) => {
      assert.ok(isAppError(err));
      assert.strictEqual((err as AppError).type, ErrorType.TRANSPORT_NO_JOURNEYS);
      return true;
    }
  );
});

test("fetchJourneys throws transport-invalid-response error on non-OK 4xx API responses", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sampleSettings));
  globalThis.fetch = (async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: async () => ({ message: "Not found" }),
  })) as unknown as typeof fetch;

  await assert.rejects(
    () => fetchJourneys("work"),
    (err: unknown) => {
      assert.ok(isAppError(err));
      const appError = err as AppError;
      assert.strictEqual(appError.type, ErrorType.TRANSPORT_INVALID_RESPONSE);
      return true;
    }
  );
});

test("fetchJourneys throws transport-network error on 5xx API responses", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sampleSettings));
  globalThis.fetch = (async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({ message: "Internal Server Error" }),
  })) as unknown as typeof fetch;

  await assert.rejects(
    () => fetchJourneys("work"),
    (err: unknown) => {
      assert.ok(isAppError(err));
      const appError = err as AppError;
      assert.strictEqual(appError.type, ErrorType.TRANSPORT_NETWORK);
      return true;
    }
  );
});

function sampleOption(lineName: string, direction: "work" | "home" = "work") {
  const transport = direction === "work"
    ? { departureTime: "2026-04-10T05:55:00.000Z", arrivalTime: "2026-04-10T06:15:00.000Z", plannedDepartureTime: "2026-04-10T05:52:00.000Z", departureDelaySec: 180 }
    : { departureTime: "2026-04-10T15:31:00.000Z", arrivalTime: "2026-04-10T15:50:00.000Z" };
  return {
    lineName,
    journey: {
      homeStation: { id: "8002549", name: "Berlin Südkreuz", lat: 52.475, lon: 13.365 },
      workStation: { id: "8000105", name: "Berlin Hbf", lat: 52.525, lon: 13.369 },
      ...(direction === "work" ? { transportWork: transport } : { transportHome: transport }),
      routeHomeWalkSec: 660,
      routeHomeBikeSec: 290,
      routeWorkWalkSec: 540,
      routeWorkBikeSec: 230,
      homeAddressWalkTime: "2026-04-10T05:31:00.000Z",
      homeAddressBikeTime: "2026-04-10T05:36:10.000Z",
      workAddressWalkTime: "2026-04-10T15:15:00.000Z",
      workAddressBikeTime: "2026-04-10T15:20:00.000Z",
    },
  };
}
