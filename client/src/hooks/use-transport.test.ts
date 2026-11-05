import test from "node:test";
import assert from "node:assert/strict";
import { fetchJourneys, fetchPlanJourneys, toCommuteSuggestion } from "./use-transport";
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
  homeLeavingBufferSeconds: 120,
  workLeavingBufferSeconds: 45,
  homeBikeBufferSeconds: 180,
  workBikeBufferSeconds: 0,
  homeBikeParkingSeconds: 240,
  workBikeParkingSeconds: 90,
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
  (globalThis as any).window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...sampleSettings, excludeFernverkehr: 1, workStationLat: 52.5219, workStationLon: 13.4132 })
  );
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
  assert.deepEqual(request?.body.workStationLocation, { latitude: 52.5219, longitude: 13.4132 });
  assert.equal(request?.body.homeStationLocation, undefined);
  assert.equal(request?.body.excludeLongDistance, true);
  assert.deepEqual(request?.body.buffers, {
    bufferLeaveHomeSec: 120,
    bufferLeaveWorkSec: 45,
    bufferBikeHomeSec: 180,
    bufferBikeWorkSec: 0,
    bufferBikeParkingHomeSec: 240,
    bufferBikeParkingWorkSec: 90,
  });
  assert.equal(request?.body.fixedDurations, undefined);
  assert.ok(request?.body.departureTime);
  assert.deepEqual(suggestions.map((s) => s.journey.lineName), ["S 2", "RE 1"]);
});

test("fetchJourneys sends ticked fixed times only and leaves out the address of a side that is fixed for both modes", async () => {
  (globalThis as any).window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...sampleSettings,
      homeAddress: "",
      homeLat: undefined,
      homeLon: undefined,
      homeWalkFixed: 1,
      homeWalkFixedSeconds: 754,
      homeBikeFixed: 1,
      homeBikeFixedSeconds: 420,
      // Unticked: kept in the settings, but routing is used.
      workWalkFixed: 0,
      workWalkFixedSeconds: 600,
    })
  );
  let body: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ success: true, data: { options: [sampleOption("S 2")] } }));
  }) as unknown as typeof fetch;

  await fetchJourneys("work");

  assert.deepEqual(body.fixedDurations, { homeWalkSec: 754, homeBikeSec: 420 });
  assert.equal(body.homeAddress, undefined);
  assert.deepEqual(body.workAddress, { latitude: 52.521, longitude: 13.411 });
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
  assert.deepEqual(work.journey.legs, [
    {
      lineName: "S 2",
      departure: "2026-04-10T05:55:00.000Z",
      plannedDeparture: "2026-04-10T05:52:00.000Z",
      delay: 3,
      platform: "7",
      plannedPlatform: "5",
    },
    // No real-time data for the second train: delay stays unknown instead of "on time".
    {
      lineName: "RE1",
      departure: "2026-04-10T06:05:00.000Z",
      plannedDeparture: "2026-04-10T06:05:00.000Z",
      delay: null,
      platform: "8",
      plannedPlatform: "8",
    },
  ]);
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
    departurePlatform: "7",
    plannedDeparturePlatform: "5",
    legs: [
      {
        lineName,
        departureTime: "2026-04-10T05:55:00.000Z",
        plannedDepartureTime: "2026-04-10T05:52:00.000Z",
        departureDelaySec: 180,
        departurePlatform: "7",
        plannedDeparturePlatform: "5",
      },
      { lineName: "RE1", departureTime: "2026-04-10T06:05:00.000Z", departurePlatform: "8", plannedDeparturePlatform: "8" },
    ],
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

const PLAN_BASE = Date.parse("2026-04-10T05:00:00.000Z");
const planAt = (minutes: number) => new Date(PLAN_BASE + minutes * 60_000).toISOString();

/** Train leaving at `minute`; walking leaves home 20 min before it, cycling 10 min before. */
function optionAt(minute: number) {
  const departureTime = planAt(minute);
  const arrivalTime = planAt(minute + 20);
  return {
    lineName: `RE ${minute}`,
    legs: [{ lineName: `RE ${minute}`, departureTime, arrivalTime }],
    journey: {
      homeStation: { id: "a", name: "A", lat: 52.4, lon: 13.3 },
      workStation: { id: "b", name: "B", lat: 52.5, lon: 13.4 },
      transportWork: { departureTime, arrivalTime },
      routeHomeWalkSec: 1080,
      routeHomeBikeSec: 480,
      routeWorkWalkSec: 300,
      routeWorkBikeSec: 120,
      homeAddressWalkTime: planAt(minute - 20),
      homeAddressBikeTime: planAt(minute - 10),
      workAddressWalkTime: planAt(minute + 25),
      workAddressBikeTime: planAt(minute + 22),
    },
  };
}

test("fetchPlanJourneys for 'now' loads further pages until enough connections can still be made", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sampleSettings));
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    // First page: trains at 5 and 8 are out of reach at minute 0, only the one at 25 can be made.
    const minutes = bodies.length === 1 ? [5, 8, 25] : [30, 40, 50];
    return new Response(JSON.stringify({ success: true, data: { options: minutes.map(optionAt) } }));
  }) as unknown as typeof fetch;

  const list = await fetchPlanJourneys("work", { kind: "now" }, false, 3, () => PLAN_BASE);

  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].departureTime, planAt(26)); // one minute after the last train of the first page
  assert.equal(bodies[1].results, 3);
  assert.deepEqual(list.map((s) => s.journey.lineName), ["RE 5", "RE 8", "RE 25", "RE 30", "RE 40", "RE 50"]);
});

test("fetchPlanJourneys does not page for an explicit departure time", async () => {
  (globalThis as any).window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sampleSettings));
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ success: true, data: { options: [optionAt(5)] } }));
  }) as unknown as typeof fetch;

  await fetchPlanJourneys("work", { kind: "departure", time: planAt(0) }, false, 6, () => PLAN_BASE + 60 * 60_000);
  assert.equal(calls, 1);
});
