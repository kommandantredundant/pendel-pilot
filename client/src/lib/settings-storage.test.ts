import test from "node:test";
import assert from "node:assert/strict";
import { clearSettings, isStorageAvailable, loadSettings, saveSettings } from "./settings-storage";

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
  homeLeavingBufferMinutes: 2,
  workLeavingBufferMinutes: 1,
  homeBikeBufferMinutes: 3,
  workBikeBufferMinutes: 0,
  homeBikeParkingMinutes: 2,
  workBikeParkingMinutes: 4,
  homeWalkFixed: 1,
  homeWalkFixedSeconds: 754,
  homeBikeFixed: 0,
  homeBikeFixedSeconds: 300,
  workWalkFixed: 0,
  workBikeFixed: 0,
  excludeFernverkehr: 1,
  glanceMode: 1,
  planMode: 1,
  stationModeFromHome: "bike",
  stationModeFromWork: "both",
  language: "de",
} as const;

const localStorageStub = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
})();

const originalWindow = (globalThis as any).window;

test.beforeEach(() => {
  (globalThis as any).window = { localStorage: localStorageStub };
  localStorageStub.clear();
});

test.after(() => {
  (globalThis as any).window = originalWindow;
});

test("isStorageAvailable returns true when localStorage works", () => {
  assert.equal(isStorageAvailable(), true);
});

test("saveSettings + loadSettings roundtrip", () => {
  saveSettings(sampleSettings);
  const loaded = loadSettings();
  assert.deepEqual(loaded, sampleSettings);
});

test("the shared bike buffer of older profiles becomes the starting value of both sides; the walking buffer is dropped", () => {
  const {
    homeBikeBufferMinutes: _home,
    workBikeBufferMinutes: _work,
    ...current
  } = sampleSettings;
  localStorageStub.setItem(
    "pendelpilot.settings.v1",
    JSON.stringify({ ...current, walkBufferMinutes: 5, bikeBufferMinutes: 3 })
  );
  const loaded = loadSettings() as Record<string, unknown> | null;
  assert.equal(loaded?.homeBikeBufferMinutes, 3);
  assert.equal(loaded?.workBikeBufferMinutes, 3);
  assert.equal(loaded?.homeBikeParkingMinutes, 2);
  assert.equal("walkBufferMinutes" in (loaded ?? {}), false);
  assert.equal("bikeBufferMinutes" in (loaded ?? {}), false);
});

test("an address may stay empty only while both modes of its side use a fixed time", () => {
  const bothFixed = { ...sampleSettings, homeAddress: "", homeLat: undefined, homeLon: undefined, homeBikeFixed: 1 };
  assert.equal(saveSettings(bothFixed).homeAddress, "");
  assert.throws(() => saveSettings({ ...bothFixed, homeBikeFixed: 0 }), /Home address is required/);
  assert.throws(() => saveSettings({ ...sampleSettings, workAddress: "" }), /Work address is required/);
});

test("a ticked fixed time needs a value; an unticked one keeps its value", () => {
  assert.throws(() => saveSettings({ ...sampleSettings, workWalkFixed: 1 }), /Fixed time is required/);
  saveSettings({ ...sampleSettings, homeWalkFixed: 0 });
  assert.equal(loadSettings()?.homeWalkFixedSeconds, 754);
});

test("clearSettings removes persisted settings", () => {
  saveSettings(sampleSettings);
  clearSettings();
  assert.equal(loadSettings(), null);
});

test("profiles saved before Glance existed load with Glance off and a spontaneous choice", () => {
  const { glanceMode: _glance, planMode: _plan, stationModeFromHome: _fromHome, stationModeFromWork: _fromWork, ...legacy } = sampleSettings;
  localStorageStub.setItem("pendelpilot.settings.v1", JSON.stringify(legacy));
  const loaded = loadSettings();
  assert.equal(loaded?.glanceMode, 0);
  assert.equal(loaded?.planMode, 0);
  assert.equal(loaded?.stationModeFromHome, "both");
  assert.equal(loaded?.stationModeFromWork, "both");
});
