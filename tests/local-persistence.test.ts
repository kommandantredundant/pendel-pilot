import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CanonicalJourney } from '../src/models/canonicalJourney.ts';
import { DailyJourneyLocalStore, LOCAL_STORAGE_KEYS, type BufferSettings, type CommuteProfile, type KeyValueStorage } from '../src/models/localPersistence.ts';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}
const profile: CommuteProfile = { id: 'default', name: 'My commute', homeAddress: { lat: 52.52, lon: 13.4 }, homeStation: { id: 'home', name: 'Home station', lat: 52.5, lon: 13.3 }, workStation: { id: 'work', name: 'Work station', lat: 52.6, lon: 13.4 }, workAddress: { lat: 52.61, lon: 13.41 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const bufferSettings: BufferSettings = { bufferInsideHomeStationMin: 5, bufferInsideWorkStationMin: 3, bufferLeaveHomeMin: 4, bufferLeaveWorkMin: 6, bufferPrepareWalkMin: 1, bufferPrepareBikeMin: 2 };

describe('local persistence', () => {
  it('saves and loads one commute and its buffer settings', () => {
    const store = new DailyJourneyLocalStore(new MemoryStorage());
    store.saveCommute({ profile, bufferSettings });
    assert.deepEqual(store.readCommute(), { profile, bufferSettings });
  });
  it('saves and loads the optional last successful journey', () => {
    const storage = new MemoryStorage();
    const store = new DailyJourneyLocalStore(storage);
    assert.equal(store.readLastSuccessfulJourney(), undefined);
    const journey = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/journeys/journeyWork.response.json', import.meta.url)), 'utf8')) as CanonicalJourney;
    store.saveLastSuccessfulJourney(journey);
    assert.deepEqual(store.readLastSuccessfulJourney(), journey);
  });
  it('ignores corrupt persisted data at the UI boundary', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_STORAGE_KEYS.commute, '{not json');
    storage.setItem(LOCAL_STORAGE_KEYS.lastSuccessfulJourney, JSON.stringify({ direction: 'journeyWork' }));
    const store = new DailyJourneyLocalStore(storage);
    assert.equal(store.readCommute(), undefined);
    assert.equal(store.readLastSuccessfulJourney(), undefined);
  });
});
