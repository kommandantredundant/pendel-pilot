import { geocodeAddress } from './geocoding-service';
import type { InsertSettings } from '@shared/client-schema';

type AddressCoordinates = Pick<
  InsertSettings,
  'homeLat' | 'homeLon' | 'workLat' | 'workLon' | 'routingCalculatedAt' | 'routingInputFingerprint'
>;

/**
 * Resolve home and work addresses to coordinates for /api/journeys/calculate.
 * Geocoding only runs when an address changed since the last save (or `force` is set);
 * walk/bike durations are calculated by the backend on every journey request.
 */
export async function resolveAddressCoordinates(
  settings: InsertSettings,
  existingSettings?: InsertSettings | null,
  force = false
): Promise<AddressCoordinates> {
  const fingerprint = existingSettings?.routingInputFingerprint;
  const unchanged =
    !force &&
    fingerprint?.homeAddress === settings.homeAddress &&
    fingerprint?.workAddress === settings.workAddress &&
    existingSettings?.homeLat !== undefined &&
    existingSettings?.workLat !== undefined;

  if (unchanged) {
    return {
      homeLat: existingSettings.homeLat,
      homeLon: existingSettings.homeLon,
      workLat: existingSettings.workLat,
      workLon: existingSettings.workLon,
      routingCalculatedAt: existingSettings.routingCalculatedAt,
      routingInputFingerprint: fingerprint,
    };
  }

  const [home, work] = await Promise.all([geocodeAddress(settings.homeAddress), geocodeAddress(settings.workAddress)]);

  return {
    homeLat: home.lat,
    homeLon: home.lon,
    workLat: work.lat,
    workLon: work.lon,
    routingCalculatedAt: new Date().toISOString(),
    routingInputFingerprint: { homeAddress: settings.homeAddress, workAddress: settings.workAddress },
  };
}
