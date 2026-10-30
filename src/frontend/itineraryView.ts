import { PROVIDER_POLICIES } from '../clients/providerCompliance.ts';
import {
  type CanonicalDirection,
  type CanonicalJourney,
  type TransportTiming,
  validateCanonicalJourney
} from '../models/canonical.ts';
import { createItineraryTelemetryPayload, type ItineraryTelemetryPayload } from '../telemetry/itineraryTelemetry.ts';

export {
  BUFFER_SETTINGS_FIELD_NAMES,
  editBufferSettingsValue,
  readCommuteSettings,
  renderSettingsPage,
  writeCommuteSettings
} from './settingsView.ts';
export type {
  BufferSettingsFieldName,
  CommuteSettingsPersistenceStore,
  CommuteSettingsRecord,
  RenderedSettingsAddress,
  RenderedSettingsBufferField,
  RenderedSettingsPage,
  RenderedSettingsStation,
  SettingsRenderInput,
  SettingsUiState
} from './settingsView.ts';
export {
  moveAddressCandidateFocus,
  renderSelectedAddressConfirmation,
  resolveAddressGeocodeSearch,
  selectAddressGeocodeCandidate
} from './addressPickerView.ts';
export type {
  AddressCandidateKey,
  AddressGeocodePickerState,
  AddressGeocodeSearchInput,
  AddressSettingsFieldName,
  RenderedAddressCandidate,
  RenderedAddressGeocodePicker
} from './addressPickerView.ts';
export { renderLegalPage } from './legalView.ts';
export type { RenderedLegalPage, RenderedLegalPageProvider } from './legalView.ts';

export type ItineraryUiState =
  | 'loading'
  | 'success'
  | 'empty'
  | 'recoverable-error'
  | 'fallback-stale'
  | 'delay-present'
  | 'canonical-field-validation-failure';

export type RouteMode = 'walk' | 'bike';
export type SegmentName = 'x' | 'y' | 'z';
export type PointName = 'homeAddress' | 'homeStation' | 'workStation' | 'workAddress';
export type TransportName = 'transportWork' | 'transportHome';
export interface DirectionPageContext {
  direction: CanonicalDirection;
  path: '/to-work' | '/to-home';
  title: CanonicalDirection;
  orderedPointNames: readonly PointName[];
  orderedSegmentNames: readonly SegmentName[];
  transportName: TransportName;
}

export interface RenderedPoint {
  name: PointName;
  anchorField?: 'homeStationTime' | 'workStationTime';
  time?: string;
}

export interface RenderedSegment {
  name: SegmentName;
  label: string;
  durationFields: readonly string[];
  transportName?: TransportName;
  unavailableModes: readonly RouteMode[];
}

interface DelayRecommendation {
  field: 'homeAddressWalkTime' | 'workAddressWalkTime';
  value: string;
  anchorField: 'homeStationTime' | 'workStationTime';
  anchorTime: string;
}

export interface RenderedItineraryPage {
  state: ItineraryUiState;
  context: DirectionPageContext;
  title: string;
  badges: readonly string[];
  actions: readonly string[];
  points: readonly RenderedPoint[];
  segments: readonly RenderedSegment[];
  addressTimes: readonly string[];
  validationErrors: readonly string[];
  attributions: readonly string[];
  html: string;
  telemetryEvents: readonly string[];
  telemetryPayloads: readonly ItineraryTelemetryPayload[];
}

interface BaseRenderInput {
  direction: CanonicalDirection;
  tier2Expanded?: boolean;
}

export interface LoadingRenderInput extends BaseRenderInput {
  status: 'loading';
  staleJourney?: unknown;
  staleGeneratedAt?: string;
}

export interface EmptyRenderInput extends BaseRenderInput {
  status: 'empty';
}

