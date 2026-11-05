import { geocodeAddress } from './geocoding-service';
import { sideNeedsAddress, type InsertSettings, type Side } from '@shared/client-schema';

type AddressCoordinates = Pick<
  InsertSettings,
  'homeLat' | 'homeLon' | 'workLat' | 'workLon' | 'routingCalculatedAt' | 'routingInputFingerprint'
>;

interface SideCoordinates {
  lat: number | undefined;
  lon: number | undefined;
  /** The address these coordinates belong to. */
  address: string;
  geocoded: boolean;
}

/**
 * Resolve home and work addresses to coordinates for /api/journeys/calculate.
 * Geocoding only runs for a side whose address changed since the last save (or when `force` is set), and never for a
 * side whose walk and bike times are both fixed: that side is not routed, so its address is not needed.
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
  const address = side === 'home' ? settings.homeAddress : settings.workAddress;
  const existing = {
    lat: side === 'home' ? existingSettings?.homeLat : existingSettings?.workLat,
    lon: side === 'home' ? existingSettings?.homeLon : existingSettings?.workLon,
    address:
      (side === 'home'
        ? existingSettings?.routingInputFingerprint?.homeAddress
        : existingSettings?.routingInputFingerprint?.workAddress) ?? '',
    geocoded: false,
  };

  // Not routed: keep whatever was resolved before, so unticking the fixed times needs no new lookup for the same address.
  if (!sideNeedsAddress(settings, side)) return existing;

  if (!force && existing.address === address && existing.lat !== undefined && existing.lon !== undefined) {
    return existing;
  }

  const point = await geocodeAddress(address);
  return { lat: point.lat, lon: point.lon, address, geocoded: true };
}
