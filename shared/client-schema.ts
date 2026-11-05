import { z } from "zod";

/** Longest fixed way between address and platform, in seconds (3 h, like the longest routed walk). */
export const MAX_FIXED_SECONDS = 3 * 60 * 60;

/** Longest buffer, in seconds (60 min). */
export const MAX_BUFFER_SECONDS = 60 * 60;

const bufferSeconds = z.number().int().min(0).max(MAX_BUFFER_SECONDS).default(0);
const flag = z.number().int().min(0).max(1).default(0);
const fixedSeconds = z.number().int().min(0).max(MAX_FIXED_SECONDS).optional();

/**
 * Settings fields without cross-field rules. Home and work are different places, so every way-related value exists
 * once per side and is never shared between them (docs/decisions.md).
 */
export const settingsObjectSchema = z.object({
  id: z.number().optional(),
  // Not needed (and not geocoded) while both modes of that side use a fixed time; kept so it is back when unticked.
  homeAddress: z.string(),
  homeLat: z.number().optional(),
  homeLon: z.number().optional(),
  homeStationId: z.string().min(1, "Home station ID is required"),
  homeStationName: z.string().min(1, "Home station name is required"),
  // Fixed start/end point for walk/bike routes; set when a station is picked in the search.
  homeStationLat: z.number().optional(),
  homeStationLon: z.number().optional(),
  workAddress: z.string(),
  workLat: z.number().optional(),
  workLon: z.number().optional(),
  workStationId: z.string().min(1, "Work station ID is required"),
  workStationName: z.string().min(1, "Work station name is required"),
  workStationLat: z.number().optional(),
  workStationLon: z.number().optional(),
  // Flat <-> front door (stairs, lift); walking and cycling, both directions.
  homeLeavingBufferSeconds: bufferSeconds,
  workLeavingBufferSeconds: bufferSeconds,
  // Getting the bike out or putting it away; cycling only, both directions.
  homeBikeBufferSeconds: bufferSeconds,
  workBikeBufferSeconds: bufferSeconds,
  // Bike parking at the station <-> platform; cycling only, both directions.
  homeBikeParkingSeconds: bufferSeconds,
  workBikeParkingSeconds: bufferSeconds,
  // Fixed address <-> platform time per side and mode, replacing the route and that mode's buffers of that side.
  // The seconds stay stored while the flag is off, so ticking it again brings the value back.
  homeWalkFixed: flag,
  homeWalkFixedSeconds: fixedSeconds,
  homeBikeFixed: flag,
  homeBikeFixedSeconds: fixedSeconds,
  workWalkFixed: flag,
  workWalkFixedSeconds: fixedSeconds,
  workBikeFixed: flag,
  workBikeFixedSeconds: fixedSeconds,
  excludeFernverkehr: z.number().int().min(0).max(1).default(0),
  // Glance: compact mobile view that replaces the dashboards with a "leave in N min" countdown.
  glanceMode: z.number().int().min(0).max(1).default(0),
  // Plan: desktop view for planning ahead (timeline of several connections); only used on wide screens.
  planMode: z.number().int().min(0).max(1).default(0),
  // How you usually get to the station, per direction; "both" means you decide on the spot.
  stationModeFromHome: z.enum(["walk", "bike", "both"]).default("both"),
  stationModeFromWork: z.enum(["walk", "bike", "both"]).default("both"),
  language: z.enum(["en", "de"]).default("en"),

  // When homeAddress/workAddress were last resolved to coordinates via /api/addresses/geocode.
  // Walk/bike durations are calculated by the backend (OSRM) on every journey request.
  routingCalculatedAt: z.string().datetime().optional(),
  routingInputFingerprint: z.object({
    homeAddress: z.string(),
    workAddress: z.string(),
  }).optional(),
});

export type Side = "home" | "work";
export type SideMode = "walk" | "bike";

type FixedFields = Pick<
  z.infer<typeof settingsObjectSchema>,
  | "homeWalkFixed" | "homeWalkFixedSeconds" | "homeBikeFixed" | "homeBikeFixedSeconds"
  | "workWalkFixed" | "workWalkFixedSeconds" | "workBikeFixed" | "workBikeFixedSeconds"
>;

const FIXED_FIELDS = {
  home: { walk: ["homeWalkFixed", "homeWalkFixedSeconds"], bike: ["homeBikeFixed", "homeBikeFixedSeconds"] },
  work: { walk: ["workWalkFixed", "workWalkFixedSeconds"], bike: ["workBikeFixed", "workBikeFixedSeconds"] },
} as const;

/** The fixed time of one side and mode in seconds, or undefined while routing is used. */
export function fixedSecondsOf(settings: Partial<FixedFields>, side: Side, mode: SideMode): number | undefined {
  const [flagField, secondsField] = FIXED_FIELDS[side][mode];
  return settings[flagField] === 1 ? settings[secondsField] : undefined;
}

/** A side needs its address (and its coordinates) unless both of its modes use a fixed time. */
export function sideNeedsAddress(settings: Partial<FixedFields>, side: Side): boolean {
  const [walkFlag] = FIXED_FIELDS[side].walk;
  const [bikeFlag] = FIXED_FIELDS[side].bike;
  return settings[walkFlag] !== 1 || settings[bikeFlag] !== 1;
}

/** Cross-field rules: an address while a side still routes, and a time for every ticked fixed time. */
export function refineSettings(settings: Partial<z.infer<typeof settingsObjectSchema>>, ctx: z.RefinementCtx): void {
  for (const side of ["home", "work"] as const) {
    const addressField = side === "home" ? "homeAddress" : "workAddress";
    if (sideNeedsAddress(settings, side) && !settings[addressField]?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [addressField], message: `${side === "home" ? "Home" : "Work"} address is required` });
    }
    for (const mode of ["walk", "bike"] as const) {
      const [flagField, secondsField] = FIXED_FIELDS[side][mode];
      if (settings[flagField] === 1 && settings[secondsField] === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [secondsField], message: "Fixed time is required (mm:ss)" });
      }
    }
  }
}

export const settingsSchema = settingsObjectSchema.superRefine(refineSettings);

/**
 * Fields of the settings persisted in localStorage, without the cross-field rules (for extending in forms)
 */
export const insertSettingsObjectSchema = settingsObjectSchema.omit({
  id: true,
});

/**
 * Schema for settings persisted in localStorage
 */
export const insertSettingsSchema = insertSettingsObjectSchema.superRefine(refineSettings);

/**
 * Schema for selecting settings (includes all fields)
 */
export const selectSettingsSchema = settingsSchema;

/**
 * TypeScript types derived from Zod schemas
 */
export type Settings = z.infer<typeof settingsSchema>;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type SelectSettings = z.infer<typeof selectSettingsSchema>;