export interface RecoverableErrorRenderInput extends BaseRenderInput {
  status: 'recoverable-error';
  code: 'UPSTREAM_TIMEOUT' | 'NO_ROUTE_FOUND' | 'PARTIAL_RESPONSE';
  message?: string;
  staleJourney?: unknown;
  staleGeneratedAt?: string;
}

export interface FallbackStaleRenderInput extends BaseRenderInput {
  status: 'fallback-stale';
  staleJourney: unknown;
  staleGeneratedAt: string;
  reason: string;
}

export interface SuccessRenderInput extends BaseRenderInput {
  status: 'success';
  journey: unknown;
  unavailableModes?: Partial<Record<'x' | 'z', readonly RouteMode[]>>;
}

export type ItineraryRenderInput =
  | LoadingRenderInput
  | EmptyRenderInput
  | RecoverableErrorRenderInput
  | FallbackStaleRenderInput
  | SuccessRenderInput;

const POINT_NAMES = ['homeAddress', 'homeStation', 'workStation', 'workAddress'] as const;
const JOURNEY_WORK_POINTS = POINT_NAMES;
const JOURNEY_HOME_POINTS = [...POINT_NAMES].reverse() as readonly PointName[];
const SEGMENT_NAMES = ['x', 'y', 'z'] as const;
const JOURNEY_HOME_SEGMENTS = [...SEGMENT_NAMES].reverse() as readonly SegmentName[];
const ADDRESS_TIME_FIELDS = ['homeAddressWalkTime', 'homeAddressBikeTime', 'workAddressWalkTime', 'workAddressBikeTime'] as const;

export const DIRECTION_PAGE_CONTEXTS: Record<CanonicalDirection, DirectionPageContext> = {
  journeyWork: {
    direction: 'journeyWork',
    path: '/to-work',
    title: 'journeyWork',
    orderedPointNames: JOURNEY_WORK_POINTS,
    orderedSegmentNames: SEGMENT_NAMES,
    transportName: 'transportWork'
  },
  journeyHome: {
    direction: 'journeyHome',
    path: '/to-home',
    title: 'journeyHome',
    orderedPointNames: JOURNEY_HOME_POINTS,
    orderedSegmentNames: JOURNEY_HOME_SEGMENTS,
    transportName: 'transportHome'
  }
};

