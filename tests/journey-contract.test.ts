import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { onRequestPost } from '../functions/api/journeys/calculate.ts';
import { JourneyCalculationService, JourneyTransportUnavailableError, estimateRouteDurationSec } from '../src/services/journeyCalculation.service.ts';
import { ITINERARY_TELEMETRY_VERSION } from '../src/telemetry/itineraryTelemetry.ts';
import type { ApiError, ApiSuccess } from '../src/utils/http.ts';
import type { TransitClient } from '../src/clients/transit.client.ts';
import type { OsrmClient, OsrmProfile } from '../src/clients/osrm.client.ts';
import {
  CANONICAL_ADDRESS_TIME_FIELDS,
  CANONICAL_BUFFER_MIN_FIELDS,
  CANONICAL_BUFFER_SEC_FIELDS,
  CANONICAL_ROUTE_DURATION_FIELDS,
  CANONICAL_STATION_ANCHOR_FIELDS,
  calculateJourneyHome,
  calculateJourneyWork,
  normalizeBuffers,
  validateCalculateJourneyRequest,
  validateCanonicalJourney,
  validateCanonicalJourneySeed,
  type CanonicalJourney,
  type CanonicalJourneySeed
} from '../src/models/canonicalJourney.ts';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(testDir, 'fixtures', 'journeys');

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as T;
}

function assertApiTelemetryTypes(): void {
  const successBody: ApiSuccess<{ ok: true }> = {
    success: true,
    data: { ok: true },
    telemetryEvents: ['itinerary.calculate.success']
  };
  const errorBody: ApiError = {
    success: false,
    telemetryEvents: ['itinerary.calculate.failure'],
    error: { code: 'VALIDATION_ERROR', message: 'invalid payload' }
  };

  assert.equal(successBody.telemetryEvents?.includes('itinerary.calculate.success'), true);
  assert.equal(errorBody.telemetryEvents?.includes('itinerary.calculate.failure'), true);
}

function workSeed(overrides: Partial<CanonicalJourneySeed> = {}): CanonicalJourneySeed {
  return {
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
    }),
    ...overrides
  };
}


function assertCalculateResponseFixture(name: string): void {
  const response = fixture<{
    success: boolean;
    data: { direction: 'work' | 'home'; calculatedJourneys: { journeyWork: CanonicalJourney | null; journeyHome: CanonicalJourney | null } };
  }>(name);

  assert.equal(response.success, true);
  if (response.data.direction === 'work') {
    const journeyWork = response.data.calculatedJourneys.journeyWork;
    if (!journeyWork) {
      throw new Error('Expected journeyWork fixture payload.');
    }
    assert.equal(validateCanonicalJourney(journeyWork).success, true);
    assert.equal(response.data.calculatedJourneys.journeyHome, null);
    assert.deepEqual(journeyWork, calculateJourneyWork(journeyWork));
  } else {
    const journeyHome = response.data.calculatedJourneys.journeyHome;
    assert.equal(response.data.calculatedJourneys.journeyWork, null);
    if (!journeyHome) {
      throw new Error('Expected journeyHome fixture payload.');
    }
    assert.equal(validateCanonicalJourney(journeyHome).success, true);
    assert.deepEqual(journeyHome, calculateJourneyHome(journeyHome));
  }
}

function homeSeed(overrides: Partial<CanonicalJourneySeed> = {}): CanonicalJourneySeed {
  return {
    ...workSeed(),
    direction: 'journeyHome',
    transportWork: undefined,
    transportHome: {
      departureTime: '2026-04-10T15:31:00.000Z',
      arrivalTime: '2026-04-10T15:50:00.000Z'
    },
    workStationTime: '2026-04-10T15:31:00.000Z',
    homeStationTime: '2026-04-10T15:50:00.000Z',
    ...overrides
  };
}

