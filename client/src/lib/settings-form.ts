import { z } from "zod";
import { insertSettingsObjectSchema, MAX_BUFFER_SECONDS, refineSettings } from "@shared/client-schema";

// No default here: an unreadable mm:ss entry arrives as undefined and must block saving instead of becoming 0.
const bufferSeconds = z.number().int().min(0).max(MAX_BUFFER_SECONDS);


/** The settings form: the stored settings, with numeric inputs coerced from their text values (buffers and fixed times are mm:ss inputs that report seconds). */
export const settingsFormSchema = insertSettingsObjectSchema
  .extend({
    homeLeavingBufferSeconds: bufferSeconds,
    workLeavingBufferSeconds: bufferSeconds,
    homeBikeBufferSeconds: bufferSeconds,
    workBikeBufferSeconds: bufferSeconds,
    homeBikeParkingSeconds: bufferSeconds,
    workBikeParkingSeconds: bufferSeconds,
    excludeFernverkehr: z.coerce.number().min(0).max(1),
    glanceMode: z.coerce.number().min(0).max(1),
    planMode: z.coerce.number().min(0).max(1),
    stationModeFromHome: z.enum(["walk", "bike", "both"]),
    stationModeFromWork: z.enum(["walk", "bike", "both"]),
    language: z.enum(["en", "de"]).default("en"),
  })
  .superRefine(refineSettings);

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

/** Form field names of one side; home and work never share a field. */
export const SIDE_FIELDS = {
  home: {
    address: "homeAddress",
    stationId: "homeStationId",
    stationName: "homeStationName",
    stationLat: "homeStationLat",
    stationLon: "homeStationLon",
    stationMode: "stationModeFromHome",
    leaving: "homeLeavingBufferSeconds",
    bike: "homeBikeBufferSeconds",
    bikeParking: "homeBikeParkingSeconds",
    walkFixed: "homeWalkFixed",
    walkFixedSeconds: "homeWalkFixedSeconds",
    bikeFixed: "homeBikeFixed",
    bikeFixedSeconds: "homeBikeFixedSeconds",
  },
  work: {
    address: "workAddress",
    stationId: "workStationId",
    stationName: "workStationName",
    stationLat: "workStationLat",
    stationLon: "workStationLon",
    stationMode: "stationModeFromWork",
    leaving: "workLeavingBufferSeconds",
    bike: "workBikeBufferSeconds",
    bikeParking: "workBikeParkingSeconds",
    walkFixed: "workWalkFixed",
    walkFixedSeconds: "workWalkFixedSeconds",
    bikeFixed: "workBikeFixed",
    bikeFixedSeconds: "workBikeFixedSeconds",
  },
} as const satisfies Record<"home" | "work", Record<string, keyof SettingsFormValues>>;
