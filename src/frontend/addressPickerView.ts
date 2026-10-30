import { PROVIDER_POLICIES } from '../clients/providerCompliance.ts';
import { type AddressGeocodeResult } from '../clients/photon.client.ts';
import { type AddressGeocodeService } from '../services/addressGeocode.service.ts';
import { type Coordinates } from '../models/canonical.ts';
import { type CommuteProfile, type LocalAddress } from '../models/localPersistence.ts';

export type AddressSettingsFieldName = 'homeAddress' | 'workAddress';
export type AddressGeocodePickerState =
  | 'address-empty-query'
  | 'address-no-results'
  | 'address-geocode-error'
  | 'address-single-result'
  | 'address-multiple-results'
  | 'address-selected';
export type AddressCandidateKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export interface RenderedAddressCandidate {
  id: string;
  label: string;
  coordinates: Coordinates;
  metadata: string;
  selected: boolean;
  tabIndex: 0 | -1;
}

export interface RenderedAddressGeocodePicker {
  state: AddressGeocodePickerState;
  field: AddressSettingsFieldName;
  query: string;
  candidates: readonly RenderedAddressCandidate[];
  selectedCandidate?: RenderedAddressCandidate;
  selectedIndex: number;
  profile?: CommuteProfile;
  messages: readonly string[];
  actions: readonly string[];
  attributions: readonly string[];
  html: string;
}

export interface AddressGeocodeSearchInput {
  field: AddressSettingsFieldName;
  q: string;
  profile?: CommuteProfile;
  limit?: number;
  selectedIndex?: number;
}

export async function resolveAddressGeocodeSearch(
  service: AddressGeocodeService,
  input: AddressGeocodeSearchInput
): Promise<RenderedAddressGeocodePicker> {
  try {
    const candidates = await service.geocode({
      q: input.q,
      limit: input.limit,
      savedProfileAddress: input.profile ? { label: input.profile[input.field].label, coordinates: toCoordinates(input.profile[input.field]) } : undefined
    });

    if (candidates.length === 0) {
      return buildAddressGeocodePicker({
        state: 'address-no-results', field: input.field, query: input.q, candidates: [], selectedIndex: 0, profile: input.profile,
        messages: ['No address matches found. Try a more specific query.'], actions: []
      });
    }

    const state: AddressGeocodePickerState = candidates.length === 1 ? 'address-single-result' : 'address-multiple-results';
    const selectedIndex = clampSelectedIndex(input.selectedIndex ?? 0, candidates.length);
    return buildAddressGeocodePicker({
      state, field: input.field, query: input.q, candidates, selectedIndex, profile: input.profile,
      messages: candidates.length === 1 ? ['Confirm the matched address before saving.'] : ['Choose address'],
      actions: ['Use selected address']
    });
  } catch (error) {
    const isEmptyQuery = error instanceof RangeError;
    return buildAddressGeocodePicker({
      state: isEmptyQuery ? 'address-empty-query' : 'address-geocode-error', field: input.field, query: input.q,
      candidates: [], selectedIndex: 0, profile: input.profile,
      messages: [isEmptyQuery ? 'Address geocode query must not be empty.' : errorMessage(error)],
      actions: isEmptyQuery ? [] : ['Retry address search']
    });
  }
}

export function selectAddressGeocodeCandidate(
  profile: CommuteProfile,
  field: AddressSettingsFieldName,
  candidate: AddressGeocodeResult,
  updatedAt: string = new Date().toISOString()
): CommuteProfile {
  return {
    ...profile,
    [field]: { label: candidate.name, lat: candidate.coordinates.latitude, lon: candidate.coordinates.longitude },
    updatedAt
  };
}

export function renderSelectedAddressConfirmation(
  profile: CommuteProfile,
  field: AddressSettingsFieldName,
  candidate: AddressGeocodeResult
): RenderedAddressGeocodePicker {
  return buildAddressGeocodePicker({
    state: 'address-selected', field, query: candidate.name, candidates: [candidate], selectedIndex: 0,
    profile: selectAddressGeocodeCandidate(profile, field, candidate, profile.updatedAt),
    messages: [`Pinned: ${candidate.name}`], actions: []
  });
}

