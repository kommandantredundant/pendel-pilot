import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  renderItineraryPage,
  type ItineraryRenderInput,
  type ItineraryUiState
} from '../src/frontend/itineraryView.ts';
import {
  BUFFER_SETTINGS_FIELD_NAMES,
  editBufferSettingsValue,
  readCommuteSettings,
  renderSettingsPage,
  writeCommuteSettings
} from '../src/frontend/settingsView.ts';
import {
  moveAddressCandidateFocus,
  renderSelectedAddressConfirmation,
  resolveAddressGeocodeSearch,
  selectAddressGeocodeCandidate
} from '../src/frontend/addressPickerView.ts';
import { renderLegalPage } from '../src/frontend/legalView.ts';
import { AddressGeocodeService } from '../src/services/addressGeocode.service.ts';
import {
  DailyJourneyLocalStore,
  validateBufferSettings,
  validateCommuteProfile,
  type BufferSettings,
  type CommuteProfile,
  type KeyValueStorage
} from '../src/models/localPersistence.ts';
import { ITINERARY_TELEMETRY_VERSION } from '../src/telemetry/itineraryTelemetry.ts';
import { PROVIDER_POLICIES } from '../src/clients/providerCompliance.ts';
import {
  CANONICAL_ADDRESS_TIME_FIELDS,
  CANONICAL_BUFFER_MIN_FIELDS,
  CANONICAL_BUFFER_SEC_FIELDS,
  CANONICAL_ROUTE_DURATION_FIELDS,
  CANONICAL_STATION_ANCHOR_FIELDS,
  validateCanonicalJourney,
  type CanonicalJourney
} from '../src/models/canonicalJourney.ts';

