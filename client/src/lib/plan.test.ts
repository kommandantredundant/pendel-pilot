import test from "node:test";
import assert from "node:assert/strict";
import type { CommuteSuggestion } from "@shared/routes";
import {
  addDays,
  axisPercent,
  berlinClock,
  berlinDate,
  berlinIso,
  doorToDoorMinutes,
  earlierAnchor,
  lanedSegments,
  planRowCount,
  laterAnchor,
  planMarkers,
  sortByLeaveTime,
  timeAxis,
  timelineSegments,
  transfers,
  transferStatus,
  worstTransfer,
} from "./plan";

const BASE = Date.parse("2026-04-10T05:00:00.000Z");
const at = (minutes: number) => new Date(BASE + minutes * 60_000).toISOString();

/** Connection leaving by bike at `leave`; each leg is [departure, arrival] in minutes after BASE. */
function suggestion(leave: number, legs: [number, number][], options: { arriveBikeAfter?: number } = {}): CommuteSuggestion {
  const departure = legs[0][0];
  const arrival = legs[legs.length - 1][1];
  return {
    journey: {
      origin: "A",
      destination: "B",
      departure: at(departure),
      arrival: at(arrival),
      delay: null,
      plannedDeparture: at(departure),
      plannedArrival: at(arrival),
      lineName: "RE1",
      legs: legs.map(([dep, arr], index) => ({
        lineName: `L${index + 1}`,
        departure: at(dep),
        plannedDeparture: at(dep),
        delay: null,
        arrival: at(arr),
        origin: index === 0 ? "A" : `T${index}`,
        destination: index === legs.length - 1 ? "B" : `T${index + 1}`,
      })),
    },
    walkTimeMinutes: 20,
    bikeTimeMinutes: departure - leave,
    leaveHomeWalkTime: at(departure - 20),
    leaveHomeBikeTime: at(leave),
    arriveWalkMinutes: 12,
    arriveBikeMinutes: options.arriveBikeAfter ?? 5,
    arriveWalkTime: at(arrival + 12),
    arriveBikeTime: at(arrival + (options.arriveBikeAfter ?? 5)),
    finalDestinationType: "work",
  };
}

test("transfer status: 5 min and more is fine, 2 to 4 is tight, 1 or less is at risk", () => {
  assert.equal(transferStatus(5), "ok");
  assert.equal(transferStatus(4), "tight");
  assert.equal(transferStatus(2), "tight");
  assert.equal(transferStatus(1), "risk");
  assert.equal(transferStatus(-3), "risk");
});

test("transfers measure the gap between arrival and the next departure, with the station name", () => {
  const s = suggestion(0, [[10, 30], [33, 50], [60, 70]]);
  assert.deepEqual(transfers(s), [
    { minutes: 3, status: "tight", station: "T1" },
    { minutes: 10, status: "ok", station: "T2" },
  ]);
  assert.deepEqual(worstTransfer(s), { minutes: 3, status: "tight", station: "T1" });
  assert.equal(worstTransfer(suggestion(0, [[10, 30]])), undefined);
});

test("timeline runs door to door: way to the station, trains and transfers, way from the station", () => {
  const segments = timelineSegments(suggestion(0, [[10, 30], [36, 50]]), "bike");
  assert.deepEqual(
    segments.map((segment) => [segment.kind, (segment.start - BASE) / 60_000, (segment.end - BASE) / 60_000]),
    [
      ["access", 0, 10],
      ["ride", 10, 30],
      ["transfer", 30, 36],
      ["ride", 36, 50],
      ["egress", 50, 55],
    ]
  );
});

test("legs without arrival times collapse into one ride block", () => {
  const s = suggestion(0, [[10, 30], [36, 50]]);
  s.journey.legs = s.journey.legs.map(({ arrival: _arrival, ...leg }) => leg);
  const kinds = timelineSegments(s, "bike").map((segment) => segment.kind);
  assert.deepEqual(kinds, ["access", "ride", "egress"]);
  assert.deepEqual(transfers(s), []);
});

test("markers flag the fastest connection and the fewest transfers only when they differ", () => {
  const direct = suggestion(0, [[10, 60]]); // 65 min door to door
  const fast = suggestion(20, [[28, 50], [54, 70]]); // 55 min, one transfer
  const markers = planMarkers([direct, fast], "bike");
  assert.deepEqual([...markers.fastest], [1]);
  assert.deepEqual([...markers.fewestTransfers], [0]);
  assert.equal(doorToDoorMinutes(fast, "bike"), 55);

  const same = planMarkers([direct, suggestion(30, [[40, 90]])], "bike");
  assert.equal(same.fastest.size, 0);
  assert.equal(same.fewestTransfers.size, 0);
  assert.equal(planMarkers([direct], "bike").fastest.size, 0);
});

