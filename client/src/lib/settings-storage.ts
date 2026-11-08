import { insertSettingsSchema } from "@shared/client-schema";
import type { InsertSettings } from "@shared/client-schema";

const SETTINGS_STORAGE_KEY = "pendelpilot.settings.v1";

export function isStorageAvailable(): boolean {
  try {
    const key = "__pp_storage_probe__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): InsertSettings | null {
  if (!isStorageAvailable()) {
    return null;
  }

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return insertSettingsSchema.parse(migrateSettings(parsed));
  } catch {
    return null;
  }
}

/**
 * Bring settings stored by older versions up to date.
 * - November 2026: the shared bike buffer became one bike buffer per side; both sides start from the old value
 *   once and are independent from then on. The shared walking buffer is gone (the leaving buffer of each side
 *   covers it) and is dropped.
 * - November 2026: buffers are stored in seconds (entered as mm:ss) instead of whole minutes.
 */
export function migrateSettings(stored: unknown): unknown {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return stored;
  const { walkBufferMinutes: _walk, bikeBufferMinutes, ...rest } = stored as Record<string, unknown>;
  const migrated: Record<string, unknown> = { ...rest };
  if (bikeBufferMinutes !== undefined) {
    migrated.homeBikeBufferMinutes ??= bikeBufferMinutes;
    migrated.workBikeBufferMinutes ??= bikeBufferMinutes;
  }
  for (const side of ["home", "work"]) {
    for (const [minutesField, secondsField] of [
      [`${side}LeavingBufferMinutes`, `${side}LeavingBufferSeconds`],
      [`${side}BikeBufferMinutes`, `${side}BikeBufferSeconds`],
      [`${side}BikeParkingMinutes`, `${side}BikeParkingSeconds`],
    ]) {
      const minutes = migrated[minutesField];
      delete migrated[minutesField];
      if (typeof minutes === "number" && migrated[secondsField] === undefined) migrated[secondsField] = minutes * 60;
    }
  }
  return migrated;
}

export function saveSettings(input: InsertSettings): InsertSettings {
  const validated = insertSettingsSchema.parse(input);

  if (!isStorageAvailable()) {
    throw new Error("Local storage is not available in this browser");
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(validated));
  return validated;
}

export function clearSettings(): void {
  if (!isStorageAvailable()) {
    return;
  }

  window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
}
