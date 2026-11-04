import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransitClient } from '../src/clients/transit.client.ts';
import { buildTransitousPlanUrl, HttpTransitousClient } from '../src/clients/transitous.client.ts';
import type { OsrmClient } from '../src/clients/osrm.client.ts';
import { validateCalculateJourneyRequest } from '../src/models/canonical.ts';
import { JourneyCalculationService, stationRoutePoint } from '../src/services/journeyCalculation.service.ts';

const homeStation = { id: '8002549', name: 'Berlin Südkreuz', location: { latitude: 52.475, longitude: 13.365 } };
const workStation = { id: '8000105', name: 'Berlin Hbf', location: { latitude: 52.525, longitude: 13.369 } };

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function itinerary(startTime: string, endTime: string, lines: string[], track?: { track: string; scheduledTrack: string }) {
  const stop = (value: typeof homeStation) => ({ stopId: value.id, name: value.name, lat: value.location.latitude, lon: value.location.longitude });
  return {
    transfers: lines.length - 1,
    legs: lines.map((displayName, index) => ({
      mode: 'REGIONAL_RAIL',
      // The second train runs two minutes late with real-time data.
      ...(index === 1 ? { realTime: true, scheduledStartTime: startTime, startTime: addMinutes(startTime, 2) } : {}),
      displayName: `${displayName} (${10_000 + index})`,
      from: { ...stop(index === 0 ? homeStation : workStation), ...(index === 0 ? track : { track: '8', scheduledTrack: '8' }) },
      to: stop(workStation),
      ...(index === 1 ? {} : { startTime }),
      endTime
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
  it('sends exactly one time anchor, the result count, and the long-distance filter to Transitous', () => {
    const input = { direction: 'journeyWork' as const, fromStationId: 'a', toStationId: 'b' };
    const departure = buildTransitousPlanUrl(
      { ...input, departureTime: '2026-04-10T07:52:00+02:00', arrivalTime: '2026-04-10T08:11:00+02:00', excludeLongDistance: true },
      undefined,
      5
    );
    const arrival = buildTransitousPlanUrl({ ...input, arrivalTime: '2026-04-10T08:11:00+02:00' });

    assert.equal(departure.searchParams.get('numItineraries'), '5');
    assert.equal(departure.searchParams.get('time'), '2026-04-10T07:52:00+02:00');
    assert.equal(departure.searchParams.has('arriveBy'), false);
    assert.doesNotMatch(departure.searchParams.get('transitModes') ?? '', /HIGHSPEED_RAIL|LONG_DISTANCE/);
    assert.equal(arrival.searchParams.get('time'), '2026-04-10T08:11:00+02:00');
    assert.equal(arrival.searchParams.get('arriveBy'), 'true');
    assert.equal(arrival.searchParams.has('transitModes'), false);
  });

  it('maps every Transitous itinerary into a connection with line name and transfers', async () => {
    const client = new HttpTransitousClient({
      fetchImpl: async () =>
        Response.json({
          itineraries: [
            itinerary('2026-04-10T05:52:00Z', '2026-04-10T06:11:00Z', ['S2'], { track: '3', scheduledTrack: '3' }),
            itinerary('2026-04-10T06:02:00Z', '2026-04-10T06:25:00Z', ['RE3', 'S5'], { track: '7', scheduledTrack: '5' })
          ]
        })
    });

    const options = await client.calculateTransportOptions(
      { direction: 'journeyWork', fromStationId: '8002549', toStationId: '8000105', departureTime: '2026-04-10T07:50:00+02:00' },
      5
    );

    assert.deepEqual(
      options.map((option) => [
        option.lineName,
        option.transfers,
        option.departureStation.name,
        option.departurePlatform,
        option.plannedDeparturePlatform
      ]),
      [
        ['S2', 0, 'Berlin Südkreuz', '3', '3'],
        ['RE3', 1, 'Berlin Südkreuz', '7', '5']
      ]
    );
    assert.deepEqual(options[1].legs, [
      {
        lineName: 'RE3',
        departureTime: '2026-04-10T06:02:00Z',
        departurePlatform: '7',
        plannedDeparturePlatform: '5',
        arrivalTime: '2026-04-10T06:25:00Z',
        departureStopName: 'Berlin Südkreuz',
        arrivalStopName: 'Berlin Hbf'
      },
      {
        lineName: 'S5',
        departureTime: '2026-04-10T06:04:00.000Z',
        plannedDepartureTime: '2026-04-10T06:02:00Z',
        departureDelaySec: 120,
        departurePlatform: '8',
        plannedDeparturePlatform: '8',
        arrivalTime: '2026-04-10T06:25:00Z',
        departureStopName: 'Berlin Hbf',
        arrivalStopName: 'Berlin Hbf'
      }
    ]);
  });

  it('accepts either departureTime or arrivalTime and rejects neither', () => {
    assert.equal(validateCalculateJourneyRequest({ ...baseRequest, arrivalTime: '2026-04-10T08:30:00+02:00' }).success, true);
    assert.equal(validateCalculateJourneyRequest({ ...baseRequest, departureTime: '2026-04-10T07:30:00+02:00' }).success, true);
    assert.equal(validateCalculateJourneyRequest(baseRequest).success, false);
    assert.equal(validateCalculateJourneyRequest({ ...baseRequest, departureTime: '2026-04-10T07:30:00+02:00', results: 13 }).success, false);
    assert.equal(
      validateCalculateJourneyRequest({ ...baseRequest, departureTime: '2026-04-10T07:30:00+02:00', workStationLocation: { latitude: 99, longitude: 0 } }).success,
      false
    );
  });

  it('calculates a canonical journey per option and reuses first/last-mile routes', async () => {
    let routeRequests = 0;
    const station = (value: typeof homeStation) => ({ id: value.id, name: value.name, lat: value.location.latitude, lon: value.location.longitude });
    const transitClient: TransitClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return null;
      },
      async calculateTransportOptions(_input, results) {
        return [
          { departureTime: '2026-04-10T07:52:00+02:00', arrivalTime: '2026-04-10T08:11:00+02:00', lineName: 'S 2', transfers: 0, departurePlatform: '4' },
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

    const result = await new JourneyCalculationService(transitClient, osrmClient).calculate({
      ...baseRequest,
      departureTime: '2026-04-10T07:50:00+02:00',
      results: 2
    });

    assert.equal(result.options.length, 2);
    assert.deepEqual(result.options.map((option) => option.lineName), ['S 2', 'S 25']);
    assert.deepEqual(result.options.map((option) => option.departurePlatform), ['4', undefined]);
    assert.equal(result.calculatedJourneys.journeyWork, result.options[0].journey);
    assert.equal(result.options[1].journey.homeAddressWalkTime, '2026-04-10T05:52:00.000Z');
    assert.equal(routeRequests, 4);
  });

  it('routes first/last mile from the chosen station point while a connection uses that station', async () => {
    const chosen = { lat: 52.5251, lon: 13.3694 };
    // Platforms of the same station a few dozen metres apart collapse onto the chosen point.
    assert.deepEqual(stationRoutePoint({ lat: 52.5249, lon: 13.3699 }, chosen), chosen);
    // A stop far away (e.g. a bus terminal) keeps its own coordinates.
    assert.deepEqual(stationRoutePoint({ lat: 52.507, lon: 13.332 }, chosen), { lat: 52.507, lon: 13.332 });
    assert.deepEqual(stationRoutePoint({ lat: 52.5249, lon: 13.3699 }, undefined), { lat: 52.5249, lon: 13.3699 });

    const routedFrom: string[] = [];
    const platform = (track: number) => ({ id: `8000105:${track}`, name: 'Berlin Hbf', lat: 52.5249 + track * 0.0001, lon: 13.3699 });
    const transitClient: TransitClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return null;
      },
      async calculateTransportOptions() {
        return [1, 2].map((track) => ({
          departureTime: '2026-04-10T07:52:00+02:00',
          arrivalTime: '2026-04-10T08:11:00+02:00',
          departureStation: { id: homeStation.id, name: homeStation.name, lat: homeStation.location.latitude, lon: homeStation.location.longitude },
          arrivalStation: platform(track)
        }));
      }
    };
    const osrmClient: OsrmClient = {
      async getRouteDuration(from, _to, profile) {
        if (profile === 'foot') routedFrom.push(`${from.lat},${from.lon}`);
        return { durationSec: 600 };
      }
    };

    const result = await new JourneyCalculationService(transitClient, osrmClient).calculate({
      ...baseRequest,
      departureTime: '2026-04-10T07:50:00+02:00',
      results: 2,
      workStationLocation: { latitude: chosen.lat, longitude: chosen.lon }
    });

    assert.equal(result.options.length, 2);
    assert.ok(routedFrom.includes(`${chosen.lat},${chosen.lon}`));
    assert.equal(routedFrom.some((point) => point.startsWith('52.525,') || point.startsWith('52.5251,13.3699')), false);
  });
});
