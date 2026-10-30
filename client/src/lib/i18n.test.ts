import test from "node:test";
import assert from "node:assert/strict";
import { t } from "./i18n";

test("de translation for settings.home.address is spelled correctly", () => {
  assert.equal(t("settings.home.address", "de"), "Wohnadresse");
});
