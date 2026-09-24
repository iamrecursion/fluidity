/**
 * What Fluidity does with the file it persisted last time.
 *
 * `data.json` is the one input to this plugin that nothing validates on its way in: it is written
 * by us, but it is read back from disk, it can be hand-edited, and it can have been written by a
 * version of the plugin that disagreed about the shape. These assertions are the whole of what
 * stops a bad one from producing behavior nobody asked for, so each corrupt shape below is one the
 * naive merge would have accepted.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS, normalizeProperty, normalizeSettings } from "../../../src/settings/defs.ts";

test("a first run, with nothing stored, gets the defaults", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test("fluent titles are on until someone turns them off", () => {
  // The default matters on its own: it is what a vault gets from installing the plugin and doing
  // nothing else, and the feature reference states it.
  assert.equal(DEFAULT_SETTINGS.fluentTitles, true);
  assert.equal(DEFAULT_SETTINGS.fluentProperty, "fluent");
});

test("stored settings are read back as they were saved", () => {
  assert.deepEqual(normalizeSettings({ fluentTitles: false, fluentProperty: "common-noun" }), {
    fluentTitles: false,
    fluentProperty: "common-noun",
  });
});

test("a toggle that is not a boolean falls back rather than being believed", () => {
  // `"false"` is the dangerous one: it is truthy, so a merge would turn the feature on for someone
  // whose file says it is off.
  assert.equal(normalizeSettings({ fluentTitles: "false" }).fluentTitles, true);
  assert.equal(normalizeSettings({ fluentTitles: 0 }).fluentTitles, true);
  assert.equal(normalizeSettings({ fluentTitles: null }).fluentTitles, true);
});

test("a property that is not a string falls back rather than being believed", () => {
  // `null` is the dangerous one: a merge keeps it, and reading frontmatter under it looks for a
  // property literally named "null".
  assert.equal(normalizeSettings({ fluentProperty: null }).fluentProperty, "fluent");
  assert.equal(normalizeSettings({ fluentProperty: 42 }).fluentProperty, "fluent");
  assert.equal(normalizeSettings({ fluentProperty: ["fluent"] }).fluentProperty, "fluent");
});

test("one unusable field does not drag the other back to its default", () => {
  // The two settings are independent, and a hand-edit that breaks one should leave the other
  // saying what its owner meant.
  assert.deepEqual(normalizeSettings({ fluentTitles: false, fluentProperty: 42 }), {
    fluentTitles: false,
    fluentProperty: "fluent",
  });
});

test("the stored record is rebuilt, not extended", () => {
  // Anything else in the file — a setting this version does not have, or one a user invented —
  // does not survive into the record the plugin runs on.
  const normalized = normalizeSettings({ fluentTitles: true, fluentProperty: "fluent", sectionLinks: true });

  assert.deepEqual(Object.keys(normalized).sort(), ["fluentProperty", "fluentTitles"]);
});

test("surrounding whitespace in a property name is dropped", () => {
  // Invisible in the settings field and invisible in the property editor, so a stray space would
  // read as the feature being broken rather than as a typo.
  assert.equal(normalizeProperty("  fluent  "), "fluent");
  assert.equal(normalizeProperty("\tcommon-noun\n"), "common-noun");
});

test("an empty property name means the default", () => {
  // This is what lets the settings field be cleared: empty shows the placeholder and behaves as
  // `fluent`, rather than matching a property with no name.
  assert.equal(normalizeProperty(""), "fluent");
  assert.equal(normalizeProperty("   "), "fluent");
});

test("a property name is otherwise the user's own vocabulary", () => {
  // Not lowercased, not slugified, not checked against anything: the only wrong answer is one that
  // cannot name a property at all.
  assert.equal(normalizeProperty("Fluent Noun"), "Fluent Noun");
  assert.equal(normalizeProperty("流暢"), "流暢");
});
