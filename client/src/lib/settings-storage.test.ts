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
  walkBufferMinutes: 5,
  bikeBufferMinutes: 3,
  homeLeavingBufferMinutes: 2,
  workLeavingBufferMinutes: 2,
  excludeFernverkehr: 1,
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

test("clearSettings removes persisted settings", () => {
  saveSettings(sampleSettings);
  clearSettings();
  assert.equal(loadSettings(), null);
});
