import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InsertSettings } from "@shared/client-schema";
import { loadSettings, saveSettings } from "@/lib/settings-storage";
import { resolveAddressCoordinates } from "@/lib/address-coordinates";
import { isAppError } from "@/lib/app-error";
import type { Language } from "@/lib/i18n";

/** Localised text for a failed save; app errors explain themselves instead of showing their type id. */
export function saveErrorMessage(error: unknown, language: Language): string {
  if (isAppError(error)) {
    const detail = error.getTechnicalDetail();
    return `${error.getWhatIsWrong(language)}. ${error.getWhatToCheck(language)}.${detail ? ` (${detail})` : ""}`;
  }
  const fallback = language === "de" ? "Speichern fehlgeschlagen" : "Saving failed";
  return error instanceof Error && error.message ? `${fallback}: ${error.message}` : fallback;
}

const SETTINGS_QUERY_KEY = ["local-settings"];

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => loadSettings(),
  });
}

/**
 * Save the profile: geocode changed addresses (backend Photon lookup), then store it locally. `force` looks up both
 * addresses again even if unchanged ("Recalculate routes"). The mutation settles only after both steps, so callers
 * report what really happened; a failed lookup leaves the stored profile untouched. No toasts: the settings page
 * saves automatically and shows the state itself.
 */
export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ settings, force = false }: { settings: InsertSettings; force?: boolean }) => {
      const coordinates = await resolveAddressCoordinates(settings, loadSettings(), force);
      return saveSettings({ ...settings, ...coordinates });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}
