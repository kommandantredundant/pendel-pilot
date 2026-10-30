import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJourneyUrl, HttpDbTransportClient, type DbTransportClient } from '../src/clients/dbTransport.client.ts';
import type { OsrmClient } from '../src/clients/osrm.client.ts';
import { validateCalculateJourneyRequest } from '../src/models/canonical.ts';
import { JourneyCalculationService } from '../src/services/journeyCalculation.service.ts';

const homeStation = { id: '8002549', name: 'Berlin Südkreuz', location: { latitude: 52.475, longitude: 13.365 } };
const workStation = { id: '8000105', name: 'Berlin Hbf', location: { latitude: 52.525, longitude: 13.369 } };

function journey(departure: string, arrival: string, lines: string[]) {
  return {
    legs: lines.map((name, index) => ({
      origin: index === 0 ? homeStation : workStation,
      destination: workStation,
      departure,
      arrival,
      line: { name }
    }))
  };
}

const baseRequest = {
  homeStationId: '8002549',
  workStationId: '8000105',
  homeAddress: { latitude: 52.5208, longitude: 13.4095 },
  workAddress: { latitude: 52.5321, longitude: 13.3849 },
  direction: 'work'
};

describe('journey options', () => {
  it('sends exactly one time anchor, the result count, and the long-distance filter to DB Transport', () => {
    const url = buildJourneyUrl(
      {
        direction: 'journeyWork',
        fromStationId: 'a',
        toStationId: 'b',
        departureTime: '2026-04-10T07:52:00+02:00',
        arrivalTime: '2026-04-10T08:11:00+02:00',
        excludeLongDistance: true
      },
      undefined,
      5
    );

    assert.equal(url.searchParams.get('results'), '5');
    assert.equal(url.searchParams.get('departure'), '2026-04-10T07:52:00+02:00');
    assert.equal(url.searchParams.has('arrival'), false);
    assert.equal(url.searchParams.get('nationalExpress'), 'false');
    assert.equal(url.searchParams.get('national'), 'false');
  });

  it('maps every DB journey into a connection with line name and transfers', async () => {
    const client = new HttpDbTransportClient({
      fetchImpl: async () =>
        Response.json({
          journeys: [
            journey('2026-04-10T07:52:00+02:00', '2026-04-10T08:11:00+02:00', ['S 2']),
            journey('2026-04-10T08:02:00+02:00', '2026-04-10T08:25:00+02:00', ['RE 3', 'S 5'])
          ]
        })
    });

    const options = await client.calculateTransportOptions(
      { direction: 'journeyWork', fromStationId: '8002549', toStationId: '8000105', departureTime: '2026-04-10T07:50:00+02:00' },
      5
    );

    assert.deepEqual(
      options.map((option) => [option.lineName, option.transfers]),
      [
        ['S 2', 0],
        ['RE 3', 1]
      ]
    );
  });

  it('accepts either departureTime or arrivalTime and rejects neither', () => {
    assert.equal(validateCalculateJourneyRequest({ ...baseRequest, arrivalTime: '2026-04-10T08:30:00+02:00' }).success, true);
    assert.equal(validateCalculateJourneyRequest({ ...baseRequest, departureTime: '2026-04-10T07:30:00+02:00' }).success, true);
    assert.equal(validateCalculateJourneyRequest(baseRequest).success, false);
    assert.equal(validateCalculateJourneyRequest({ ...baseRequest, departureTime: '2026-04-10T07:30:00+02:00', results: 9 }).success, false);
  });

  it('calculates a canonical journey per option and reuses first/last-mile routes', async () => {
    let routeRequests = 0;
    const station = (value: typeof homeStation) => ({ id: value.id, name: value.name, lat: value.location.latitude, lon: value.location.longitude });
    const dbTransportClient: DbTransportClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return null;
      },
      async calculateTransportOptions(_input, results) {
        return [
          { departureTime: '2026-04-10T07:52:00+02:00', arrivalTime: '2026-04-10T08:11:00+02:00', lineName: 'S 2', transfers: 0 },
          { departureTime: '2026-04-10T08:02:00+02:00', arrivalTime: '2026-04-10T08:21:00+02:00', lineName: 'S 25', transfers: 0 }
        ]
          .slice(0, results)
          .map((option) => ({ ...option, departureStation: station(homeStation), arrivalStation: station(workStation) }));
      }
    };
    const osrmClient: OsrmClient = {
      async getRouteDuration() {
        routeRequests += 1;
        return { durationSec: 600, distanceMeters: 800 };
      }
    };

    const result = await new JourneyCalculationService(dbTransportClient, osrmClient).calculate({
      ...baseRequest,
      departureTime: '2026-04-10T07:50:00+02:00',
      results: 2
    });

    assert.equal(result.options.length, 2);
    assert.deepEqual(result.options.map((option) => option.lineName), ['S 2', 'S 25']);
    assert.equal(result.calculatedJourneys.journeyWork, result.options[0].journey);
    assert.equal(result.options[1].journey.homeAddressWalkTime, '2026-04-10T05:52:00.000Z');
    assert.equal(routeRequests, 4);
  });
});
