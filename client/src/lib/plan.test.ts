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
  transferCount,
  earlierAnchor,
  connectionKey,
  dropDominated,
  fittingRowCount,
  lanedSegments,
  mergeSuggestions,
  reachableBy,
  selectNowRows,
  planRowCount,
  laterAnchor,
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

test("door-to-door time runs from leaving home to arriving, per mode; transfers count the changes", () => {
  const s = suggestion(20, [[28, 50], [54, 70]]);
  assert.equal(doorToDoorMinutes(s, "bike"), 55); // leave 20, arrive 70 + 5
  assert.equal(doorToDoorMinutes(s, "walk"), 74); // leave 28 - 20, arrive 70 + 12
  assert.equal(transferCount(s), 1);
  assert.equal(transferCount(suggestion(0, [[10, 60]])), 0);
});

test("'now' keeps the connections still reachable and only the most recently missed one above them", () => {
  const now = BASE + 30 * 60_000;
  // Bike leaves at the first number; walking leaves 20 minutes before the train.
  const gone = suggestion(0, [[10, 40]]); // bike 0, walk -10: missed both ways
  const lastGone = suggestion(10, [[20, 50]]); // bike 10, walk 0: missed
  const hurryBike = suggestion(30 - 0.5, [[38, 60]]); // bike left 30 s ago: still makeable by hurrying
  const later = [40, 50, 60, 70].map((leave) => suggestion(leave, [[leave + 8, leave + 40]]));
  const rows = selectNowRows([...later, gone, hurryBike, lastGone], ["bike"], now, 4);
  assert.deepEqual(rows, [lastGone, hurryBike, later[0], later[1]]);
  assert.equal(reachableBy(gone, ["walk", "bike"], now), false);
  assert.equal(reachableBy(hurryBike, ["walk"], now), false); // walking had to leave at 18
  // Nothing missed: all rows go to reachable connections.
  assert.deepEqual(selectNowRows(later, ["bike"], now, 3), later.slice(0, 3));
});

test("result pages merge without repeating a connection", () => {
  const a = suggestion(0, [[10, 40]]);
  const b = suggestion(20, [[30, 60]]);
  const c = suggestion(40, [[50, 80]]);
  assert.deepEqual(mergeSuggestions([a, b], [b, c]), [a, b, c]);
});

test("connections sharing their first train get different keys", () => {
  const fast = suggestion(0, [[10, 30], [33, 50]]);
  const slow = suggestion(0, [[10, 30], [40, 70]]);
  assert.notEqual(connectionKey(fast), connectionKey(slow));
  assert.equal(connectionKey(fast), connectionKey(suggestion(0, [[10, 30], [33, 50]])));
});

test("dominated connections are dropped: same first train with a slower onward connection", () => {
  // Like four RE1 15:10 variants: same departure, arriving at different times.
  const best = suggestion(0, [[10, 30], [33, 50]]);
  const slower = suggestion(0, [[10, 30], [40, 70]]);
  const moreChanges = suggestion(0, [[10, 20], [22, 35], [37, 50]]);
  const laterButFaster = suggestion(20, [[30, 45]]); // leaves later and arrives earlier: dominates best too
  assert.deepEqual(dropDominated([best, slower, moreChanges]), [best]);
  assert.deepEqual(dropDominated([best, slower, laterButFaster]), [laterButFaster]);
  // Leaving earlier but arriving earlier: both stay.
  const early = suggestion(0, [[10, 40]]);
  const late = suggestion(20, [[30, 60]]);
  assert.deepEqual(dropDominated([early, late]), [early, late]);
  // Exact duplicates keep the first one.
  assert.deepEqual(dropDominated([early, suggestion(0, [[10, 40]])]), [early]);
});

test("'now' keeps the missed connection on top even when ordering by another mode", () => {
  const now = BASE + 30 * 60_000;
  const missed = suggestion(10, [[20, 50]]);
  const a = suggestion(40, [[48, 70]]);
  const b = suggestion(35, [[50, 80]]);
  assert.deepEqual(selectNowRows([a, b, missed], ["bike"], now, 3, "bike"), [missed, b, a]);
});

test("the fitting row count follows the measured space and row height", () => {
  assert.equal(fittingRowCount(700, 100), 7);
  assert.equal(fittingRowCount(699, 100), 6);
  assert.equal(fittingRowCount(150, 100), 1); // small windows: fewer rows rather than scrolling
  assert.equal(fittingRowCount(40, 100), 1);
  assert.equal(fittingRowCount(5000, 100), 12); // never more than one request loads
});
