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
    return insertSettingsSchema.parse(parsed);
  } catch {
    return null;
  }
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
