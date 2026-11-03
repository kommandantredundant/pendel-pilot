import test from "node:test";
import assert from "node:assert/strict";
import type { CommuteSuggestion } from "@shared/routes";
import { minutesOverdue, minutesUntil, modeStatus, selectGlance, urgencyFor } from "./glance";

const NOW = Date.parse("2026-04-10T07:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function suggestion(line: string, leaveWalk: number, leaveBike: number): CommuteSuggestion {
  return {
    journey: {
      origin: "A",
      destination: "B",
      departure: at(leaveBike + 10),
      arrival: at(leaveBike + 40),
      delay: null,
      plannedDeparture: at(leaveBike + 10),
      plannedArrival: at(leaveBike + 40),
      lineName: line,
      legs: [{ lineName: line, departure: at(leaveBike + 10), plannedDeparture: at(leaveBike + 10), delay: null }],
    },
    walkTimeMinutes: 20,
    bikeTimeMinutes: 8,
    leaveHomeWalkTime: at(leaveWalk),
    leaveHomeBikeTime: at(leaveBike),
    arriveWalkMinutes: 12,
    arriveBikeMinutes: 5,
    arriveWalkTime: at(leaveBike + 52),
    arriveBikeTime: at(leaveBike + 45),
    finalDestinationType: "work",
  };
}

test("minutesUntil counts whole minutes and turns negative once passed", () => {
  assert.equal(minutesUntil(at(4.9), NOW), 4);
  assert.equal(minutesUntil(at(0), NOW), 0);
  assert.equal(minutesUntil(at(-0.5), NOW), -1);
});

test("urgency is relaxed above 10 minutes, soon from 3 to 10, now below 3", () => {
  assert.deepEqual([11, 10, 3, 2, 0].map(urgencyFor), ["relaxed", "soon", "soon", "now", "now"]);
});

test("selectGlance picks the first connection the preferred mode still makes", () => {
  const list = [suggestion("RE1", -20, -8), suggestion("RE2", -5, 4), suggestion("RE3", 10, 22), suggestion("RE4", 25, 37)];

  const walking = selectGlance(list, "walk", NOW);
  assert.equal(walking.next?.journey.lineName, "RE3");
  // Walking misses RE2, biking still makes it: offered as the earlier alternative.
  assert.equal(walking.alternative?.journey.lineName, "RE2");
  assert.equal(walking.missedCount, 1);
  assert.deepEqual(walking.later.map((s) => s.journey.lineName), ["RE4"]);

  const biking = selectGlance(list, "bike", NOW);
  assert.equal(biking.next?.journey.lineName, "RE2");
  assert.equal(biking.alternative, undefined);
  assert.equal(biking.missedCount, 1);
});

test("selectGlance reports nothing reachable when every leave time has passed", () => {
  const result = selectGlance([suggestion("RE1", -20, -8)], "bike", NOW);
  assert.equal(result.next, undefined);
  assert.equal(result.missedCount, 1);
  assert.deepEqual(result.later, []);
});

test("a passed leave time stays in reach for 10 % of the routing time, then counts as missed", () => {
  // Walking takes 20 min, biking 8 min: hurrying makes up 2 min on foot and 48 s by bike.
  const s = suggestion("RE1", -2, -0.5);
  assert.equal(modeStatus(s, "walk", NOW), "hurry");
  assert.equal(modeStatus(s, "bike", NOW), "hurry");
  assert.equal(modeStatus(suggestion("RE1", -2.1, -0.9), "walk", NOW), "missed");
  assert.equal(modeStatus(suggestion("RE1", -2.1, -0.9), "bike", NOW), "missed");
  assert.equal(modeStatus(suggestion("RE1", 0, 1), "walk", NOW), "ok");
  assert.equal(minutesOverdue(at(-1.2), NOW), 2);
});

test("selectGlance keeps a connection you can still make by hurrying as the next one", () => {
  const list = [suggestion("RE1", -1.5, 10), suggestion("RE2", 15, 27)];
  const walking = selectGlance(list, "walk", NOW);
  assert.equal(walking.next?.journey.lineName, "RE1");
  assert.equal(walking.missedCount, 0);
});

test("selectGlance with a spontaneous choice takes the first connection either mode makes", () => {
  const list = [suggestion("RE1", -20, -8), suggestion("RE2", -5, 4), suggestion("RE3", 10, 22)];
  const both = selectGlance(list, "both", NOW);
  assert.equal(both.next?.journey.lineName, "RE2");
  assert.equal(both.alternative, undefined);
  assert.equal(both.missedCount, 1);
  assert.deepEqual(both.later.map((s) => s.journey.lineName), ["RE3"]);
});
