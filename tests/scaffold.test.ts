import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildStationSearchUrl } from '../src/clients/dbTransport.client.ts';
import { buildRouteUrl } from '../src/clients/osrm.client.ts';
import { buildGeocodeUrl } from '../src/clients/photon.client.ts';
import { normalizeBuffers, validateCalculateJourneyRequest } from '../src/models/canonical.ts';
import { StationSearchService } from '../src/services/stationSearch.service.ts';
import { AddressGeocodeService } from '../src/services/addressGeocode.service.ts';
import { applyCanonicalJourneyTimes } from '../src/utils/time.ts';

describe('backend scaffold', () => {
  it('keeps provider URL builders importable without calling providers', () => {
    assert.match(buildStationSearchUrl('Berlin Hbf', 1).toString(), /\/stations\?query=Berlin\+Hbf&limit=1/);
    assert.match(buildGeocodeUrl('Alexanderplatz', 3).toString(), /\/api\?q=Alexanderplatz&limit=3/);
    assert.match(
      buildRouteUrl({ lat: 52.52, lon: 13.405 }, { lat: 52.5, lon: 13.4 }, 'foot').toString(),
      /\/route\/v1\/foot\/13\.405,52\.52;13\.4,52\.5\?overview=false/
    );
  });

  it('normalizes canonical buffer minute fields to second fields', () => {
    assert.deepEqual(
      {
        bufferInsideHomeStationMin: normalizeBuffers({ bufferInsideHomeStation: 5, bufferPrepareBike: 2 }).bufferInsideHomeStationMin,
        bufferPrepareBikeMin: normalizeBuffers({ bufferInsideHomeStation: 5, bufferPrepareBike: 2 }).bufferPrepareBikeMin,
        bufferInsideHomeStationSec: normalizeBuffers({ bufferInsideHomeStation: 5, bufferPrepareBike: 2 }).bufferInsideHomeStationSec,
        bufferPrepareBikeSec: normalizeBuffers({ bufferInsideHomeStation: 5, bufferPrepareBike: 2 }).bufferPrepareBikeSec
      },
      {
        bufferInsideHomeStationMin: 5,
        bufferPrepareBikeMin: 2,
        bufferInsideHomeStationSec: 300,
        bufferPrepareBikeSec: 120
      }
    );
  });

  it('validates canonical journey calculation request shape', () => {
    const result = validateCalculateJourneyRequest({
      homeStationId: '8000105',
      workStationId: '8002549',
      homeAddress: { latitude: 52.52, longitude: 13.405 },
      workAddress: { latitude: 48.14, longitude: 11.558 },
      direction: 'work',
      departureTime: '2026-04-08T08:00:00+02:00',
      arrivalTime: '2026-04-08T17:00:00+02:00'
    });

    assert.equal(result.success, true);
  });

  it('applies journeyWork names and timestamp formulas', () => {
    const journey = applyCanonicalJourneyTimes({
      direction: 'journeyWork',
      homeAddress: { lat: 52.5208, lon: 13.4095 },
      homeStation: { id: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
      workStation: { id: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
      workAddress: { lat: 52.5321, lon: 13.3849 },
      transportWork: {
        departureTime: '2026-04-10T05:52:00.000Z',
        arrivalTime: '2026-04-10T06:11:00.000Z'
      },
      homeStationTime: '2026-04-10T05:52:00.000Z',
      workStationTime: '2026-04-10T06:11:00.000Z',
      routeHomeWalkSec: 660,
      routeHomeBikeSec: 290,
      routeWorkWalkSec: 540,
      routeWorkBikeSec: 230,
      ...normalizeBuffers({
        bufferInsideHomeStation: 5,
        bufferInsideWorkStation: 3,
        bufferLeaveHome: 4,
        bufferLeaveWork: 6,
        bufferPrepareWalk: 1,
        bufferPrepareBike: 2
      })
    });

    assert.ok(journey.transportWork);
    assert.equal(journey.homeAddressWalkTime, '2026-04-10T05:31:00.000Z');
    assert.equal(journey.workAddressBikeTime, '2026-04-10T06:17:50.000Z');
  });

  it('service placeholders return empty arrays through injectable clients', async () => {
    assert.deepEqual(await new StationSearchService().searchStations({ query: 'Berlin' }), []);
    assert.deepEqual(await new AddressGeocodeService().geocode({ q: 'Berlin' }), []);
  });
});