describe('POST /api/journeys/calculate contract fixtures', () => {
  it('accepts telemetryEvents on both API success and error response shapes', () => {
    assertApiTelemetryTypes();
  });

  it('AC1 exposes paired direction-specific request and response fixtures', () => {
    const workRequest = fixture<Record<string, unknown>>('calculate.work.request.json');
    const homeRequest = fixture<Record<string, unknown>>('calculate.home.request.json');
    const workResponse = fixture<{ data: { calculatedJourneys: { journeyWork: CanonicalJourney | null; journeyHome: CanonicalJourney | null } } }>(
      'calculate.work.response.json'
    );
    const homeResponse = fixture<{ data: { calculatedJourneys: { journeyWork: CanonicalJourney | null; journeyHome: CanonicalJourney | null } } }>(
      'calculate.home.response.json'
    );

    assert.equal(validateCalculateJourneyRequest(workRequest).success, true);
    assert.equal(validateCalculateJourneyRequest(homeRequest).success, true);
    assertCalculateResponseFixture('calculate.work.response.json');
    assertCalculateResponseFixture('calculate.home.response.json');
    assert.equal(workRequest.direction, 'work');
    assert.equal(homeRequest.direction, 'home');
    assert.equal(workResponse.data.calculatedJourneys.journeyWork?.direction, 'journeyWork');
    assert.equal(workResponse.data.calculatedJourneys.journeyHome, null);
    assert.equal(homeResponse.data.calculatedJourneys.journeyWork, null);
    assert.equal(homeResponse.data.calculatedJourneys.journeyHome?.direction, 'journeyHome');
  });

  it('AC1/AC4/AC7 exposes standalone canonical journey response fixtures', () => {
    const workJourney = fixture<CanonicalJourney>('journeyWork.response.json');
    const homeJourney = fixture<CanonicalJourney>('journeyHome.response.json');

    assert.equal(validateCanonicalJourney(workJourney).success, true);
    assert.equal(validateCanonicalJourney(homeJourney).success, true);
    assert.deepEqual(workJourney, calculateJourneyWork(workJourney));
    assert.deepEqual(homeJourney, calculateJourneyHome(homeJourney));
    assert.equal(workJourney.direction, 'journeyWork');
    assert.equal(homeJourney.direction, 'journeyHome');

    for (const journey of [workJourney, homeJourney]) {
      for (const field of [
        ...CANONICAL_STATION_ANCHOR_FIELDS,
        ...CANONICAL_ROUTE_DURATION_FIELDS,
        ...CANONICAL_BUFFER_MIN_FIELDS,
        ...CANONICAL_BUFFER_SEC_FIELDS,
        ...CANONICAL_ADDRESS_TIME_FIELDS
      ]) {
        assert.equal(Object.hasOwn(journey, field), true, `Expected ${field} in ${journey.direction} fixture.`);
      }
    }
  });

  it('AC11 provides a delayed segment y fixture with delay-adjusted station anchors', () => {
    const onTimeJourney = fixture<CanonicalJourney>('journeyWork.response.json');
    const delayedJourney = fixture<CanonicalJourney>('journeyWork.delayed-y.response.json');
    const delayedTransport = delayedJourney.transportWork;

    assert.equal(validateCanonicalJourney(delayedJourney).success, true);
    if (!delayedTransport) {
      throw new Error('Expected delayed journeyWork fixture to include transportWork.');
    }
    assert.equal(delayedTransport.delayStatus, 'delayed');
    assert.equal(delayedTransport.departureDelaySec, 300);
    assert.equal(delayedTransport.arrivalDelaySec, 300);
    assert.equal(delayedTransport.plannedDepartureTime, onTimeJourney.homeStationTime);
    assert.equal(delayedTransport.plannedArrivalTime, onTimeJourney.workStationTime);
    assert.equal(delayedJourney.homeStationTime, delayedTransport.departureTime);
    assert.equal(delayedJourney.workStationTime, delayedTransport.arrivalTime);
    assert.equal(Date.parse(delayedJourney.homeAddressWalkTime) - Date.parse(onTimeJourney.homeAddressWalkTime), 300_000);
    assert.equal(Date.parse(delayedJourney.homeAddressBikeTime) - Date.parse(onTimeJourney.homeAddressBikeTime), 300_000);
  });

  it('uses provider timing and route durations when calculating the selected canonical journey', async () => {
    const transitClient: TransitClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return {
          departureStation: { id: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
          arrivalStation: { id: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
          departureTime: '2026-04-10T07:55:00+02:00',
          arrivalTime: '2026-04-10T08:15:00+02:00',
          plannedDepartureTime: '2026-04-10T07:52:00+02:00',
          plannedArrivalTime: '2026-04-10T08:11:00+02:00',
          departureDelaySec: 180,
          arrivalDelaySec: 240,
          delayStatus: 'delayed'
        };
      }
    };
    const durations: Record<OsrmProfile, number[]> = {
      foot: [600, 480],
      bike: [240, 180]
    };
    const osrmClient: OsrmClient = {
      async getRouteDuration(_from, _to, profile) {
        const durationSec = durations[profile].shift();
        if (durationSec === undefined) {
          throw new Error(`Unexpected ${profile} route duration lookup.`);
        }
        return { durationSec };
      }
    };

    const result = await new JourneyCalculationService(transitClient, osrmClient).calculate(
      fixture<Record<string, unknown>>('calculate.work.request.json')
    );
    const journeyWork = result.calculatedJourneys.journeyWork;

    if (!journeyWork) {
      throw new Error('Expected provider-backed journeyWork calculation.');
    }
    assert.equal(result.calculatedJourneys.journeyHome, null);
    assert.equal(journeyWork.homeStationTime, '2026-04-10T05:55:00.000Z');
    assert.equal(journeyWork.workStationTime, '2026-04-10T06:15:00.000Z');
    assert.equal(journeyWork.transportWork?.plannedDepartureTime, '2026-04-10T05:52:00.000Z');
    assert.equal(journeyWork.transportWork?.plannedArrivalTime, '2026-04-10T06:11:00.000Z');
    assert.equal(journeyWork.transportWork?.departureDelaySec, 180);
    assert.equal(journeyWork.transportWork?.arrivalDelaySec, 240);
    assert.equal(journeyWork.transportWork?.delayStatus, 'delayed');
    assert.equal(journeyWork.routeHomeWalkSec, 600);
    assert.equal(journeyWork.routeHomeBikeSec, 240);
    assert.equal(journeyWork.routeWorkWalkSec, 480);
    assert.equal(journeyWork.routeWorkBikeSec, 180);
    assert.equal(journeyWork.homeAddressWalkTime, '2026-04-10T05:35:00.000Z');
    assert.equal(journeyWork.workAddressBikeTime, '2026-04-10T06:21:00.000Z');
  });

  it('wires canonical calculation into the API response path', async () => {
    const requestBody = fixture<Record<string, unknown>>('calculate.work.request.json');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: URL | RequestInfo) => {
      const url = new URL(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url);
      if (url.pathname === '/api/v5/plan') {
        return Response.json({
          itineraries: [
            {
              transfers: 0,
              legs: [
                {
                  mode: 'SUBURBAN',
                  from: { stopId: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
                  to: { stopId: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
                  startTime: '2026-04-10T07:52:00+02:00',
                  endTime: '2026-04-10T08:11:00+02:00'
                }
              ]
            }
          ]
        });
      }
      return Response.json({ routes: [{ duration: 0, distance: 0 }] });
    };

    const response = await onRequestPost({
      request: new Request('https://dailyjourney.test/api/journeys/calculate', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })
    } as Parameters<typeof onRequestPost>[0]);
    globalThis.fetch = originalFetch;
    const payload = (await response.json()) as {
      success: boolean;
      telemetryEvents: string[];
      telemetryPayload: { direction: string; latencyBucket: string; timestamp: string; version: string };
      data: { calculatedJourneys: { journeyWork: CanonicalJourney | null; journeyHome: CanonicalJourney | null } };
    };

    const journeyWork = payload.data.calculatedJourneys.journeyWork;
    assert.equal(payload.success, true);
    assert.ok(payload.telemetryEvents.includes('itinerary.calculate.success'));
    assert.equal(payload.telemetryPayload.direction, 'journeyWork');
    assert.equal(payload.telemetryPayload.version, ITINERARY_TELEMETRY_VERSION);
    assert.ok(['lt_250ms', '250ms_1s', '1s_3s', '3s_plus'].includes(payload.telemetryPayload.latencyBucket));
    if (!journeyWork) {
      throw new Error('Expected journeyWork from API calculation path.');
    }
    assert.equal(payload.data.calculatedJourneys.journeyHome, null);
    assert.equal(validateCanonicalJourney(journeyWork).success, true);
    assert.equal(journeyWork.direction, 'journeyWork');
    assert.equal(journeyWork.homeStationTime, '2026-04-10T05:52:00.000Z');
    assert.equal(journeyWork.workStationTime, '2026-04-10T06:11:00.000Z');
  });


  it('rejects upstream payloads with missing canonical required fields', async () => {
    const requestBody = fixture<Record<string, unknown>>('calculate.work.request.json');
    const malformed = fixture<{
      direction: 'work' | 'home';
      calculatedJourneys: { journeyWork: CanonicalJourney | null; journeyHome: CanonicalJourney | null };
    }>('calculate.work.missing-canonical-keys.response.json');

    const originalCalculate = JourneyCalculationService.prototype.calculate;
    JourneyCalculationService.prototype.calculate = async function mockedCalculate() {
      return malformed as unknown as Awaited<ReturnType<JourneyCalculationService['calculate']>>;
    };

    const response = await onRequestPost({
      request: new Request('https://dailyjourney.test/api/journeys/calculate', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })
    } as Parameters<typeof onRequestPost>[0]);

    JourneyCalculationService.prototype.calculate = originalCalculate;

    const payload = (await response.json()) as {
      success: boolean;
      telemetryEvents?: string[];
      telemetryPayload?: { errorCode?: string };
      error?: { code: string; message: string; details?: { requiredFields?: string[]; errors?: Array<{ field: string }> } };
    };

    assert.equal(response.status, 502);
    assert.equal(payload.success, false);
    assert.equal(payload.error?.code, 'UPSTREAM_BAD_RESPONSE');
    assert.equal(payload.telemetryPayload?.errorCode, 'UPSTREAM_BAD_RESPONSE');
    assert.equal(payload.error?.message, 'Canonical journey payload is missing required fields.');
    assert.equal(payload.error?.details?.requiredFields?.includes('homeAddressWalkTime'), true);
    assert.equal(payload.error?.details?.errors?.some((error) => error.field === 'homeAddressWalkTime'), true);
    assert.ok(payload.telemetryEvents?.includes('itinerary.calculate.failure'));
  });

  it('fails closed when DB transport cannot provide segment y station anchors', async () => {
    const transitClient: TransitClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return { departureTime: '2026-04-10T07:52:00+02:00', arrivalTime: '2026-04-10T08:11:00+02:00' };
      }
    };

    try {
      await new JourneyCalculationService(transitClient).calculate(fixture<Record<string, unknown>>('calculate.work.request.json'));
      throw new Error('Expected missing DB station anchors to fail closed.');
    } catch (error) {
      assert.ok(error instanceof JourneyTransportUnavailableError);
    }
  });

  it('falls back to bounded heuristic route durations when OSRM has no usable route duration', async () => {
    const transitClient: TransitClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return {
          departureStation: { id: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
          arrivalStation: { id: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
          departureTime: '2026-04-10T07:52:00+02:00',
          arrivalTime: '2026-04-10T08:11:00+02:00'
        };
      }
    };
    const osrmClient: OsrmClient = {
      async getRouteDuration() {
        throw new Error('OSRM unavailable');
      }
    };

    const result = await new JourneyCalculationService(transitClient, osrmClient).calculate(fixture<Record<string, unknown>>('calculate.work.request.json'));
    const journeyWork = result.calculatedJourneys.journeyWork;

    if (!journeyWork) {
      throw new Error('Expected journeyWork fallback calculation.');
    }
    assert.equal(journeyWork.routeHomeWalkSec, estimateRouteDurationSec(journeyWork.homeAddress, journeyWork.homeStation, 'foot'));
    assert.ok(journeyWork.routeHomeWalkSec >= 60);
    assert.ok(journeyWork.routeHomeWalkSec <= 10_800);
  });

  it('emits service-level fallback telemetry for OSRM and DB station search failures', async () => {
    const events: string[] = [];
    const service = new JourneyCalculationService(
      {
        async searchStations() {
          return [];
        },
        async calculateTransport() {
          return {
            departureStation: { id: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
            arrivalStation: { id: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
            departureTime: '2026-04-10T07:52:00+02:00',
            arrivalTime: '2026-04-10T08:11:00+02:00'
          };
        }
      },
      { async getRouteDuration() { throw new Error('down'); } },
      (event) => events.push(event.event)
    );
    await service.calculate(fixture<Record<string, unknown>>('calculate.work.request.json'));

    assert.equal(events.includes('service.fallback_used'), true);
  });

  it('emits delay propagation anomaly telemetry when segment y delay metadata disagrees with anchors', async () => {
    const delaySignals: string[] = [];
    const anomalousDbClient: TransitClient = {
      async searchStations() {
        return [];
      },
      async calculateTransport() {
        return {
          departureStation: { id: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
          arrivalStation: { id: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
          plannedDepartureTime: '2026-04-10T07:52:00+02:00',
          departureDelaySec: 300,
          departureTime: '2026-04-10T07:59:30+02:00',
          plannedArrivalTime: '2026-04-10T08:11:00+02:00',
          arrivalDelaySec: 300,
          arrivalTime: '2026-04-10T08:16:00+02:00'
        };
      }
    };

    await new JourneyCalculationService(anomalousDbClient, undefined, (event) => delaySignals.push(event.event)).calculate(
      fixture<Record<string, unknown>>('calculate.work.request.json')
    );

    assert.equal(delaySignals.includes('journey.delay_propagation_anomaly.signal'), true);
  });


  it('emits itinerary.calculate.failure telemetry when request validation fails', async () => {
    const response = await onRequestPost({
      request: new Request('https://dailyjourney.test/api/journeys/calculate', {
        method: 'POST',
        body: JSON.stringify({ direction: 'work' })
      })
    } as Parameters<typeof onRequestPost>[0]);
    const payload = (await response.json()) as {
      success: boolean;
      telemetryEvents?: string[];
      telemetryPayload?: { direction: string; latencyBucket: string; errorCode?: string; timestamp: string; version: string };
      error: { code: string; message: string };
    };

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.ok(payload.telemetryEvents?.includes('itinerary.calculate.failure'));
    assert.equal(payload.error.code, 'VALIDATION_ERROR');
    assert.equal(payload.telemetryPayload?.errorCode, 'VALIDATION_ERROR');
    assert.equal(payload.telemetryPayload?.version, ITINERARY_TELEMETRY_VERSION);
  });

  it('rejects incomplete canonical payloads with a deterministic upstream error response', async () => {
    const malformed = fixture<{ direction: 'work' | 'home'; calculatedJourneys: { journeyWork: CanonicalJourney; journeyHome: null } }>(
      'calculate.work.missing-canonical-keys.response.json'
    );
    const originalCalculate = JourneyCalculationService.prototype.calculate;
    JourneyCalculationService.prototype.calculate = async () => malformed as unknown as Awaited<ReturnType<JourneyCalculationService['calculate']>>;

    const response = await onRequestPost({
      request: new Request('https://dailyjourney.test/api/journeys/calculate', {
        method: 'POST',
        body: JSON.stringify(fixture<Record<string, unknown>>('calculate.work.request.json'))
      })
    } as Parameters<typeof onRequestPost>[0]);
    JourneyCalculationService.prototype.calculate = originalCalculate;

    const payload = (await response.json()) as {
      success: boolean;
      telemetryEvents?: string[];
      telemetryPayload?: { errorCode?: string; version: string };
      error: { code: string; message: string; details?: { requiredFields?: string[]; errors?: Array<{ field: string; message: string }> } };
    };

    assert.equal(response.status, 502);
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'UPSTREAM_BAD_RESPONSE');
    assert.equal(payload.telemetryPayload?.errorCode, 'UPSTREAM_BAD_RESPONSE');
    assert.ok(payload.telemetryEvents?.includes('itinerary.calculate.failure'));
    assert.ok(payload.error.details?.errors?.some((detail) => detail.field === 'homeAddressWalkTime'));
  });

  it('AC3 labels transport segment y as transportWork or transportHome only', () => {
    const workJourney = fixture<{ data: { calculatedJourneys: { journeyWork: CanonicalJourney } } }>(
      'calculate.work.response.json'
    ).data.calculatedJourneys.journeyWork;
    const homeJourney = fixture<{ data: { calculatedJourneys: { journeyHome: CanonicalJourney } } }>(
      'calculate.home.response.json'
    ).data.calculatedJourneys.journeyHome;

    assert.ok(workJourney.transportWork);
    assert.equal('transportHome' in workJourney, false);
    assert.ok(homeJourney.transportHome);
    assert.equal('transportWork' in homeJourney, false);
  });

  it('AC4 keeps homeStationTime and workStationTime immutable station anchors', () => {
    const workJourney = fixture<{ data: { calculatedJourneys: { journeyWork: CanonicalJourney } } }>(
      'calculate.work.response.json'
    ).data.calculatedJourneys.journeyWork;
    const homeJourney = fixture<{ data: { calculatedJourneys: { journeyHome: CanonicalJourney } } }>(
      'calculate.home.response.json'
    ).data.calculatedJourneys.journeyHome;

    assert.equal(validateCanonicalJourney(workJourney).success, true);
    assert.equal(validateCanonicalJourney(homeJourney).success, true);
    assert.equal(workJourney.homeStationTime, workJourney.transportWork?.departureTime);
    assert.equal(workJourney.workStationTime, workJourney.transportWork?.arrivalTime);
    assert.equal(homeJourney.workStationTime, homeJourney.transportHome?.departureTime);
    assert.equal(homeJourney.homeStationTime, homeJourney.transportHome?.arrivalTime);
  });
});

describe('canonical journey calculation core', () => {
  it('implements exact journeyWork formulas from the architecture contract', () => {
    assert.deepEqual(calculateJourneyWork(workSeed()), {
      ...workSeed(),
      direction: 'journeyWork',
      homeAddressWalkTime: '2026-04-10T05:31:00.000Z',
      homeAddressBikeTime: '2026-04-10T05:36:10.000Z',
      workAddressWalkTime: '2026-04-10T06:23:00.000Z',
      workAddressBikeTime: '2026-04-10T06:17:50.000Z'
    });
  });

  it('implements exact journeyHome formulas from the architecture contract', () => {
    assert.deepEqual(calculateJourneyHome(homeSeed()), {
      ...homeSeed(),
      direction: 'journeyHome',
      homeAddressWalkTime: '2026-04-10T16:06:00.000Z',
      homeAddressBikeTime: '2026-04-10T15:59:50.000Z',
      workAddressWalkTime: '2026-04-10T15:12:00.000Z',
      workAddressBikeTime: '2026-04-10T15:16:10.000Z'
    });
  });

  it('AC6 deterministically reflects buffer-minute changes in computed timestamps', () => {
    const baseline = calculateJourneyWork(workSeed());
    const withExtraLeaveHomeMinute = calculateJourneyWork(
      workSeed({
        ...normalizeBuffers({
          bufferInsideHomeStation: 5,
          bufferInsideWorkStation: 3,
          bufferLeaveHome: 5,
          bufferLeaveWork: 6,
          bufferPrepareWalk: 1,
          bufferPrepareBike: 2
        })
      })
    );

    assert.equal(Date.parse(baseline.homeAddressWalkTime) - Date.parse(withExtraLeaveHomeMinute.homeAddressWalkTime), 60_000);
    assert.equal(Date.parse(baseline.homeAddressBikeTime) - Date.parse(withExtraLeaveHomeMinute.homeAddressBikeTime), 60_000);
    assert.equal(baseline.workAddressWalkTime, withExtraLeaveHomeMinute.workAddressWalkTime);
  });

  it('AC8 preserves opposite-direction timing behavior with the same canonical field names', () => {
    const workJourney = calculateJourneyWork(workSeed());
    const homeJourney = calculateJourneyHome(homeSeed());

    assert.ok(Date.parse(workJourney.homeAddressWalkTime) < Date.parse(workJourney.homeStationTime));
    assert.ok(Date.parse(workJourney.workAddressWalkTime) > Date.parse(workJourney.workStationTime));
    assert.ok(Date.parse(homeJourney.homeAddressWalkTime) > Date.parse(homeJourney.homeStationTime));
    assert.ok(Date.parse(homeJourney.workAddressWalkTime) < Date.parse(homeJourney.workStationTime));
    assert.deepEqual(
      ['homeAddressWalkTime', 'homeAddressBikeTime', 'workAddressWalkTime', 'workAddressBikeTime'].sort(),
      Object.keys(homeJourney).filter((key) => key.endsWith('Time') && key.includes('Address')).sort()
    );
  });
});

describe('canonical journey validation', () => {
  it('validates required canonical fields, buffer inputs, derived seconds, anchors, stations, and route durations', () => {
    assert.equal(validateCanonicalJourneySeed(workSeed()).success, true);

    const invalid = validateCanonicalJourneySeed({
      ...workSeed({ routeHomeWalkSec: 1.5 }),
      bufferPrepareBikeMin: -2,
      bufferPrepareBikeSec: 121,
      workStationTime: '2026-04-10T06:12:00.000Z',
      homeStation: { id: '', lat: 52.475, lon: 13.365 }
    });

    assert.equal(invalid.success, false);
    assert.deepEqual(
      invalid.errors?.map((error) => error.field).sort(),
      ['bufferPrepareBikeMin', 'bufferPrepareBikeSec', 'homeStation.id', 'routeHomeWalkSec', 'workStationTime']
    );
  });

  it('AC9 rejects non-canonical synonym keys in outbound canonical payloads', () => {
    const invalid = validateCanonicalJourneySeed({
      ...workSeed(),
      HomeStationTime: workSeed().homeStationTime,
      RouteHomeWalk: workSeed().routeHomeWalkSec
    });

    assert.equal(invalid.success, false);
    assert.deepEqual(
      invalid.errors?.map((error) => error.field).sort(),
      ['HomeStationTime', 'RouteHomeWalk']
    );
  });
});
