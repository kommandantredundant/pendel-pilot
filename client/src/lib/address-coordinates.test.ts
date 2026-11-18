import test from "node:test";
import assert from "node:assert/strict";
import { distanceKm, MAX_ADDRESS_STATION_KM, resolveAddressCoordinates } from "./address-coordinates";
import { ErrorType, isAppError } from "./app-error";
import type { InsertSettings } from "@shared/client-schema";

const originalFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

const BERLIN_HBF = { lat: 52.525, lon: 13.369 };

const settings = {
  homeAddress: "Invalidenstraße 50, Berlin",
  homeStationId: "a",
  homeStationName: "Berlin Hbf",
  homeStationLat: BERLIN_HBF.lat,
  homeStationLon: BERLIN_HBF.lon,
  workAddress: "Alexanderplatz 1, Berlin",
  workStationId: "b",
  workStationName: "Berlin Alexanderplatz",
  workStationLat: 52.5219,
  workStationLon: 13.4132,
} as InsertSettings;

/** Photon stub: answers every lookup with the given place, and records the requests. */
function photonAnswers(candidate: { name: string; street?: string; housenumber?: string; city?: string; country?: string; countrycode?: string; lat: number; lon: number }) {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string) => {
    requests.push(input);
    const { lat, lon, ...rest } = candidate;
    return new Response(JSON.stringify({ success: true, data: [{ ...rest, coordinates: { latitude: lat, longitude: lon } }] }));
  }) as unknown as typeof fetch;
  return requests;
}

test("distanceKm measures great-circle distances", () => {
  assert.equal(Math.round(distanceKm(BERLIN_HBF, { lat: 48.1402, lon: 11.5583 })), 504); // Munich Hbf
  assert.equal(distanceKm(BERLIN_HBF, BERLIN_HBF), 0);
});

test("a match near the station is stored with what was found, and the lookup is biased to the station", async () => {
  const requests = photonAnswers({ name: "Hbf", street: "Invalidenstraße", housenumber: "50", city: "Berlin", countrycode: "DE", lat: 52.53, lon: 13.37 });

  const result = await resolveAddressCoordinates(settings, null);

  assert.equal(result.homeAddressLabel, "Invalidenstraße 50, Berlin");
  assert.equal(result.homeLat, 52.53);
  assert.match(requests[0], /lat=52\.525&lon=13\.369/);
});

test(`a match more than ${MAX_ADDRESS_STATION_KM} km from the station is rejected at that address field`, async () => {
  photonAnswers({ name: "Kehkeh", country: "Liberia", countrycode: "LR", lat: 6.03, lon: -9.44 });

  await assert.rejects(
    () => resolveAddressCoordinates(settings, null),
    (error: unknown) => isAppError(error) && error.type === ErrorType.GEOCODING_TOO_FAR && error.field === "homeAddress",
  );
});

test("kept coordinates are checked again when the station moves far away", async () => {
  photonAnswers({ name: "should not be asked", lat: 0, lon: 0 });
  const stored = {
    ...settings,
    homeLat: 52.53, homeLon: 13.37, workLat: 52.52, workLon: 13.41,
    routingInputFingerprint: { homeAddress: settings.homeAddress, workAddress: settings.workAddress },
  } as InsertSettings;
  const munichStation = { ...stored, homeStationName: "München Hbf", homeStationLat: 48.1402, homeStationLon: 11.5583 } as InsertSettings;

  await assert.rejects(
    () => resolveAddressCoordinates(munichStation, stored),
    (error: unknown) => isAppError(error) && error.type === ErrorType.GEOCODING_TOO_FAR && error.field === "homeAddress",
  );
});

test("without station coordinates nothing is biased or rejected (profiles from before stations had them)", async () => {
  const requests = photonAnswers({ name: "Kehkeh", country: "Liberia", countrycode: "LR", lat: 6.03, lon: -9.44 });
  const noCoordinates = { ...settings, homeStationLat: undefined, homeStationLon: undefined, workStationLat: undefined, workStationLon: undefined } as InsertSettings;

  const result = await resolveAddressCoordinates(noCoordinates, null);

  assert.equal(result.homeAddressLabel, "Kehkeh, Liberia");
  assert.doesNotMatch(requests[0], /lat=/);
});
