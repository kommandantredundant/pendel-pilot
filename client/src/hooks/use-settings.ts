import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InsertSettings } from "@shared/client-schema";
import { useToast } from "@/hooks/use-toast";
import { loadSettings, saveSettings } from "@/lib/settings-storage";
import { resolveAddressCoordinates } from "@/lib/address-coordinates";
import { isAppError } from "@/lib/app-error";
import type { Language } from "@/lib/i18n";

/** Localised toast text for a failed save; app errors explain themselves instead of showing their type id. */
function saveErrorToast(error: unknown, language: Language): { title: string; description: string } {
  if (isAppError(error)) {
    const detail = error.getTechnicalDetail();
    return {
      title: error.getTitle(language),
      description: `${error.getWhatIsWrong(language)}. ${error.getWhatToCheck(language)}.${detail ? ` (${detail})` : ""}`,
    };
  }
  return {
    title: language === "de" ? "Speichern fehlgeschlagen" : "Error saving settings",
    description: error instanceof Error ? error.message : "Unknown error",
  };
}

const SETTINGS_QUERY_KEY = ["local-settings"];

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => loadSettings(),
  });
}

/**
 * Save the profile: geocode changed addresses (backend Photon lookup), then store it locally.
 * The mutation settles only after both steps, so callers and toasts report what really happened;
 * a failed lookup leaves the stored profile untouched.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: InsertSettings) => {
      const coordinates = await resolveAddressCoordinates(settings, loadSettings());
      return saveSettings({ ...settings, ...coordinates });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      toast({
        title: saved.language === "de" ? "Einstellungen gespeichert" : "Settings saved",
        description:
          saved.language === "de"
            ? "Deine Pendelstrecke wurde aktualisiert."
            : "Your commute preferences have been updated successfully.",
      });
    },
    onError: (error, settings) => {
      toast({ ...saveErrorToast(error, (settings.language as Language) ?? "en"), variant: "destructive" });
    },
  });
}
