import test from "node:test";
import assert from "node:assert/strict";
import type { CommuteSuggestion } from "@shared/routes";
import { lossIsRecent, pinFor, pinKey, resolvePin, STALE_PIN_MS } from "./glance-pin";

const NOW = Date.parse("2026-04-10T07:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function suggestion(line: string, leaveWalk: number, leaveBike: number, delay = 0): CommuteSuggestion {
  const planned = at(leaveBike + 10);
  const actual = at(leaveBike + 10 + delay);
  return {
    journey: {
      origin: "A",
      destination: "B",
      departure: actual,
      arrival: at(leaveBike + 40 + delay),
      delay: delay || null,
      plannedDeparture: planned,
      plannedArrival: at(leaveBike + 40),
      lineName: line,
      legs: [{ lineName: line, departure: actual, plannedDeparture: planned, delay: delay || null }],
    },
    walkTimeMinutes: 20,
    bikeTimeMinutes: 8,
    leaveHomeWalkTime: at(leaveWalk + delay),
    leaveHomeBikeTime: at(leaveBike + delay),
    arriveWalkMinutes: 12,
    arriveBikeMinutes: 5,
    arriveWalkTime: at(leaveBike + 52 + delay),
    arriveBikeTime: at(leaveBike + 45 + delay),
    finalDestinationType: "work",
  };
}

test("pinKey stays the same when the train is delayed", () => {
  assert.equal(pinKey(suggestion("RE2", 5, 15)), pinKey(suggestion("RE2", 5, 15, 7)));
  assert.notEqual(pinKey(suggestion("RE2", 5, 15)), pinKey(suggestion("RE42", 5, 15)));
});

test("pinFor keeps the later of the two leave times", () => {
  assert.equal(pinFor(suggestion("RE2", 5, 15)).lastLeave, at(15));
  assert.equal(pinFor(suggestion("RE2", 25, 15)).lastLeave, at(25));
});

test("resolvePin finds the remembered connection, also after a delay", () => {
  const pin = pinFor(suggestion("RE2", 5, 15));
  const delayed = suggestion("RE2", 5, 15, 4);
  const result = resolvePin([suggestion("RB89", 1, 10), delayed], pin, "both", NOW);
  assert.equal(result.state, "active");
  assert.equal(result.state === "active" && result.suggestion, delayed);
});

test("resolvePin reports a connection that is no longer listed as lost", () => {
  const pin = pinFor(suggestion("RE2", 5, 15));
  assert.deepEqual(resolvePin([suggestion("RB89", 1, 10)], pin, "both", NOW), { state: "lost" });
});

test("resolvePin reports a connection no counted mode can make any more as lost", () => {
  const missedOnFoot = suggestion("RE2", -10, 3);
  const pin = pinFor(missedOnFoot);
  assert.deepEqual(resolvePin([missedOnFoot], pin, "walk", NOW), { state: "lost" });
  assert.equal(resolvePin([missedOnFoot], pin, "bike", NOW).state, "active");
  assert.equal(resolvePin([missedOnFoot], pin, "both", NOW).state, "active");
});

test("resolvePin without a pin is none", () => {
  assert.deepEqual(resolvePin([suggestion("RE2", 5, 15)], undefined, "both", NOW), { state: "none" });
});

test("a loss counts as recent unless the pin ran out long ago", () => {
  assert.equal(lossIsRecent(pinFor(suggestion("RE2", 5, 15)), NOW), true);
  assert.equal(lossIsRecent(pinFor(suggestion("RE2", -12, -3)), NOW), true);
  const longAgo = -(STALE_PIN_MS / 60_000) - 5;
  assert.equal(lossIsRecent(pinFor(suggestion("RE2", longAgo, longAgo)), NOW), false);
});