export function renderItineraryPage(input: ItineraryRenderInput): RenderedItineraryPage {
  const context = DIRECTION_PAGE_CONTEXTS[input.direction];
  const startedAtMs = Date.now();
  const baseTelemetry = ['ui.direction_page.view'];

  if (input.status === 'loading') {
    const stale = input.staleJourney ? renderJourneyContent(input.staleJourney, context, {}, true) : emptyContent(context);
    return buildPage({
      state: 'loading',
      context,
      tier2Expanded: input.tier2Expanded,
      badges: input.staleJourney ? ['Updating…', `Stale ${input.staleGeneratedAt ?? 'unknown age'}`] : [],
      actions: [],
      content: stale,
      messages: ['Calculating route…', 'Checking transport and first/last-mile routes.'],
      telemetryEvents: [...baseTelemetry, 'ui.itinerary.state.loading'],
      telemetryPayloads: [createItineraryTelemetryPayload({ direction: input.direction, latencyMs: Date.now() - startedAtMs })]
    });
  }

  if (input.status === 'empty') {
    return buildPage({
      state: 'empty',
      context,
      tier2Expanded: input.tier2Expanded,
      badges: [],
      actions: ['Try nearby station', 'Adjust departure/arrival time', 'Check address pin'],
      content: emptyContent(context),
      messages: ['No route found yet.', 'Try a nearby station, adjust the time, or check the address pin.'],
      telemetryEvents: [...baseTelemetry, 'ui.itinerary.state.empty'],
      telemetryPayloads: [createItineraryTelemetryPayload({ direction: input.direction, latencyMs: Date.now() - startedAtMs })]
    });
  }

  if (input.status === 'recoverable-error') {
    const stale = input.staleJourney ? renderJourneyContent(input.staleJourney, context, {}, true) : emptyContent(context);
    return buildPage({
      state: 'recoverable-error',
      context,
      tier2Expanded: input.tier2Expanded,
      badges: input.staleJourney ? ['Stale results visible'] : [],
      actions: ['Retry route', 'Edit trip inputs'],
      content: stale,
      messages: [friendlyRecoverableMessage(input.code, input.message)],
      telemetryEvents: [...baseTelemetry, 'ui.itinerary.state.recoverable-error'],
      telemetryPayloads: [createItineraryTelemetryPayload({ direction: input.direction, latencyMs: Date.now() - startedAtMs, errorCode: input.code })]
    });
  }

  if (input.status === 'fallback-stale') {
    const content = renderJourneyContent(input.staleJourney, context, {}, true);
    return buildPage({
      state: 'fallback-stale',
      context,
      tier2Expanded: input.tier2Expanded,
      badges: ['Fallback data', `Stale ${input.staleGeneratedAt}`],
      actions: ['Retry route'],
      content,
      messages: [input.reason],
      telemetryEvents: [...baseTelemetry, 'ui.itinerary.state.fallback-stale'],
      telemetryPayloads: [createItineraryTelemetryPayload({ direction: input.direction, latencyMs: Date.now() - startedAtMs, errorCode: 'FALLBACK_STALE' })]
    });
  }

  const validation = validateCanonicalJourney(input.journey);
  if (!validation.success || !validation.data || validation.data.direction !== input.direction) {
    const errors = [
      ...(validation.errors ?? []).map((error) => `${error.field}: ${error.message}`),
      ...(validation.success && validation.data?.direction !== input.direction
        ? [`direction: Expected ${input.direction} for ${context.path}.`]
        : [])
    ];

    return buildPage({
      state: 'canonical-field-validation-failure',
      context,
      tier2Expanded: input.tier2Expanded,
      badges: ['Canonical field validation failed'],
      actions: ['Edit trip inputs'],
      content: emptyContent(context),
      messages: errors,
      validationErrors: errors,
      telemetryEvents: [...baseTelemetry, 'ui.itinerary.render_error', 'ui.itinerary.state.canonical-field-validation-failure'],
      telemetryPayloads: [createItineraryTelemetryPayload({ direction: input.direction, latencyMs: Date.now() - startedAtMs, errorCode: 'CANONICAL_FIELD_VALIDATION_FAILURE' })]
    });
  }

  const state: ItineraryUiState = hasDelay(validation.data, context.transportName) ? 'delay-present' : 'success';
  const content = renderJourneyContent(validation.data, context, input.unavailableModes ?? {}, false);
  const delayRecommendation = state === 'delay-present' ? getDelayRecommendation(validation.data, context.direction) : undefined;
  const badges = state === 'delay-present' ? ['Delay present', context.transportName, 'Segment y delay'] : [];

  return buildPage({
    state,
    context,
    tier2Expanded: input.tier2Expanded,
    badges,
    actions: [],
    content,
    messages:
      state === 'delay-present' && delayRecommendation
        ? [
            `Delay present on segment y (${context.transportName}).`,
            `Recommended start time ${delayRecommendation.field}: ${delayRecommendation.value} (shifted by segment y delay; anchored to ${delayRecommendation.anchorField} ${delayRecommendation.anchorTime}).`
          ]
        : [],
    telemetryEvents: [...baseTelemetry, `ui.itinerary.state.${state}`],
    telemetryPayloads: [createItineraryTelemetryPayload({ direction: input.direction, latencyMs: Date.now() - startedAtMs })]
  });
}

