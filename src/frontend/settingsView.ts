import {
  type BufferSettings,
  type CommuteProfile,
  validateBufferSettings,
  validateCommuteProfile
} from '../models/localPersistence.ts';

export const BUFFER_SETTINGS_FIELD_NAMES = [
  'bufferInsideHomeStationMin',
  'bufferInsideWorkStationMin',
  'bufferLeaveHomeMin',
  'bufferLeaveWorkMin',
  'bufferPrepareWalkMin',
  'bufferPrepareBikeMin'
] as const satisfies readonly (keyof BufferSettings)[];

export type BufferSettingsFieldName = (typeof BUFFER_SETTINGS_FIELD_NAMES)[number];
export type SettingsUiState = 'settings-ready' | 'settings-validation-failure';

export interface RenderedSettingsAddress {
  name: 'homeAddress' | 'workAddress';
  label?: string;
  lat: number;
  lon: number;
}

export interface RenderedSettingsStation {
  name: 'homeStation' | 'workStation';
  id: string;
  label: string;
  lat: number;
  lon: number;
}

export interface RenderedSettingsBufferField {
  name: BufferSettingsFieldName;
  value: number;
}

export interface RenderedSettingsPage {
  state: SettingsUiState;
  title: 'settings';
  profile?: CommuteProfile;
  bufferSettings?: BufferSettings;
  addresses: readonly RenderedSettingsAddress[];
  stations: readonly RenderedSettingsStation[];
  bufferFields: readonly RenderedSettingsBufferField[];
  validationErrors: readonly string[];
  html: string;
}

export interface SettingsRenderInput {
  profile: unknown;
  bufferSettings: unknown;
}

export interface CommuteSettingsPersistenceStore {
  readCommute(): { profile: CommuteProfile; bufferSettings: BufferSettings } | undefined;
  saveCommute(commute: { profile: CommuteProfile; bufferSettings: BufferSettings }): void;
}

export interface CommuteSettingsRecord {
  profile?: CommuteProfile;
  bufferSettings?: BufferSettings;
}

export function renderSettingsPage(input: SettingsRenderInput): RenderedSettingsPage {
  const profileResult = validateCommuteProfile(input.profile);
  const bufferResult = validateBufferSettings(input.bufferSettings);
  const validationErrors = [
    ...formatResultErrors('profile', profileResult.errors),
    ...formatResultErrors('bufferSettings', bufferResult.errors),
  ];

  if (!profileResult.success || !profileResult.data || !bufferResult.success || !bufferResult.data) {
    return buildSettingsPage({
      state: 'settings-validation-failure',
      validationErrors,
      profile: profileResult.data,
      bufferSettings: bufferResult.data
    });
  }

  return buildSettingsPage({
    state: 'settings-ready',
    validationErrors: [],
    profile: profileResult.data,
    bufferSettings: bufferResult.data
  });
}

export function editBufferSettingsValue(
  preset: BufferSettings,
  field: BufferSettingsFieldName,
  value: number,
): BufferSettings {
  return { ...preset, [field]: value };
}

export function writeCommuteSettings(store: CommuteSettingsPersistenceStore, settings: Required<CommuteSettingsRecord>): void {
  store.saveCommute({ profile: settings.profile, bufferSettings: settings.bufferSettings });
}

export function readCommuteSettings(store: CommuteSettingsPersistenceStore): CommuteSettingsRecord {
  const commute = store.readCommute();
  return commute ? { profile: commute.profile, bufferSettings: commute.bufferSettings } : {};
}

function buildSettingsPage(input: {
  state: SettingsUiState;
  profile?: CommuteProfile;
  bufferSettings?: BufferSettings;
  validationErrors: readonly string[];
}): RenderedSettingsPage {
  const addresses = input.profile
    ? ([
        { name: 'homeAddress', ...input.profile.homeAddress },
        { name: 'workAddress', ...input.profile.workAddress }
      ] satisfies RenderedSettingsAddress[])
    : [];
  const stations = input.profile
    ? ([
        { name: 'homeStation', id: input.profile.homeStation.id, label: input.profile.homeStation.name, lat: input.profile.homeStation.lat, lon: input.profile.homeStation.lon },
        { name: 'workStation', id: input.profile.workStation.id, label: input.profile.workStation.name, lat: input.profile.workStation.lat, lon: input.profile.workStation.lon }
      ] satisfies RenderedSettingsStation[])
    : [];
  const bufferFields = input.bufferSettings
    ? BUFFER_SETTINGS_FIELD_NAMES.map((name) => ({ name, value: input.bufferSettings?.[name] ?? 0 }))
    : [];
  const html = [
    `<main data-page="/settings" data-state="${input.state}">`,
    '<h1>settings</h1>',
    input.profile ? `<section data-settings-profile="${input.profile.id}"><h2>${input.profile.name}</h2></section>` : '',
    `<dl data-settings-addresses>${addresses.map((address) => `<div data-field="${address.name}">${address.name}: ${address.label ?? ''} ${address.lat},${address.lon}</div>`).join('')}</dl>`,
    `<dl data-settings-stations>${stations.map((station) => `<div data-field="${station.name}">${station.name}: ${station.id} ${station.label} ${station.lat},${station.lon}</div>`).join('')}</dl>`,
    `<fieldset data-settings-buffers>${bufferFields.map((field) => `<label>${field.name}<input name="${field.name}" type="number" value="${field.value}"></label>`).join('')}</fieldset>`,
    ...input.validationErrors.map((error) => `<strong data-validation-error>${error}</strong>`),
    '</main>'
  ].join('');

  return {
    state: input.state,
    title: 'settings',
    profile: input.profile,
    bufferSettings: input.bufferSettings,
    addresses,
    stations,
    bufferFields,
    validationErrors: input.validationErrors,
    html
  };
}

function formatResultErrors(prefix: string, errors: readonly { field: string; message: string }[] | undefined): string[] {
  return (errors ?? []).map((error) => `${prefix}.${error.field}: ${error.message}`);
}
