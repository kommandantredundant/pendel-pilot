import { geocodeAddress } from './geocoding-service';
import { ErrorFactory, isAppError } from './app-error';
import { sideNeedsAddress, type InsertSettings, type Side } from '@shared/client-schema';

/** An address farther than this from the station picked for that place is treated as a wrong match. */
export const MAX_ADDRESS_STATION_KM = 100;

type AddressCoordinates = Pick<
  InsertSettings,
  | 'homeLat' | 'homeLon' | 'workLat' | 'workLon' | 'routingCalculatedAt' | 'routingInputFingerprint'
  | 'homeAddressLabel' | 'workAddressLabel'
>;

interface SideCoordinates {
  lat: number | undefined;
  lon: number | undefined;
  /** The address these coordinates belong to. */
  address: string;
  /** What the lookup found for it. */
  label: string | undefined;
  geocoded: boolean;
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Resolve home and work addresses to coordinates for /api/journeys/calculate.
 * Geocoding only runs for a side whose address changed since the last save (or when `force` is set), and never for a
 * side whose walk and bike times are both fixed: that side is not routed, so its address is not needed.
 * The lookup prefers matches near that side's station, and a match more than MAX_ADDRESS_STATION_KM from it is
 * rejected (also for kept coordinates, so picking a far station flags the address too). Errors name the address field.
 * Walk/bike durations are calculated by the backend on every journey request.
 */
export async function resolveAddressCoordinates(
  settings: InsertSettings,
  existingSettings?: InsertSettings | null,
  force = false
): Promise<AddressCoordinates> {
  // One after the other: the public Photon instance asks for moderate use and refuses bursts.
  const home = await resolveSide('home', settings, existingSettings, force);
  const work = await resolveSide('work', settings, existingSettings, force);

  return {
    homeLat: home.lat,
    homeLon: home.lon,
    workLat: work.lat,
    workLon: work.lon,
    homeAddressLabel: home.label,
    workAddressLabel: work.label,
    routingCalculatedAt:
      home.geocoded || work.geocoded ? new Date().toISOString() : existingSettings?.routingCalculatedAt,
    routingInputFingerprint: { homeAddress: home.address, workAddress: work.address },
  };
}

async function resolveSide(
  side: Side,
  settings: InsertSettings,
  existingSettings: InsertSettings | null | undefined,
  force: boolean
): Promise<SideCoordinates> {
  const addressField = side === 'home' ? 'homeAddress' : 'workAddress';
  try {
    return await lookUpSide(side, settings, existingSettings, force);
  } catch (error) {
    throw isAppError(error) ? error.forField(addressField) : error;
  }
}

async function lookUpSide(
  side: Side,
  settings: InsertSettings,
  existingSettings: InsertSettings | null | undefined,
  force: boolean
): Promise<SideCoordinates> {
  const address = side === 'home' ? settings.homeAddress : settings.workAddress;
  const stationLat = side === 'home' ? settings.homeStationLat : settings.workStationLat;
  const stationLon = side === 'home' ? settings.homeStationLon : settings.workStationLon;
  const station = stationLat !== undefined && stationLon !== undefined ? { lat: stationLat, lon: stationLon } : undefined;
  const stationName = side === 'home' ? settings.homeStationName : settings.workStationName;
  const existing: SideCoordinates = {
    lat: side === 'home' ? existingSettings?.homeLat : existingSettings?.workLat,
    lon: side === 'home' ? existingSettings?.homeLon : existingSettings?.workLon,
    address:
      (side === 'home'
        ? existingSettings?.routingInputFingerprint?.homeAddress
        : existingSettings?.routingInputFingerprint?.workAddress) ?? '',
    label: side === 'home' ? existingSettings?.homeAddressLabel : existingSettings?.workAddressLabel,
    geocoded: false,
  };

  // Not routed: keep whatever was resolved before, so unticking the fixed times needs no new lookup for the same address.
  if (!sideNeedsAddress(settings, side)) return existing;

  if (!force && existing.address === address && existing.lat !== undefined && existing.lon !== undefined) {
    checkDistance({ lat: existing.lat, lon: existing.lon }, existing.label ?? address, station, stationName);
    return existing;
  }

  const point = await geocodeAddress(address, undefined, station);
  checkDistance(point, point.label, station, stationName);
  return { lat: point.lat, lon: point.lon, address, label: point.label, geocoded: true };
}

function checkDistance(
  point: { lat: number; lon: number },
  label: string,
  station: { lat: number; lon: number } | undefined,
  stationName: string
): void {
  if (!station) return;
  const km = distanceKm(point, station);
  if (km > MAX_ADDRESS_STATION_KM) {
    throw ErrorFactory.geocodingTooFar(new Error(`${label}: ${Math.round(km).toLocaleString('de-DE')} km → ${stationName}`));
  }
}