function renderJourneyContent(
  journey: unknown,
  context: DirectionPageContext,
  unavailableModes: Partial<Record<'x' | 'z', readonly RouteMode[]>>,
  allowInvalidStale: boolean
): Pick<RenderedItineraryPage, 'points' | 'segments' | 'addressTimes' | 'validationErrors'> {
  const validation = validateCanonicalJourney(journey);
  if (!validation.success || !validation.data) {
    if (allowInvalidStale) {
      return emptyContent(context, (validation.errors ?? []).map((error) => `${error.field}: ${error.message}`));
    }
    return emptyContent(context);
  }

  const data = validation.data;
  const points = context.orderedPointNames.map((name) => renderPoint(name, data));
  const segments = context.orderedSegmentNames.map((name) => renderSegment(name, context.transportName, unavailableModes));
  const addressTimes = ADDRESS_TIME_FIELDS.map((field) => `${field}: ${data[field]}`);

  return { points, segments, addressTimes, validationErrors: [] };
}

function renderPoint(name: PointName, journey: CanonicalJourney): RenderedPoint {
  if (name === 'homeStation') {
    return { name, anchorField: 'homeStationTime', time: journey.homeStationTime };
  }
  if (name === 'workStation') {
    return { name, anchorField: 'workStationTime', time: journey.workStationTime };
  }
  return { name };
}

function renderSegment(
  name: SegmentName,
  transportName: TransportName,
  unavailableModes: Partial<Record<'x' | 'z', readonly RouteMode[]>>
): RenderedSegment {
  if (name === 'x') {
    return {
      name,
      label: 'homeAddress <-> homeStation',
      durationFields: ['routeHomeWalkSec', 'routeHomeBikeSec'],
      unavailableModes: unavailableModes.x ?? []
    };
  }

  if (name === 'y') {
    return {
      name,
      label: transportName,
      durationFields: [],
      transportName,
      unavailableModes: []
    };
  }

  return {
    name,
    label: 'workStation <-> workAddress',
    durationFields: ['routeWorkWalkSec', 'routeWorkBikeSec'],
    unavailableModes: unavailableModes.z ?? []
  };
}

function buildPage(input: {
  state: ItineraryUiState;
  context: DirectionPageContext;
  tier2Expanded?: boolean;
  badges: readonly string[];
  actions: readonly string[];
  content: Pick<RenderedItineraryPage, 'points' | 'segments' | 'addressTimes' | 'validationErrors'>;
  messages: readonly string[];
  validationErrors?: readonly string[];
  telemetryEvents: readonly string[];
  telemetryPayloads: readonly ItineraryTelemetryPayload[];
}): RenderedItineraryPage {
  const validationErrors = input.validationErrors ?? input.content.validationErrors;
  const title = input.context.title;
  const attributions = [PROVIDER_POLICIES.dbTransport.attribution, PROVIDER_POLICIES.osrm.attribution];
  const tier2Expanded = input.tier2Expanded ?? false;
  const tier2ControlId = `${input.context.direction}-tier-2-details`;
  const html = [
    `<main data-page="${input.context.path}" data-state="${input.state}" data-mobile-layout="bottom-nav" style="padding-bottom:calc(4.5rem + env(safe-area-inset-bottom));">`,
    `<h1>${title}</h1>`,
    bottomNavHtml(input.context.path),
    `<section data-tier="1" data-tier-visible="always" aria-label="Trip summary">`,
    `<div data-status-region aria-live="polite">${input.badges.map((badge) => `<span data-badge>${badge}</span>`).join('')}${input.messages.map((message) => `<p>${message}</p>`).join('')}</div>`,
    `<ol data-points>${input.content.points.map((point) => `<li>${point.name}${point.anchorField ? ` ${point.anchorField} ${point.time}` : ''}</li>`).join('')}</ol>`,
    `</section>`,
    `<section data-tier="2" data-tier-expanded="${tier2Expanded}" aria-label="Trip details">`,
    `<button type="button" data-expander="trip-details" aria-controls="${tier2ControlId}" aria-expanded="${tier2Expanded}">${tier2Expanded ? 'Hide trip details' : 'Show trip details'}</button>`,
    `<div id="${tier2ControlId}" data-tier-2-panel${tier2Expanded ? '' : ' hidden'}>`,
    `<ol data-segments>${input.content.segments
      .map((segment) => `<li>${segment.name} ${segment.label} ${segment.durationFields.join(' ')}${segment.unavailableModes.length > 0 ? ' Unavailable right now' : ''}</li>`)
      .join('')}</ol>`,
    `<dl data-address-times>${input.content.addressTimes.map((entry) => `<div>${entry}</div>`).join('')}</dl>`,
    ...input.actions.map((action) => `<button>${action}</button>`),
    ...validationErrors.map((error) => `<strong data-validation-error>${error}</strong>`),
    attributionListHtml(attributions, 'itinerary-attribution'),
    `</div>`,
    `</section>`,
    `</main>`
  ].join('');

  return {
    state: input.state,
    context: input.context,
    title,
    badges: input.badges,
    actions: input.actions,
    points: input.content.points,
    segments: input.content.segments,
    addressTimes: input.content.addressTimes,
    validationErrors,
    attributions,
    html,
    telemetryEvents: input.telemetryEvents,
    telemetryPayloads: input.telemetryPayloads
  };
}