export function moveAddressCandidateFocus(candidateCount: number, activeIndex: number, key: AddressCandidateKey): number {
  if (candidateCount <= 0) return 0;
  const current = clampSelectedIndex(activeIndex, candidateCount);
  if (key === 'Home') return 0;
  if (key === 'End') return candidateCount - 1;
  if (key === 'ArrowDown') return (current + 1) % candidateCount;
  return (current - 1 + candidateCount) % candidateCount;
}

function buildAddressGeocodePicker(input: {
  state: AddressGeocodePickerState; field: AddressSettingsFieldName; query: string; candidates: readonly AddressGeocodeResult[];
  selectedIndex: number; profile?: CommuteProfile; messages: readonly string[]; actions: readonly string[];
}): RenderedAddressGeocodePicker {
  const selectedIndex = clampSelectedIndex(input.selectedIndex, input.candidates.length);
  const candidates = input.candidates.map((candidate, index): RenderedAddressCandidate => ({
    id: `${input.field}-candidate-${index}`, label: candidate.name, coordinates: candidate.coordinates,
    metadata: addressCandidateMetadata(candidate), selected: index === selectedIndex, tabIndex: index === selectedIndex ? 0 : -1
  }));
  const selectedCandidate = candidates[selectedIndex];
  const attributions = [PROVIDER_POLICIES.photon.attribution];
  const html = [
    `<section data-address-geocode-field="${input.field}" data-state="${input.state}" data-address-selected-index="${selectedIndex}" aria-live="polite">`,
    `<h2>${input.state === 'address-multiple-results' ? 'Choose address' : 'Address search'}</h2>`,
    `<p data-address-query>${input.query.trim()}</p>`, ...input.messages.map((message) => `<p>${message}</p>`),
    candidates.length > 0 ? `<div role="listbox" aria-label="Choose address" aria-activedescendant="${selectedCandidate?.id ?? ''}" data-address-candidates data-address-keyboard="ArrowUp ArrowDown Home End">${candidates.map((candidate) => `<button id="${candidate.id}" role="option" data-address-candidate="${candidate.id}" aria-label="Choose address ${candidate.label}, ${candidate.metadata}" aria-selected="${candidate.selected}" tabindex="${candidate.tabIndex}"><strong>${candidate.label}</strong><span>${candidate.metadata}</span></button>`).join('')}</div>` : '',
    ...input.actions.map((action) => `<button data-address-action="use-selected">${action}</button>`),
    selectedCandidate && input.state === 'address-selected' ? `<span data-address-confirmation>Pinned: ${selectedCandidate.label}</span>` : '',
    attributionListHtml(attributions, 'address-geocode-attribution'), '</section>'
  ].join('');
  return { state: input.state, field: input.field, query: input.query, candidates, selectedCandidate, selectedIndex, profile: input.profile, messages: input.messages, actions: input.actions, attributions, html };
}

function addressCandidateMetadata(candidate: AddressGeocodeResult): string {
  const locality = [candidate.city, candidate.state, candidate.country ?? candidate.countrycode].filter((value): value is string => typeof value === 'string' && value.length > 0).join(', ');
  const coordinates = `${formatCoordinate(candidate.coordinates.latitude)}, ${formatCoordinate(candidate.coordinates.longitude)}`;
  return locality ? `${locality} · ${coordinates}` : coordinates;
}
function formatCoordinate(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(5).replace(/0+$/, '').replace(/\.$/, ''); }
function clampSelectedIndex(index: number, candidateCount: number): number { return candidateCount <= 0 ? 0 : Math.min(Math.max(index, 0), candidateCount - 1); }
function toCoordinates(address: LocalAddress): Coordinates { return { latitude: address.lat, longitude: address.lon }; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Address geocode provider failed.'; }
function attributionListHtml(attributions: readonly string[], dataAttribute: string): string { return `<footer data-${dataAttribute}>${attributions.map((attribution) => `<p>${attribution}</p>`).join('')}</footer>`; }