test("connections sort by leave time for the chosen mode", () => {
  const a = suggestion(30, [[40, 60]]);
  const b = suggestion(5, [[15, 50]]);
  assert.deepEqual(sortByLeaveTime([a, b], "bike"), [b, a]);
});

test("time axis pads to the next 10 minutes, labels every 30 and marks the 10s in between", () => {
  const axis = timeAxis([suggestion(7, [[17, 50]]), suggestion(25, [[35, 80]])], "bike");
  assert.ok(axis);
  assert.equal(axis.start, BASE); // 05:07 rounds down to 05:00
  assert.equal(axis.end, BASE + 90 * 60_000); // 06:25 rounds up to 06:30
  assert.deepEqual(axis.ticks.map((tick) => (tick - BASE) / 60_000), [0, 30, 60, 90]);
  assert.deepEqual(axis.minorTicks.map((tick) => (tick - BASE) / 60_000), [10, 20, 40, 50, 70, 80]);
  assert.equal(axisPercent(axis, BASE + 45 * 60_000), 50);
  assert.equal(axisPercent(axis, BASE - 60 * 60_000), 0);
  assert.equal(timeAxis([], "bike"), null);
});

test("long spans switch to hourly labels with 30-minute minor ticks", () => {
  const axis = timeAxis([suggestion(0, [[10, 400]])], "bike");
  assert.ok(axis);
  assert.ok(axis.ticks.every((tick) => (tick - BASE) % (60 * 60_000) === 0));
  assert.ok(axis.minorTicks.every((tick) => (tick - BASE) % (30 * 60_000) === 0));
});

test("paging anchors: later departs after the last train, earlier arrives before the first one", () => {
  const list = [suggestion(0, [[10, 30]]), suggestion(20, [[30, 55]])];
  assert.deepEqual(laterAnchor(list), { kind: "departure", time: at(31) });
  assert.deepEqual(earlierAnchor(list), { kind: "arrival", time: at(29) });
  assert.equal(laterAnchor([]), null);
});

test("Berlin date helpers convert wall-clock time across daylight saving changes", () => {
  assert.equal(berlinIso("2026-07-01", "07:30"), "2026-07-01T05:30:00.000Z"); // CEST, UTC+2
  assert.equal(berlinIso("2026-12-01", "07:30"), "2026-12-01T06:30:00.000Z"); // CET, UTC+1
  assert.equal(berlinIso("2026-03-29", "12:00"), "2026-03-29T10:00:00.000Z"); // DST starts that night
  assert.equal(berlinDate(Date.parse("2026-11-03T23:30:00Z")), "2026-11-04");
  assert.equal(berlinClock(Date.parse("2026-11-03T23:30:00Z")), "00:30");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("with both modes the way segments split into a walk lane on top and a bike lane below", () => {
  const segments = lanedSegments(suggestion(0, [[10, 30]]), "both");
  const summary = segments.map((segment) => [
    segment.kind,
    segment.lane,
    "mode" in segment ? segment.mode : "-",
    (segment.start - BASE) / 60_000,
    (segment.end - BASE) / 60_000,
  ]);
  assert.deepEqual(summary, [
    ["access", "top", "walk", -10, 10],
    ["egress", "top", "walk", 30, 42],
    ["access", "bottom", "bike", 0, 10],
    ["egress", "bottom", "bike", 30, 35],
    ["ride", "full", "-", 10, 30],
  ]);
  assert.ok(lanedSegments(suggestion(0, [[10, 30]]), "bike").every((segment) => segment.lane === "full"));
});

test("the time axis covers the longer walk lane when both modes are shown", () => {
  const list = [suggestion(7, [[17, 50]])]; // walk leaves at 17 - 20 = minute -3
  assert.equal(timeAxis(list, "bike")?.start, BASE);
  assert.equal(timeAxis(list, "both")?.start, BASE - 10 * 60_000);
});

test("the planner shows 6 connections on short screens and up to 12 on tall ones", () => {
  assert.equal(planRowCount(800), 6); // 13" laptop
  assert.equal(planRowCount(1300), 8); // 1440p desktop
  assert.equal(planRowCount(1600), 11);
  assert.equal(planRowCount(2400), 12); // 4K, capped
});