const fixture = <T>(name: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/journeys/${name}`, import.meta.url)), 'utf8')) as T;

const journeyWork = fixture<unknown>('journeyWork.response.json');
const journeyHome = fixture<unknown>('journeyHome.response.json');
const delayedJourneyWork = fixture<unknown>('journeyWork.delayed-y.response.json');

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function validProfile(overrides: Partial<CommuteProfile> = {}): CommuteProfile {
  return {
    id: 'profile-1',
    name: 'Default commute',
    homeAddress: { lat: 52.5208, lon: 13.4095, label: 'Home' },
    homeStation: { id: '8002549', name: 'Berlin Südkreuz', lat: 52.475, lon: 13.365 },
    workStation: { id: '8000105', name: 'Berlin Hbf', lat: 52.525, lon: 13.369 },
    workAddress: { lat: 52.5321, lon: 13.3849, label: 'Work' },
    defaultDirection: 'journeyWork',
    createdAt: '2026-04-10T05:00:00.000Z',
    updatedAt: '2026-04-10T05:00:00.000Z',
    ...overrides
  };
}

function validPreset(overrides: Partial<BufferSettings> = {}): BufferSettings {
  return {
    bufferInsideHomeStationMin: 5, bufferInsideWorkStationMin: 3, bufferLeaveHomeMin: 4,
    bufferLeaveWorkMin: 6, bufferPrepareWalkMin: 1, bufferPrepareBikeMin: 2, ...overrides
  };
}


const NON_CANONICAL_UI_SYNONYMS = [
  'origin',
  'destination',
  'fromStation',
  'toStation',
  'HomeStationTime',
  'WorkStationTime',
  'homeStationTimestamp',
  'workStationTimestamp'
];

const CANONICAL_COMPLETE_JOURNEY_FIELDS = [
  'direction',
  'homeAddress',
  'homeStation',
  'workStation',
  'workAddress',
  ...CANONICAL_STATION_ANCHOR_FIELDS,
  ...CANONICAL_ROUTE_DURATION_FIELDS,
  ...CANONICAL_BUFFER_MIN_FIELDS,
  ...CANONICAL_BUFFER_SEC_FIELDS,
  ...CANONICAL_ADDRESS_TIME_FIELDS
] as const;

function assertCanonicalJourneyCompleteness(journey: unknown, fixtureName: string): asserts journey is CanonicalJourney {
  const validation = validateCanonicalJourney(journey);
  assert.equal(validation.success, true, `${fixtureName} must validate as a canonical journey.`);
  if (!validation.data) {
    throw new Error(`${fixtureName} must produce canonical journey data.`);
  }
  const data = validation.data;
  for (const field of CANONICAL_COMPLETE_JOURNEY_FIELDS) {
    assert.equal(Object.hasOwn(data, field), true, `${fixtureName} missing canonical field ${field}.`);
  }
  if (data.direction === 'journeyWork') {
    assert.equal(Object.hasOwn(data, 'transportWork'), true, `${fixtureName} missing transportWork.`);
    assert.equal(Object.hasOwn(data, 'transportHome'), false, `${fixtureName} should not include transportHome.`);
  } else {
    assert.equal(Object.hasOwn(data, 'transportHome'), true, `${fixtureName} missing transportHome.`);
    assert.equal(Object.hasOwn(data, 'transportWork'), false, `${fixtureName} should not include transportWork.`);
  }
}

function assertSettingsFixtureCompatibility(settings: { profile: unknown; bufferSettings: unknown }): void {
  assert.equal(validateCommuteProfile(settings.profile).success, true);
  assert.equal(validateBufferSettings(settings.bufferSettings).success, true);
}

describe('frontend settings profile flow', () => {
  it('renders existing profile settings with canonical address, station, and buffer fields', () => {
    const page = renderSettingsPage({ profile: validProfile(), bufferSettings: validPreset() });

    assert.equal(page.state, 'settings-ready');
    assert.deepEqual(page.addresses.map((address) => address.name), ['homeAddress', 'workAddress']);
    assert.deepEqual(page.stations.map((station) => station.name), ['homeStation', 'workStation']);
    assert.deepEqual(page.bufferFields.map((field) => field.name), [...BUFFER_SETTINGS_FIELD_NAMES]);
    assert.equal(page.html.includes('homeAddress: Home'), true);
    assert.equal(page.html.includes('homeStation: 8002549 Berlin Südkreuz'), true);
    assert.equal(page.html.includes('bufferInsideHomeStationMin'), true);
    assert.equal(page.html.includes('bufferPrepareBikeMin'), true);
  });

  it('edits buffer values while preserving canonical buffer field names', () => {
    const edited = editBufferSettingsValue(validPreset(), 'bufferLeaveHomeMin', 9);
    const page = renderSettingsPage({ profile: validProfile(), bufferSettings: edited });

    assert.equal(edited.bufferLeaveHomeMin, 9);
    assert.equal(page.html.includes('name="bufferLeaveHomeMin" type="number" value="9"'), true);
    assert.deepEqual(page.bufferFields.find((field) => field.name === 'bufferLeaveHomeMin'), { name: 'bufferLeaveHomeMin', value: 9 });
  });

  it('validates invalid or missing canonical settings fields', () => {
    const invalidProfile = { ...validProfile(), homeAddress: { label: 'Missing coordinates' } } as Record<string, unknown>;
    const invalidPreset = { ...validPreset(), bufferPrepareBike: 2 } as Record<string, unknown>;
    delete invalidPreset.bufferPrepareBikeMin;

    const page = renderSettingsPage({ profile: invalidProfile, bufferSettings: invalidPreset });

    assert.equal(page.state, 'settings-validation-failure');
    assert.ok(page.validationErrors.some((error) => error.includes('profile.homeAddress.lat')));
    assert.ok(page.validationErrors.some((error) => error.includes('bufferSettings.bufferPrepareBikeMin')));
    assert.equal(page.html.includes('bufferPrepareBike:'), false);
  });

  it('writes and reads one commute and its buffer settings through local persistence helpers', () => {
    const store = new DailyJourneyLocalStore(new MemoryStorage());
    const editedPreset = editBufferSettingsValue(validPreset(), 'bufferInsideWorkStationMin', 7);

    writeCommuteSettings(store, { profile: validProfile(), bufferSettings: editedPreset });
    const settings = readCommuteSettings(store);
    const page = renderSettingsPage({ profile: settings.profile, bufferSettings: settings.bufferSettings });

    assert.equal(settings.profile?.homeAddress.label, 'Home');
    assert.equal(settings.bufferSettings?.bufferInsideWorkStationMin, 7);
    assert.equal(page.state, 'settings-ready');
    assert.equal(page.html.includes('value="7"'), true);
  });


  it('renders a single geocode result with a simple confirmation action', async () => {
    const service = new AddressGeocodeService({
      async geocode() {
        return [{ name: 'Berlin Hbf', city: 'Berlin', country: 'Germany', coordinates: { latitude: 52.525, longitude: 13.369 } }];
      }
    });

    const picker = await resolveAddressGeocodeSearch(service, { field: 'workAddress', q: 'Berlin Hbf', profile: validProfile() });

    assert.equal(picker.state, 'address-single-result');
    assert.equal(picker.candidates[0]?.label, 'Berlin Hbf');
    assert.equal(picker.candidates[0]?.metadata, 'Berlin, Germany · 52.525, 13.369');
    assert.deepEqual(picker.actions, ['Use selected address']);
    assert.equal(picker.html.includes('Use selected address'), true);
    assert.deepEqual(picker.attributions, [PROVIDER_POLICIES.photon.attribution]);
    assert.equal(picker.html.includes(PROVIDER_POLICIES.photon.attribution), true);
  });

  it('renders a multiple-result disambiguation picker with labels and coordinates/locality metadata', async () => {
    const service = new AddressGeocodeService({
      async geocode() {
        return [
          { name: 'Main Street', city: 'Springfield', state: 'IL', country: 'United States', coordinates: { latitude: 39.8017, longitude: -89.6436 } },
          { name: 'Main Street', city: 'Springfield', state: 'MA', country: 'United States', coordinates: { latitude: 42.1015, longitude: -72.5898 } }
        ];
      }
    });

    const picker = await resolveAddressGeocodeSearch(service, { field: 'homeAddress', q: 'Main Street Springfield', selectedIndex: 1 });

    assert.equal(picker.state, 'address-multiple-results');
    assert.deepEqual(picker.candidates.map((candidate) => candidate.label), ['Main Street', 'Main Street']);
    assert.deepEqual(picker.candidates.map((candidate) => candidate.metadata), [
      'Springfield, IL, United States · 39.8017, -89.6436',
      'Springfield, MA, United States · 42.1015, -72.5898'
    ]);
    assert.equal(picker.selectedCandidate?.metadata.includes('42.1015'), true);
    assert.equal(picker.selectedIndex, 1);
    assert.equal(picker.html.includes('role="listbox"'), true);
    assert.equal(picker.html.includes('aria-activedescendant="homeAddress-candidate-1"'), true);
    assert.equal(picker.html.includes('data-address-keyboard="ArrowUp ArrowDown Home End"'), true);
    assert.equal(picker.html.includes('aria-selected="true"'), true);
    assert.equal(picker.html.includes('Use selected address'), true);
  });

  it('persists the selected candidate into the commute profile and renders a pinned confirmation', () => {
    const candidate = { name: 'Alexanderplatz', city: 'Berlin', country: 'Germany', coordinates: { latitude: 52.5219, longitude: 13.4132 } };
    const profile = selectAddressGeocodeCandidate(validProfile(), 'homeAddress', candidate, '2026-04-10T05:20:00.000Z');
    const store = new DailyJourneyLocalStore(new MemoryStorage());
    writeCommuteSettings(store, { profile, bufferSettings: validPreset() });

    const settings = readCommuteSettings(store);
    const confirmation = renderSelectedAddressConfirmation(validProfile(), 'homeAddress', candidate);

    assert.equal(settings.profile?.homeAddress.label, 'Alexanderplatz');
    assert.equal(settings.profile?.homeAddress.lat, 52.5219);
    assert.equal(settings.profile?.homeAddress.lon, 13.4132);
    assert.equal(settings.profile?.updatedAt, '2026-04-10T05:20:00.000Z');
    assert.equal(confirmation.html.includes('Pinned: Alexanderplatz'), true);
  });

  it('supports keyboard navigation through geocode candidate rows', async () => {
    assert.equal(moveAddressCandidateFocus(3, 0, 'ArrowDown'), 1);
    assert.equal(moveAddressCandidateFocus(3, 1, 'ArrowDown'), 2);
    assert.equal(moveAddressCandidateFocus(3, 2, 'ArrowDown'), 0);
    assert.equal(moveAddressCandidateFocus(3, 0, 'ArrowUp'), 2);
    assert.equal(moveAddressCandidateFocus(3, 2, 'Home'), 0);
    assert.equal(moveAddressCandidateFocus(3, 0, 'End'), 2);

    const service = new AddressGeocodeService({
      async geocode() {
        return [
          { name: 'First', coordinates: { latitude: 1, longitude: 1 } },
          { name: 'Second', coordinates: { latitude: 2, longitude: 2 } },
          { name: 'Third', coordinates: { latitude: 3, longitude: 3 } }
        ];
      }
    });
    const nextIndex = moveAddressCandidateFocus(3, 0, 'ArrowDown');
    const picker = await resolveAddressGeocodeSearch(service, { field: 'workAddress', q: 'ambiguous address', selectedIndex: nextIndex });

    assert.equal(picker.selectedIndex, 1);
    assert.equal(picker.candidates[1]?.selected, true);
    assert.equal(picker.candidates[1]?.tabIndex, 0);
    assert.equal(picker.candidates[0]?.tabIndex, -1);
    assert.equal(picker.html.includes('aria-activedescendant="workAddress-candidate-1"'), true);
  });

  it('keeps empty query and provider failure behavior aligned with AddressGeocodeService', async () => {
    const failingService = new AddressGeocodeService({
      async geocode() {
        throw new Error('Photon unavailable');
      }
    });

    const empty = await resolveAddressGeocodeSearch(new AddressGeocodeService(), { field: 'homeAddress', q: '   ' });
    const failure = await resolveAddressGeocodeSearch(failingService, { field: 'homeAddress', q: 'new address' });
    const fallback = await resolveAddressGeocodeSearch(failingService, { field: 'homeAddress', q: 'saved address', profile: validProfile() });

    assert.equal(empty.state, 'address-empty-query');
    assert.equal(empty.messages.includes('Address geocode query must not be empty.'), true);
    assert.equal(failure.state, 'address-geocode-error');
    assert.equal(failure.messages.includes('Photon unavailable'), true);
    assert.equal(fallback.state, 'address-single-result');
    assert.equal(fallback.candidates[0]?.label, 'Home');
  });
});

describe('frontend legal surface', () => {
  it('lists provider names, reused attribution strings, and configured terms/license links', () => {
    const page = renderLegalPage();

    assert.equal(page.title, 'about-legal');
    assert.deepEqual(page.providers.map((provider) => provider.provider), ['dbTransport', 'osrm', 'photon']);
    assert.deepEqual(page.providers.map((provider) => provider.attribution), [
      PROVIDER_POLICIES.dbTransport.attribution,
      PROVIDER_POLICIES.osrm.attribution,
      PROVIDER_POLICIES.photon.attribution
    ]);
    for (const provider of page.providers) {
      assert.equal(page.html.includes(provider.name), true);
      assert.equal(page.html.includes(provider.attribution), true);
      if (provider.termsUrl) {
        assert.equal(page.html.includes(provider.termsUrl), true);
      }
      if (provider.licenseUrl) {
        assert.equal(page.html.includes(provider.licenseUrl), true);
      }
    }
  });
});

describe('frontend itinerary pages from golden fixtures', () => {
  it('AC1 renders dedicated journeyWork and journeyHome page contexts', () => {
    const workPage = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });
    const homePage = renderItineraryPage({ direction: 'journeyHome', status: 'success', journey: journeyHome });

    assert.equal(workPage.context.path, '/to-work');
    assert.equal(workPage.title, 'journeyWork');
    assert.equal(homePage.context.path, '/to-home');
    assert.equal(homePage.title, 'journeyHome');
    assert.ok(workPage.telemetryEvents.includes('ui.direction_page.view'));
    assert.ok(homePage.telemetryEvents.includes('ui.direction_page.view'));
    assert.equal(workPage.telemetryPayloads[0]?.direction, 'journeyWork');
    assert.equal(homePage.telemetryPayloads[0]?.direction, 'journeyHome');
    assert.equal(workPage.telemetryPayloads[0]?.version, ITINERARY_TELEMETRY_VERSION);
  });

  it('renders mobile bottom nav entries with the active direction and safe-area padding', () => {
    const workPage = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });
    const homePage = renderItineraryPage({ direction: 'journeyHome', status: 'success', journey: journeyHome });

    assert.equal(workPage.html.includes('data-mobile-layout="bottom-nav"'), true);
    assert.equal(workPage.html.includes('style="padding-bottom:calc(4.5rem + env(safe-area-inset-bottom));"'), true);
    assert.equal(workPage.html.includes('role="navigation" aria-label="Primary"'), true);
    assert.equal(workPage.html.includes('data-bottom-nav-entry="To Work" aria-current="page"'), true);
    assert.equal(workPage.html.includes('data-bottom-nav-entry="To Home"'), true);
    assert.equal(workPage.html.includes('data-bottom-nav-entry="Settings"'), true);
    assert.equal(homePage.html.includes('data-bottom-nav-entry="To Home" aria-current="page"'), true);
  });

  it('keeps Tier 1 visible when Tier 2 details are expanded', () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork, tier2Expanded: true });

    assert.equal(page.html.includes('data-tier="1" data-tier-visible="always"'), true);
    assert.equal(page.html.includes('data-tier="2" data-tier-expanded="true"'), true);
    assert.equal(page.html.includes('data-expander="trip-details"'), true);
    assert.equal(page.html.includes('aria-expanded="true"'), true);
    assert.equal(page.html.includes('Hide trip details'), true);
    assert.ok(page.html.indexOf('data-tier="1"') < page.html.indexOf('data-tier="2"'));
    assert.ok(page.html.includes('<ol data-points>'));
    assert.ok(page.html.includes('<ol data-segments>'));
  });

  it('adds polite live regions for itinerary state transitions and address picker updates', async () => {
    const loadingPage = renderItineraryPage({ direction: 'journeyWork', status: 'loading' });
    const errorPage = renderItineraryPage({ direction: 'journeyWork', status: 'recoverable-error', code: 'PARTIAL_RESPONSE' });
    const picker = await resolveAddressGeocodeSearch(new AddressGeocodeService(), { field: 'homeAddress', q: '   ' });

    assert.equal(loadingPage.html.includes('data-status-region aria-live="polite"'), true);
    assert.equal(errorPage.html.includes('aria-live="polite"'), true);
    assert.equal(picker.html.includes('aria-live="polite"'), true);
  });

  it('renders keyboard-accessible expander and picker row labels/roles', async () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });
    const picker = await resolveAddressGeocodeSearch(
      new AddressGeocodeService({
        async geocode() {
          return [{ name: 'Berlin Hbf', city: 'Berlin', country: 'Germany', coordinates: { latitude: 52.525, longitude: 13.369 } }];
        }
      }),
      { field: 'workAddress', q: 'Berlin Hbf' }
    );

    assert.equal(page.html.includes('<button type="button" data-expander="trip-details"'), true);
    assert.equal(page.html.includes('aria-controls="journeyWork-tier-2-details"'), true);
    assert.equal(page.html.includes('aria-expanded="false"'), true);
    assert.equal(page.html.includes('Show trip details'), true);
    assert.equal(picker.html.includes('role="listbox"'), true);
    assert.equal(picker.html.includes('role="option"'), true);
    assert.equal(picker.html.includes('aria-label="Choose address Berlin Hbf, Berlin, Germany · 52.525, 13.369"'), true);
  });

  it('does not expose raw backend jargon in default state and error copy', () => {
    const pages = [
      renderItineraryPage({ direction: 'journeyWork', status: 'empty' }),
      renderItineraryPage({ direction: 'journeyWork', status: 'recoverable-error', code: 'UPSTREAM_TIMEOUT' }),
      renderItineraryPage({ direction: 'journeyWork', status: 'recoverable-error', code: 'PARTIAL_RESPONSE' })
    ];

    for (const page of pages) {
      assert.equal(page.html.includes('NO_ROUTE_FOUND'), false);
      assert.equal(page.html.includes('UPSTREAM_TIMEOUT'), false);
      assert.equal(page.html.includes('PARTIAL_RESPONSE'), false);
      assert.equal(page.html.includes('provider took too long'), false);
    }
  });

  it('AC2 renders all four canonical points in direction-specific order', () => {
    const workPage = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });
    const homePage = renderItineraryPage({ direction: 'journeyHome', status: 'success', journey: journeyHome });

    assert.deepEqual(
      workPage.points.map((point) => point.name),
      ['homeAddress', 'homeStation', 'workStation', 'workAddress']
    );
    assert.deepEqual(
      homePage.points.map((point) => point.name),
      ['workAddress', 'workStation', 'homeStation', 'homeAddress']
    );
  });

  it('AC3 renders segment y as transportWork or transportHome without aliasing', () => {
    const workPage = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });
    const homePage = renderItineraryPage({ direction: 'journeyHome', status: 'success', journey: journeyHome });

    assert.deepEqual(
      workPage.segments.map((segment) => segment.name),
      ['x', 'y', 'z']
    );
    assert.equal(workPage.segments.find((segment) => segment.name === 'y')?.transportName, 'transportWork');
    assert.deepEqual(
      homePage.segments.map((segment) => segment.name),
      ['z', 'y', 'x']
    );
    assert.equal(homePage.segments.find((segment) => segment.name === 'y')?.transportName, 'transportHome');
  });

  it('AC5 renders walk and bike duration fields for only segments x and z', () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });

    assert.deepEqual(page.segments.find((segment) => segment.name === 'x')?.durationFields, ['routeHomeWalkSec', 'routeHomeBikeSec']);
    assert.deepEqual(page.segments.find((segment) => segment.name === 'y')?.durationFields, []);
    assert.deepEqual(page.segments.find((segment) => segment.name === 'z')?.durationFields, ['routeWorkWalkSec', 'routeWorkBikeSec']);
  });

  it('renders provider attribution on journey results for transit timing and routing durations', () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });

    assert.deepEqual(page.attributions, [PROVIDER_POLICIES.dbTransport.attribution, PROVIDER_POLICIES.osrm.attribution]);
    assert.equal(page.html.includes(PROVIDER_POLICIES.dbTransport.attribution), true);
    assert.equal(page.html.includes(PROVIDER_POLICIES.osrm.attribution), true);
    assert.equal(page.html.includes('data-itinerary-attribution'), true);
  });

  it('AC7 renders all four computed address timestamps', () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });

    assert.deepEqual(
      page.addressTimes.map((entry) => entry.split(': ')[0]),
      ['homeAddressWalkTime', 'homeAddressBikeTime', 'workAddressWalkTime', 'workAddressBikeTime']
    );
  });

  it('AC9 keeps UI terminology canonical', () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });

    for (const synonym of NON_CANONICAL_UI_SYNONYMS) {
      assert.equal(page.html.includes(synonym), false, `Unexpected synonym in UI output: ${synonym}`);
    }
  });

  it('AC10 renders a valid payload without missing-key placeholders', () => {
    const page = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });

    assert.equal(page.state, 'success');
    assert.equal(page.validationErrors.length, 0);
    assert.equal(page.html.includes('undefined'), false);
    assert.equal(page.html.includes('null'), false);
    assert.equal(page.html.includes('[missing'), false);
  });


  it('renders delayed fixture with explicit segment y attribution and shifted recommended start time', () => {
    const onTimePage = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: journeyWork });
    const delayedPage = renderItineraryPage({ direction: 'journeyWork', status: 'success', journey: delayedJourneyWork });

    assert.equal(delayedPage.state, 'delay-present');
    assert.ok(delayedPage.badges.includes('Delay present'));
    assert.ok(delayedPage.badges.includes('Segment y delay'));
    assert.ok(delayedPage.html.includes('Delay present on segment y (transportWork).'));
    assert.ok(delayedPage.html.includes('Recommended start time homeAddressWalkTime: 2026-04-10T05:36:00.000Z'));
    assert.ok(delayedPage.html.includes('shifted by segment y delay; anchored to homeStationTime 2026-04-10T05:57:00.000Z'));
    assert.equal(onTimePage.html.includes('Recommended start time homeAddressWalkTime'), false);
    assert.equal(onTimePage.html.includes('2026-04-10T05:31:00.000Z'), true);
    assert.equal(delayedPage.html.includes('2026-04-10T05:36:00.000Z'), true);
  });

});
