import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InsertSettings } from "@shared/client-schema";
import { useToast } from "@/hooks/use-toast";
import { loadSettings, saveSettings } from "@/lib/settings-storage";
import { resolveAddressCoordinates } from "@/lib/address-coordinates";

const SETTINGS_QUERY_KEY = ["local-settings"];
const DEBOUNCE_MS = 1000;

interface PendingSettingsRequest {
  requestId: string;
  timestamp: number;
  settings: InsertSettings;
  abortController: AbortController;
}

let pendingRequest: PendingSettingsRequest | null = null;

/**
 * Debounce function for settings save operations
 */
function debounceSettingsSave(callback: (settings: InsertSettings, requestId: string) => void) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (settings: InsertSettings, requestId: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      callback(settings, requestId);
      timeoutId = null;
    }, DEBOUNCE_MS);
  };
}

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => loadSettings(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const executeSave = debounceSettingsSave(async (settings: InsertSettings, requestId: string) => {
    const abortController = new AbortController();
    
    // Cancel any previous request
    if (pendingRequest && pendingRequest.requestId !== requestId) {
      pendingRequest.abortController.abort();
    }

    pendingRequest = {
      requestId,
      timestamp: Date.now(),
      settings,
      abortController,
    };

    try {
      // Resolve address coordinates before saving (only re-geocodes changed addresses)
      const coordinates = await resolveAddressCoordinates(settings, loadSettings());

      await saveSettings({ ...settings, ...coordinates });
      
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      toast({
        title: "Settings saved",
        description: "Your commute preferences have been updated successfully.",
      });
    } catch (error) {
      if (!abortController.signal.aborted) {
        toast({
          title: "Error saving settings",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      if (pendingRequest?.requestId === requestId) {
        pendingRequest = null;
      }
    }
  });

  return useMutation({
    mutationFn: async (settings: InsertSettings) => {
      const requestId = `save-${Date.now()}-${Math.random()}`;
      await executeSave(settings, requestId);
      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      toast({
        title: "Settings saved",
        description: "Your commute preferences have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  });
}
