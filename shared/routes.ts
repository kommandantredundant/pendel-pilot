import { z } from 'zod';

/**
 * Error response schemas for API error handling
 */
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

/**
 * Station data schema from the transport API
 */
export const stationSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional()
});

/**
 * Journey data schema from the transport API
 */
export const journeySchema = z.object({
  type: z.string().optional(),
  origin: z.string(),
  destination: z.string(),
  departure: z.string(), // ISO date
  arrival: z.string(), // ISO date
  delay: z.number().nullable(), // delay in minutes
  plannedDeparture: z.string(),
  plannedArrival: z.string(),
  lineName: z.string(),
  // Every train/bus of the connection in travel order, each with its departure time and track
  legs: z.array(z.object({
    lineName: z.string(),
    departure: z.string(), // ISO date, real-time when available
    plannedDeparture: z.string(),
    delay: z.number().nullable(), // minutes; null without real-time data
    platform: z.string().optional(),
    plannedPlatform: z.string().optional(),
    arrival: z.string().optional(), // ISO date at the end of this leg, real-time when available
    plannedArrival: z.string().optional(),
    origin: z.string().optional(), // stop names; the arrival stop of one leg is the transfer station
    destination: z.string().optional(),
  })),
});

/**
 * Commute suggestion schema combining journey with travel times
 */
export const commuteSuggestionSchema = z.object({
  journey: journeySchema,
  walkTimeMinutes: z.number(),
  bikeTimeMinutes: z.number(),
  leaveHomeWalkTime: z.string(), // ISO date when to leave home walking
  leaveHomeBikeTime: z.string(), // ISO date when to leave home biking
  arriveWalkMinutes: z.number(), // last mile from the arrival station on foot
  arriveBikeMinutes: z.number(), // last mile from the arrival station by bike
  arriveWalkTime: z.string(), // ISO date of arrival at the destination address walking
  arriveBikeTime: z.string(), // ISO date of arrival at the destination address biking
  finalDestinationType: z.enum(['work', 'home']),
});

/**
 * TypeScript types derived from the schemas
 */
export type Station = z.infer<typeof stationSchema>;
export type Journey = z.infer<typeof journeySchema>;
export type CommuteSuggestion = z.infer<typeof commuteSuggestionSchema>;
