import { z } from "zod";
import { insertSettingsObjectSchema, refineSettings } from "@shared/client-schema";

const minutes = z.coerce.number().min(0).max(60);

/** The settings form: the stored settings, with numeric inputs coerced from their text values. */
export const settingsFormSchema = insertSettingsObjectSchema
  .extend({
    homeLeavingBufferMinutes: minutes,
    workLeavingBufferMinutes: minutes,
    homeBikeBufferMinutes: minutes,
    workBikeBufferMinutes: minutes,
    homeBikeParkingMinutes: minutes,
    workBikeParkingMinutes: minutes,
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
    leaving: "homeLeavingBufferMinutes",
    bike: "homeBikeBufferMinutes",
    bikeParking: "homeBikeParkingMinutes",
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
    leaving: "workLeavingBufferMinutes",
    bike: "workBikeBufferMinutes",
    bikeParking: "workBikeParkingMinutes",
    walkFixed: "workWalkFixed",
    walkFixedSeconds: "workWalkFixedSeconds",
    bikeFixed: "workBikeFixed",
    bikeFixedSeconds: "workBikeFixedSeconds",
  },
} as const satisfies Record<"home" | "work", Record<string, keyof SettingsFormValues>>;
