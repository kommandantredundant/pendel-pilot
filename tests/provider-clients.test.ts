import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpTransitousClient } from '../src/clients/transitous.client.ts';
import { HttpOsrmClient } from '../src/clients/osrm.client.ts';
import { HttpPhotonClient } from '../src/clients/photon.client.ts';
import { PENDEL_PILOT_USER_AGENT, PROVIDER_POLICIES, ProviderTimeoutError, requestProviderJson } from '../src/clients/providerCompliance.ts';
import { AddressGeocodeService } from '../src/services/addressGeocode.service.ts';
import { StationSearchService } from '../src/services/stationSearch.service.ts';

function jsonFetch(payload: unknown, seenHeaders: Headers[] = []): typeof fetch {
  return async (_input, init) => {
    seenHeaders.push(new Headers(init?.headers));
    return Response.json(payload);
  };
}

describe('provider clients', () => {
  it('maps Transitous stop search into canonical station identity fields', async () => {
    const headers: Headers[] = [];
    const client = new HttpTransitousClient({
      fetchImpl: jsonFetch(
        [
          { type: 'STOP', id: 'de-DELFI_de:11000:900003201', name: 'Berlin Hauptbahnhof', lat: 52.525, lon: 13.369, modes: ['HIGHSPEED_RAIL'] },
          { type: 'ADDRESS', id: 'addr-1', name: 'Invalidenstraße', lat: 52.52, lon: 13.37 }
        ],
        headers
      )
    });

    const results = await client.searchStations('Berlin Hbf', 5);

    assert.deepEqual(results, [{ id: 'de-DELFI_de:11000:900003201', name: 'Berlin Hauptbahnhof', lat: 52.525, lon: 13.369 }]);
    assert.equal(headers[0].get('user-agent'), PENDEL_PILOT_USER_AGENT);
  });

  it('maps Transitous itineraries into station y timing anchors and preserves delay metadata', async () => {
    const client = new HttpTransitousClient({
      fetchImpl: jsonFetch({
        itineraries: [
          {
            transfers: 0,
            legs: [
              {
                mode: 'WALK',
                from: { name: 'Start', lat: 52.47, lon: 13.36 },
                to: { stopId: 'de-DELFI_a', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
                startTime: '2026-04-10T05:45:00Z',
                endTime: '2026-04-10T05:50:00Z'
              },
              {
                mode: 'SUBURBAN',
                displayName: 'S2',
                realTime: true,
                from: { stopId: 'de-DELFI_a', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
                to: { stopId: 'de-DELFI_b', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
                startTime: '2026-04-10T05:55:00Z',
                endTime: '2026-04-10T06:15:00Z',
                scheduledStartTime: '2026-04-10T05:52:00Z',
                scheduledEndTime: '2026-04-10T06:11:00Z'
              }
            ]
          }
        ]
      })
    });

    const result = await client.calculateTransport({
      direction: 'journeyWork',
      fromStationId: 'de-DELFI_a',
      toStationId: 'de-DELFI_b',
      departureTime: '2026-04-10T07:52:00+02:00'
    });

    assert.equal(result?.departureStation?.id, 'de-DELFI_a');
    assert.equal(result?.arrivalStation?.id, 'de-DELFI_b');
    assert.equal(result?.departureTime, '2026-04-10T05:55:00Z');
    assert.equal(result?.arrivalTime, '2026-04-10T06:15:00Z');
    assert.equal(result?.delayStatus, 'delayed');
    assert.equal(result?.departureDelaySec, 180);
    assert.equal(result?.arrivalDelaySec, 240);
  });

  it('maps OSRM routes only into segment x/z duration and distance values', async () => {
    const client = new HttpOsrmClient({ fetchImpl: jsonFetch({ routes: [{ duration: 123.6, distance: 789.5 }] }) });

    const result = await client.getRouteDuration({ lat: 52.52, lon: 13.405 }, { lat: 52.5, lon: 13.4 }, 'foot');

    assert.deepEqual(result, { durationSec: 124, distanceMeters: 789.5 });
  });

  it('maps Photon features only into address geocode fields', async () => {
    const client = new HttpPhotonClient({
      fetchImpl: jsonFetch({
        features: [
          {
            properties: { name: 'Alexanderplatz', country: 'Deutschland', countrycode: 'DE' },
            geometry: { coordinates: [13.4132, 52.5219] }
          }
        ]
      })
    });

    const result = await client.geocode('Alexanderplatz', 1);

    assert.deepEqual(result, [
      {
        name: 'Alexanderplatz',
        country: 'Deutschland',
        countrycode: 'DE',
        coordinates: { latitude: 52.5219, longitude: 13.4132 }
      }
    ]);
    assert.match(PROVIDER_POLICIES.photon.attribution, /Photon/);
    assert.match(PROVIDER_POLICIES.osrm.attribution, /OSRM/);
  });

  it('uses configured provider timeout budgets without shared request state', async () => {
    assert.equal(PROVIDER_POLICIES.photon.timeoutMs, 5_000);
    assert.equal(PROVIDER_POLICIES.osrm.timeoutMs, 2_000);
    assert.equal(PROVIDER_POLICIES.transitous.timeoutMs, 4_000);

    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return Response.json({ ok: true });
    };
    const url = new URL('https://dailyjourney.test/provider-dedup');
    const [first, second] = await Promise.all([
      requestProviderJson<{ ok: boolean }>({ provider: 'osrm', url, fetchImpl }),
      requestProviderJson<{ ok: boolean }>({ provider: 'osrm', url, fetchImpl })
    ]);

    assert.deepEqual(first, { ok: true });
    assert.deepEqual(second, { ok: true });
    assert.equal(calls, 2);
  });

  it('aborts provider requests that exceed the configured timeout', async () => {
    const fetchImpl: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });

    await assert.rejects(
      requestProviderJson({ provider: 'photon', url: new URL('https://dailyjourney.test/timeout'), timeoutMs: 1, fetchImpl }),
      (error: unknown) => error instanceof ProviderTimeoutError && error.provider === 'photon' && error.timeoutMs === 1
    );
  });

  it('falls back for Photon geocoding only when a saved profile already has coordinates', async () => {
    const events: string[] = [];
    const service = new AddressGeocodeService({
      async geocode() {
        throw new Error('Photon unavailable');
      }
    }, (event) => events.push(event.event));

    await assert.rejects(async () => service.geocode({ q: 'New unresolved address' }));
    assert.deepEqual(await service.geocode({ q: 'Saved home', savedProfileAddress: { label: 'Home', coordinates: { latitude: 52.52, longitude: 13.405 } } }), [
      { name: 'Home', coordinates: { latitude: 52.52, longitude: 13.405 } }
    ]);
    assert.equal(events.includes('service.stale_if_error'), true);
  });

  it('emits stale-if-error telemetry when DB station search fails', async () => {
    const stationEvents: string[] = [];
    const stationService = new StationSearchService(
      {
        async searchStations() {
          throw new Error('DB unavailable');
        },
        async calculateTransport() {
          throw new Error('unused');
        }
      },
      (event) => stationEvents.push(event.event)
    );

    await assert.rejects(async () => stationService.searchStations({ query: 'Berlin' }));
    assert.equal(stationEvents.includes('service.stale_if_error'), true);
  });

});
