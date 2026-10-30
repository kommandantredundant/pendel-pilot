import { HttpDbTransportClient } from '../../../src/clients/dbTransport.client.ts';
import { HttpOsrmClient } from '../../../src/clients/osrm.client.ts';
import { PROVIDER_POLICIES } from '../../../src/clients/providerCompliance.ts';
import { explainRequiredPersistedJourneyFields, validatePersistedJourney } from '../../../src/models/localPersistence.ts';
import {
  ITINERARY_CACHE_PERSISTENCE_EVENTS,
  JourneyCalculationService,
  JourneyTransportUnavailableError,
  JourneyValidationError,
  type JourneyTelemetryEvent
} from '../../../src/services/journeyCalculation.service.ts';
import { createItineraryTelemetryPayload } from '../../../src/telemetry/itineraryTelemetry.ts';
import { json, validationError } from '../../../src/utils/http.ts';

export const onRequestPost: PagesFunction = async ({ request }) => {
  const startedAtMs = Date.now();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return validationError('Request body must be valid JSON.');
  }

  try {
    const serviceTelemetry: JourneyTelemetryEvent[] = [];
    const data = await new JourneyCalculationService(new HttpDbTransportClient(), new HttpOsrmClient(), (event) =>
      serviceTelemetry.push(event)
    ).calculate(body);
    const payload = createItineraryTelemetryPayload({
      direction: data.direction === 'work' ? 'journeyWork' : 'journeyHome',
      latencyMs: Date.now() - startedAtMs
    });
    const canonicalJourney = data.direction === 'work' ? data.calculatedJourneys.journeyWork : data.calculatedJourneys.journeyHome;
    if (!canonicalJourney) {
      return upstreamBadResponseError(startedAtMs, 'Canonical journey payload is missing for selected direction.');
    }

    const canonicalValidation = validatePersistedJourney(canonicalJourney);
    if (!canonicalValidation.success) {
      return upstreamBadResponseError(
        startedAtMs,
        'Canonical journey payload is missing required fields.',
        { requiredFields: explainRequiredPersistedJourneyFields(), errors: canonicalValidation.errors }
      );
    }

    return json({
      success: true,
      telemetryEvents: ['itinerary.calculate.success', ...serviceTelemetry.map((event) => event.event).filter((event) => ITINERARY_CACHE_PERSISTENCE_EVENTS.has(event))],
      telemetryPayload: payload,
      data,
      attribution: {
        dbTransport: PROVIDER_POLICIES.dbTransport.attribution,
        osrm: PROVIDER_POLICIES.osrm.attribution
      }
    });
  } catch (error) {
    if (error instanceof JourneyValidationError) {
      return json(
        {
          success: false,
          telemetryEvents: ['itinerary.calculate.failure'],
          telemetryPayload: createItineraryTelemetryPayload({
            direction: 'journeyWork',
            latencyMs: Date.now() - startedAtMs,
            errorCode: 'VALIDATION_ERROR'
          }),
          error: { code: 'VALIDATION_ERROR', message: error.message, details: error.details }
        },
        { status: 400 }
      );
    }
    if (error instanceof JourneyTransportUnavailableError) {
      return json(
        {
          success: false,
          telemetryEvents: ['itinerary.calculate.failure'],
          telemetryPayload: createItineraryTelemetryPayload({
            direction: 'journeyWork',
            latencyMs: Date.now() - startedAtMs,
            errorCode: error.code
          }),
          error: { code: error.code, message: error.message }
        },
        { status: 503 }
      );
    }
    throw error;
  }
};

function upstreamBadResponseError(startedAtMs: number, message: string, details?: unknown): Response {
  return json(
    {
      success: false,
      telemetryEvents: ['itinerary.calculate.failure'],
      telemetryPayload: createItineraryTelemetryPayload({
        direction: 'journeyWork',
        latencyMs: Date.now() - startedAtMs,
        errorCode: 'UPSTREAM_BAD_RESPONSE'
      }),
      error: { code: 'UPSTREAM_BAD_RESPONSE', message, details }
    },
    { status: 502 }
  );
}
