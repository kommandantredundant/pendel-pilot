import { z } from "zod";

/**
 * Base settings schema with all fields
 */
export const settingsSchema = z.object({
  id: z.number().optional(),
  homeAddress: z.string().min(1, "Home address is required"),
  homeLat: z.number().optional(),
  homeLon: z.number().optional(),
  homeStationId: z.string().min(1, "Home station ID is required"),
  homeStationName: z.string().min(1, "Home station name is required"),
  workAddress: z.string().min(1, "Work address is required"),
  workLat: z.number().optional(),
  workLon: z.number().optional(),
  workStationId: z.string().min(1, "Work station ID is required"),
  workStationName: z.string().min(1, "Work station name is required"),
  walkBufferMinutes: z.number().int().min(0).max(60).default(0),
  bikeBufferMinutes: z.number().int().min(0).max(60).default(0),
  homeLeavingBufferMinutes: z.number().int().min(0).max(60).default(0),
  workLeavingBufferMinutes: z.number().int().min(0).max(60).default(0),
  excludeFernverkehr: z.number().int().min(0).max(1).default(0),
  language: z.enum(["en", "de"]).default("en"),

  // When homeAddress/workAddress were last resolved to coordinates via /api/addresses/geocode.
  // Walk/bike durations are calculated by the backend (OSRM) on every journey request.
  routingCalculatedAt: z.string().datetime().optional(),
  routingInputFingerprint: z.object({
    homeAddress: z.string(),
    workAddress: z.string(),
  }).optional(),
});

/**
 * Schema for settings persisted in localStorage
 */
export const insertSettingsSchema = settingsSchema.omit({
  id: true,
});

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
