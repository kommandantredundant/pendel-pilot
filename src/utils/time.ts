import {
  calculateCanonicalJourney,
  calculateJourneyHome,
  calculateJourneyWork,
  type CanonicalJourney,
  type CanonicalJourneySeed
} from '../models/journey.ts';

export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

export function addSeconds(isoDateTime: string, seconds: number): string {
  return new Date(Date.parse(isoDateTime) + seconds * 1000).toISOString();
}

export function subtractSeconds(isoDateTime: string, seconds: number): string {
  return addSeconds(isoDateTime, -seconds);
}

export function applyCanonicalJourneyTimes(seed: CanonicalJourneySeed): CanonicalJourney {
  return calculateCanonicalJourney(seed);
}

export function applyJourneyWorkTimes(seed: CanonicalJourneySeed): CanonicalJourney {
  return calculateJourneyWork(seed);
}

export function applyJourneyHomeTimes(seed: CanonicalJourneySeed): CanonicalJourney {
  return calculateJourneyHome(seed);
}
