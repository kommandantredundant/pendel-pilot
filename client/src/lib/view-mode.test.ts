import test from "node:test";
import assert from "node:assert/strict";
import { choiceFlags, isMobileUserAgent, resolveView, storedChoice } from "./view-mode";

const UA = {
  pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

test("phones count as mobile, tablets and desktops do not", () => {
  assert.equal(isMobileUserAgent(UA.pixel), true);
  assert.equal(isMobileUserAgent(UA.iphone), true);
  assert.equal(isMobileUserAgent(UA.firefoxAndroid), true);
  assert.equal(isMobileUserAgent(UA.androidTablet), false);
  assert.equal(isMobileUserAgent(UA.ipad), false);
  assert.equal(isMobileUserAgent(UA.desktop), false);
});

test("the client hint wins over the user agent string", () => {
  assert.equal(isMobileUserAgent(UA.desktop, true), true);
  assert.equal(isMobileUserAgent(UA.pixel, false), false);
});

test("stored choice: Planner only off mobile, legacy profiles keep Glance on the phone", () => {
  assert.equal(storedChoice(null, false), "classic");
  assert.equal(storedChoice({ glanceMode: 1, planMode: 0 }, false), "glance");
  assert.equal(storedChoice({ glanceMode: 0, planMode: 1 }, false), "plan");
  assert.equal(storedChoice({ glanceMode: 0, planMode: 1 }, true), "classic");
  assert.equal(storedChoice({ glanceMode: 1, planMode: 1 }, true), "glance");
  assert.equal(storedChoice({ glanceMode: 1, planMode: 1 }, false), "plan");
});

test("Planner falls back to classic on phones and in narrow windows", () => {
  assert.equal(resolveView("plan", { mobile: false, wide: true }), "plan");
  assert.equal(resolveView("plan", { mobile: false, wide: false }), "classic");
  assert.equal(resolveView("plan", { mobile: true, wide: true }), "classic");
  assert.equal(resolveView("glance", { mobile: false, wide: true }), "glance");
  assert.equal(resolveView("classic", { mobile: true, wide: false }), "classic");
});

test("a choice stores exactly one flag", () => {
  assert.deepEqual(choiceFlags("classic"), { glanceMode: 0, planMode: 0 });
  assert.deepEqual(choiceFlags("glance"), { glanceMode: 1, planMode: 0 });
  assert.deepEqual(choiceFlags("plan"), { glanceMode: 0, planMode: 1 });
});
