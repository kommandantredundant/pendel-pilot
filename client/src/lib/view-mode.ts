/**
 * Which dashboard view a profile asks for and which one a device can show.
 *
 * The profile stores one choice (classic, Glance or Planner) in two flags for compatibility with older
 * profiles. Phones (detected from the user agent) never offer Planner; other devices show it from
 * PLAN_MIN_WIDTH and fall back to the classic view in narrower windows (portrait tablets, half-width windows).
 */

/** Plan needs room for the timeline: Tailwind's `lg` breakpoint. */
export const PLAN_MIN_WIDTH = 1024;

export type ViewChoice = "classic" | "glance" | "plan";

interface ModeFlags {
  glanceMode?: number;
  planMode?: number;
}

/**
 * Phones only: Android phones carry "Mobile" (tablets do not), iPhones "iPhone". iPads report as a Mac
 * and count as non-mobile, so they get Planner in landscape. `uaDataMobile` (Chromium's client hint)
 * wins when the browser provides it.
 */
export function isMobileUserAgent(userAgent: string, uaDataMobile?: boolean): boolean {
  if (typeof uaDataMobile === "boolean") return uaDataMobile;
  return /\b(iPhone|iPod)\b|Android.*\bMobile\b|\bMobi\b|Windows Phone/i.test(userAgent);
}

/** Device class of this browser; fixed for the page's lifetime. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return isMobileUserAgent(navigator.userAgent ?? "", uaData?.mobile);
}

/**
 * The stored choice as this device can offer it. Profiles from before the single choice may have both
 * flags set (Glance on the phone, Planner at the desk); a phone keeps showing Glance for those.
 */
export function storedChoice(settings: ModeFlags | null | undefined, mobile: boolean): ViewChoice {
  if (!mobile && settings?.planMode === 1) return "plan";
  if (settings?.glanceMode === 1) return "glance";
  return "classic";
}

/** The view actually shown: Planner needs a non-mobile device and a wide window, else classic. */
export function resolveView(choice: ViewChoice, device: { mobile: boolean; wide: boolean }): ViewChoice {
  if (choice === "plan" && (device.mobile || !device.wide)) return "classic";
  return choice;
}

/** Flags to store for a choice; the two views exclude each other. */
export function choiceFlags(choice: ViewChoice): { glanceMode: number; planMode: number } {
  return { glanceMode: choice === "glance" ? 1 : 0, planMode: choice === "plan" ? 1 : 0 };
}
