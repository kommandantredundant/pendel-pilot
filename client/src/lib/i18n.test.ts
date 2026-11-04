import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, t, translations } from "./i18n";

test("de translation for settings.home.address is spelled correctly", () => {
  assert.equal(t("settings.home.address", "de"), "Wohnadresse");
});

test("detectLanguage picks the first supported browser language", () => {
  assert.equal(detectLanguage(["de-AT", "en-US"]), "de");
  assert.equal(detectLanguage(["fr-FR", "en-GB", "de"]), "en");
  assert.equal(detectLanguage(["fr-FR", "DE-ch"]), "de");
});

test("detectLanguage falls back to English", () => {
  assert.equal(detectLanguage(["fr", "it"]), "en");
  assert.equal(detectLanguage([]), "en");
  assert.equal(detectLanguage(undefined), "en");
});

test("every landing text exists in English and German", () => {
  const en = Object.keys(translations.en).filter((key) => key.startsWith("landing."));
  const de = Object.keys(translations.de).filter((key) => key.startsWith("landing."));
  assert.ok(en.length > 0);
  assert.deepEqual([...de].sort(), [...en].sort());
});
