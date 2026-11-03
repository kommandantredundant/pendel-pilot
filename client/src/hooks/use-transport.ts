import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CommuteSuggestion, Station } from "@shared/routes";
import { loadSettings } from "@/lib/settings-storage";
import { ErrorFactory, isAppError } from "@/lib/app-error";
import { apiGet, apiPost } from "@/lib/api-client";

/** Transitous returns no stops for one- or two-letter prefixes. */
export const STATION_SEARCH_MIN_CHARS = 3;

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

interface ApiTransportLeg {
  lineName: string;
  departureTime: string;
  plannedDepartureTime?: string;
  departureDelaySec?: number;
  departurePlatform?: string;
  plannedDeparturePlatform?: string;
  arrivalTime?: string;
  plannedArrivalTime?: string;
  departureStopName?: string;
  arrivalStopName?: string;
}

interface ApiJourneyOption {
  journey: ApiCanonicalJourney;
  legs?: ApiTransportLeg[];
  lineName?: string;
  transfers?: number;
  departurePlatform?: string;
  plannedDeparturePlatform?: string;
}

interface ApiCalculateResult {
  options: ApiJourneyOption[];
}

/**
 * Map a canonical backend journey onto the card model. For journeys to work the user leaves home,
 * for journeys home the user leaves work, so the "leave" times come from the matching address side
 * and the "arrive" times from the opposite one.
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
      legs: (option.legs?.length
        ? option.legs
        : [
            {
              lineName: option.lineName ?? "",
              departureTime: transport.departureTime,
              plannedDepartureTime: transport.plannedDepartureTime,
              departureDelaySec: transport.departureDelaySec,
              departurePlatform: option.departurePlatform,
              plannedDeparturePlatform: option.plannedDeparturePlatform,
              arrivalTime: transport.arrivalTime,
              plannedArrivalTime: transport.plannedArrivalTime,
            },
          ]
      ).map((leg) => ({
        lineName: leg.lineName,
        departure: leg.departureTime,
        plannedDeparture: leg.plannedDepartureTime ?? leg.departureTime,
        delay: leg.departureDelaySec === undefined ? null : Math.round(leg.departureDelaySec / 60),
        ...(leg.departurePlatform ? { platform: leg.departurePlatform } : {}),
        ...(leg.plannedDeparturePlatform ? { plannedPlatform: leg.plannedDeparturePlatform } : {}),
        ...(leg.arrivalTime ? { arrival: leg.arrivalTime } : {}),
        ...(leg.plannedArrivalTime ? { plannedArrival: leg.plannedArrivalTime } : {}),
        ...(leg.departureStopName ? { origin: leg.departureStopName } : {}),
        ...(leg.arrivalStopName ? { destination: leg.arrivalStopName } : {}),
      })),
    },
    walkTimeMinutes: Math.round((destination === "work" ? j.routeHomeWalkSec : j.routeWorkWalkSec) / 60),
    bikeTimeMinutes: Math.round((destination === "work" ? j.routeHomeBikeSec : j.routeWorkBikeSec) / 60),
    leaveHomeWalkTime: destination === "work" ? j.homeAddressWalkTime : j.workAddressWalkTime,
    leaveHomeBikeTime: destination === "work" ? j.homeAddressBikeTime : j.workAddressBikeTime,
    arriveWalkMinutes: Math.round((destination === "work" ? j.routeWorkWalkSec : j.routeHomeWalkSec) / 60),
    arriveBikeMinutes: Math.round((destination === "work" ? j.routeWorkBikeSec : j.routeHomeBikeSec) / 60),
    arriveWalkTime: destination === "work" ? j.workAddressWalkTime : j.homeAddressWalkTime,
    arriveBikeTime: destination === "work" ? j.workAddressBikeTime : j.homeAddressBikeTime,
    finalDestinationType: destination,
  };
}

export function useStationSearch(query: string) {
  return useQuery({
    queryKey: ["transport", "stations", query],
    queryFn: async (): Promise<Station[]> => {
      if (!query || query.length < STATION_SEARCH_MIN_CHARS) return [];

      const stations = await apiGet<ApiStation[]>("/api/stations/search", { query, limit: 10 }, "transport");
      return stations
        .filter((s) => s.id && s.name)
        .map((s) => ({ id: s.id, name: s.name!, location: { latitude: s.lat, longitude: s.lon } }));
    },
    enabled: query.length >= STATION_SEARCH_MIN_CHARS,
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

/** Station coordinates exist only for stations picked since they were stored; older profiles omit them. */
function stationLocation(field: string, latitude: number | undefined, longitude: number | undefined) {
  return latitude !== undefined && longitude !== undefined ? { [field]: { latitude, longitude } } : {};
}

/** Time anchor for a journey search: now, or a fixed departure/arrival instant (ISO 8601). */
export type JourneyAnchor = { kind: "now" } | { kind: "departure" | "arrival"; time: string };

export interface FetchJourneyOptions {
  results?: number;
  /** Overrides the saved "exclude long-distance trains" preference. */
  excludeLongDistance?: boolean;
}

export async function fetchJourneys(
  destination: "work" | "home",
  timePlanning: "now" | "later" = "now",
  arrivalDeparture: "arrival" | "departure" = "arrival",
  selectedTime: string = ""
): Promise<CommuteSuggestion[]> {
  const anchor: JourneyAnchor =
    timePlanning === "later" && selectedTime
      ? { kind: arrivalDeparture, time: calculateIsoTimestamp(selectedTime) }
      : { kind: "now" };
  return fetchJourneysAt(destination, anchor);
}

export async function fetchJourneysAt(
  destination: "work" | "home",
  anchor: JourneyAnchor,
  options: FetchJourneyOptions = {}
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
    anchor.kind === "now"
      ? { departureTime: new Date().toISOString() }
      : { [anchor.kind === "departure" ? "departureTime" : "arrivalTime"]: anchor.time };

  try {
    const result = await apiPost<ApiCalculateResult>(
      "/api/journeys/calculate",
      {
        homeStationId: settings.homeStationId,
        workStationId: settings.workStationId,
        homeAddress: { latitude: settings.homeLat, longitude: settings.homeLon },
        workAddress: { latitude: settings.workLat, longitude: settings.workLon },
        ...stationLocation("homeStationLocation", settings.homeStationLat, settings.homeStationLon),
        ...stationLocation("workStationLocation", settings.workStationLat, settings.workStationLon),
        direction: destination,
        ...time,
        results: options.results ?? JOURNEY_RESULTS,
        excludeLongDistance: options.excludeLongDistance ?? settings.excludeFernverkehr === 1,
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

/** Most options the backend returns per request; the planning view shows as many as it can. */
const PLAN_RESULTS = 6;

/**
 * Journeys for the desktop planning view: explicit time anchor (paging moves it) and long-distance filter,
 * keeping the previous list on screen while the next page loads.
 */
export function usePlanJourneys(destination: "work" | "home", anchor: JourneyAnchor, excludeLongDistance: boolean) {
  const query = useQuery({
    queryKey: ["transport", "plan", destination, anchor, excludeLongDistance],
    queryFn: () => fetchJourneysAt(destination, anchor, { results: PLAN_RESULTS, excludeLongDistance }),
    placeholderData: keepPreviousData,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });

  return {
    ...query,
    refresh: () => query.refetch(),
    lastUpdated: query.dataUpdatedAt,
  };
}
