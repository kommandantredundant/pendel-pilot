import { useQuery } from "@tanstack/react-query";
import type { CommuteSuggestion, Station } from "@shared/routes";
import { loadSettings } from "@/lib/settings-storage";
import { ErrorFactory, isAppError } from "@/lib/app-error";
import { apiGet, apiPost } from "@/lib/api-client";

/** Number of connection options requested from /api/journeys/calculate. */
const JOURNEY_RESULTS = 5;

interface ApiStation {
  id: string;
  name?: string;
  lat: number;
  lon: number;
}

interface ApiTransportTiming {
  departureTime: string;
  arrivalTime: string;
  plannedDepartureTime?: string;
  plannedArrivalTime?: string;
  departureDelaySec?: number;
}

interface ApiCanonicalJourney {
  homeStation: ApiStation;
  workStation: ApiStation;
  transportWork?: ApiTransportTiming;
  transportHome?: ApiTransportTiming;
  routeHomeWalkSec: number;
  routeHomeBikeSec: number;
  routeWorkWalkSec: number;
  routeWorkBikeSec: number;
  homeAddressWalkTime: string;
  homeAddressBikeTime: string;
  workAddressWalkTime: string;
  workAddressBikeTime: string;
}

interface ApiJourneyOption {
  journey: ApiCanonicalJourney;
  lineName?: string;
  transfers?: number;
}

interface ApiCalculateResult {
  options: ApiJourneyOption[];
}

/**
 * Map a canonical backend journey onto the card model. For journeys to work the user leaves home,
 * for journeys home the user leaves work, so the "leave" times come from the matching address side.
 */
export function toCommuteSuggestion(option: ApiJourneyOption, destination: "work" | "home"): CommuteSuggestion {
  const j = option.journey;
  const transport = destination === "work" ? j.transportWork : j.transportHome;
  if (!transport) {
    throw ErrorFactory.transportInvalidResponse(new Error("Journey is missing its transport segment"));
  }
  const [origin, target] = destination === "work" ? [j.homeStation, j.workStation] : [j.workStation, j.homeStation];

  return {
    journey: {
      origin: origin.name ?? origin.id,
      destination: target.name ?? target.id,
      departure: transport.departureTime,
      arrival: transport.arrivalTime,
      delay: transport.departureDelaySec ? Math.round(transport.departureDelaySec / 60) : 0,
      plannedDeparture: transport.plannedDepartureTime ?? transport.departureTime,
      plannedArrival: transport.plannedArrivalTime ?? transport.arrivalTime,
      lineName: option.lineName ?? "",
    },
    walkTimeMinutes: Math.round((destination === "work" ? j.routeHomeWalkSec : j.routeWorkWalkSec) / 60),
    bikeTimeMinutes: Math.round((destination === "work" ? j.routeHomeBikeSec : j.routeWorkBikeSec) / 60),
    leaveHomeWalkTime: destination === "work" ? j.homeAddressWalkTime : j.workAddressWalkTime,
    leaveHomeBikeTime: destination === "work" ? j.homeAddressBikeTime : j.workAddressBikeTime,
    finalDestinationType: destination,
  };
}

