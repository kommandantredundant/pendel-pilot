import test from "node:test";
import assert from "node:assert/strict";
import { formatMinutesSeconds, parseMinutesSeconds } from "./duration";

test("parseMinutesSeconds reads mm:ss and whole minutes", () => {
  assert.equal(parseMinutesSeconds("12:34"), 754);
  assert.equal(parseMinutesSeconds(" 0:45 "), 45);
  assert.equal(parseMinutesSeconds("7"), 420);
  assert.equal(parseMinutesSeconds("180:00"), 10_800);
});

test("parseMinutesSeconds rejects malformed or too long durations", () => {
  for (const text of ["", "12:60", "12:5", "-1:00", "1:2:3", "abc", "180:01"]) {
    assert.equal(parseMinutesSeconds(text), undefined, text);
  }
});

test("formatMinutesSeconds pads the seconds", () => {
  assert.equal(formatMinutesSeconds(754), "12:34");
  assert.equal(formatMinutesSeconds(65), "1:05");
  assert.equal(formatMinutesSeconds(0), "0:00");
});