function bottomNavHtml(activePath: '/to-work' | '/to-home'): string {
  const entries = [
    { path: '/to-work', label: 'To Work' },
    { path: '/to-home', label: 'To Home' },
    { path: '/settings', label: 'Settings' }
  ] as const;

  return `<nav data-bottom-nav role="navigation" aria-label="Primary" style="padding-bottom:env(safe-area-inset-bottom);">${entries
    .map((entry) => `<a href="${entry.path}" data-bottom-nav-entry="${entry.label}"${entry.path === activePath ? ' aria-current="page" data-active="true"' : ''}>${entry.label}</a>`)
    .join('')}</nav>`;
}

function friendlyRecoverableMessage(code: RecoverableErrorRenderInput['code'], message?: string): string {
  if (message) {
    return message;
  }
  if (code === 'NO_ROUTE_FOUND') {
    return 'No route found yet. Try a nearby station or adjust the trip time.';
  }
  if (code === 'PARTIAL_RESPONSE') {
    return 'Some results are still missing. Showing the best available trip details.';
  }
  return 'Route updates are taking longer than expected. Your selections are saved.';
}

function attributionListHtml(attributions: readonly string[], dataAttribute: string): string {
  return `<footer data-${dataAttribute}>${attributions.map((attribution) => `<p>${attribution}</p>`).join('')}</footer>`;
}

function emptyContent(context: DirectionPageContext, validationErrors: readonly string[] = []): Pick<RenderedItineraryPage, 'points' | 'segments' | 'addressTimes' | 'validationErrors'> {
  return {
    points: context.orderedPointNames.map((name) => ({ name })),
    segments: context.orderedSegmentNames.map((name) => renderSegment(name, context.transportName, {})),
    addressTimes: [],
    validationErrors
  };
}

function getDelayRecommendation(journey: CanonicalJourney, direction: CanonicalDirection): DelayRecommendation {
  if (direction === 'journeyHome') {
    return {
      field: 'workAddressWalkTime',
      value: journey.workAddressWalkTime,
      anchorField: 'workStationTime',
      anchorTime: journey.workStationTime
    };
  }

  return {
    field: 'homeAddressWalkTime',
    value: journey.homeAddressWalkTime,
    anchorField: 'homeStationTime',
    anchorTime: journey.homeStationTime
  };
}

function hasDelay(journey: CanonicalJourney, transportName: TransportName): boolean {
  const transport = journey[transportName] as TransportTiming | undefined;
  return transport?.delayStatus === 'delayed' || (transport?.departureDelaySec ?? 0) > 0 || (transport?.arrivalDelaySec ?? 0) > 0;
}