export function useStationSearch(query: string) {
  return useQuery({
    queryKey: ["transport", "stations", query],
    queryFn: async (): Promise<Station[]> => {
      if (!query || query.length < 2) return [];

      const stations = await apiGet<ApiStation[]>("/api/stations/search", { query, limit: 10 }, "transport");
      return stations
        .filter((s) => s.id && s.name)
        .map((s) => ({ id: s.id, name: s.name!, location: { latitude: s.lat, longitude: s.lon } }));
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Calculate ISO8601 timestamp from HH:MM format
 * Uses Europe/Berlin timezone and handles today/tomorrow logic
 * @param timeString - Time in HH:MM format (24-hour)
 * @returns ISO8601 timestamp string
 */
function calculateIsoTimestamp(timeString: string): string {
  const [hours, minutes] = timeString.split(':').map(Number);
  
  // Get current time in Europe/Berlin timezone
  const now = new Date();
  const berlinTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  
  // Create a new date object for the selected time today
  const selectedDate = new Date(berlinTime);
  selectedDate.setHours(hours, minutes, 0, 0);
  
  // If the selected time has already passed today, use tomorrow's date
  if (selectedDate < berlinTime) {
    selectedDate.setDate(selectedDate.getDate() + 1);
  }
  
  // Convert to ISO8601 format
  return selectedDate.toISOString();
}

export async function fetchJourneys(
  destination: "work" | "home",
  timePlanning: "now" | "later" = "now",
  arrivalDeparture: "arrival" | "departure" = "arrival",
  selectedTime: string = ""
): Promise<CommuteSuggestion[]> {
  const settings = loadSettings();
  if (!settings) {
    throw ErrorFactory.settingsNotConfigured();
  }

  if (!settings.homeStationId || !settings.workStationId) {
    throw ErrorFactory.transportStationsNotSet();
  }

  if (settings.homeLat === undefined || settings.homeLon === undefined || settings.workLat === undefined || settings.workLon === undefined) {
    throw ErrorFactory.settingsNotConfigured(new Error("Addresses have not been located yet"));
  }

  const time =
    timePlanning === "later" && selectedTime
      ? { [arrivalDeparture === "departure" ? "departureTime" : "arrivalTime"]: calculateIsoTimestamp(selectedTime) }
      : { departureTime: new Date().toISOString() };

  try {
    const result = await apiPost<ApiCalculateResult>(
      "/api/journeys/calculate",
      {
        homeStationId: settings.homeStationId,
        workStationId: settings.workStationId,
        homeAddress: { latitude: settings.homeLat, longitude: settings.homeLon },
        workAddress: { latitude: settings.workLat, longitude: settings.workLon },
        direction: destination,
        ...time,
        results: JOURNEY_RESULTS,
        excludeLongDistance: settings.excludeFernverkehr === 1,
        buffers: {
          bufferLeaveHome: settings.homeLeavingBufferMinutes,
          bufferLeaveWork: settings.workLeavingBufferMinutes,
          bufferPrepareWalk: settings.walkBufferMinutes,
          bufferPrepareBike: settings.bikeBufferMinutes,
        },
      },
      "transport"
    );

    if (!result.options || result.options.length === 0) {
      throw ErrorFactory.transportNoJourneys();
    }

    return result.options.map((option) => toCommuteSuggestion(option, destination));
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw ErrorFactory.unknownError(error);
  }
}

export function useJourneys(
  destination: "work" | "home",
  timePlanning: "now" | "later" = "now",
  arrivalDeparture: "arrival" | "departure" = "arrival",
  selectedTime: string = ""
) {
  return useQuery({
    queryKey: ["transport", "journeys", destination, timePlanning, arrivalDeparture, selectedTime],
    queryFn: () => fetchJourneys(destination, timePlanning, arrivalDeparture, selectedTime),
    refetchInterval: 300000, // 5 minutes (reduced from 30 seconds)
    refetchIntervalInBackground: false, // Don't refetch when tab is inactive
  });
}

/**
 * Hook for journeys with manual refresh capability
 * Returns additional refresh function and lastUpdated timestamp
 */
export function useJourneysWithRefresh(
  destination: "work" | "home",
  timePlanning: "now" | "later" = "now",
  arrivalDeparture: "arrival" | "departure" = "arrival",
  selectedTime: string = ""
) {
  const query = useQuery({
    queryKey: ["transport", "journeys", destination, timePlanning, arrivalDeparture, selectedTime],
    queryFn: () => fetchJourneys(destination, timePlanning, arrivalDeparture, selectedTime),
    refetchInterval: 300000, // 5 minutes
    refetchIntervalInBackground: false,
  });

  return {
    ...query,
    refresh: () => query.refetch(),
    lastUpdated: query.dataUpdatedAt,
  };
}
