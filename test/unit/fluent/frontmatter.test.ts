/**
 * What marks a note fluent.
 *
 * The strictness about booleans is the whole of this module's behavior, and it is a deliberate
 * choice rather than an accident of how the value is read, so it is pinned here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isFluent } from "../../../src/fluent/frontmatter.ts";

test("a real boolean true marks the note", () => {
  assert.equal(isFluent({ fluent: true }, "fluent"), true);
});

test("a string does not mark the note", () => {
  // Obsidian's property editor writes a real boolean for a checkbox property, so a string is a
  // typo — and a typo must not change how links are written.
  assert.equal(isFluent({ fluent: "true" }, "fluent"), false);
  assert.equal(isFluent({ fluent: "yes" }, "fluent"), false);
});

test("false and absent are the same thing", () => {
  assert.equal(isFluent({ fluent: false }, "fluent"), false);
  assert.equal(isFluent({ title: "Interiority" }, "fluent"), false);
});

test("a note with no frontmatter at all is not fluent", () => {
  assert.equal(isFluent(undefined, "fluent"), false);
  assert.equal(isFluent(null, "fluent"), false);
});

test("the property name is the caller's to choose", () => {
  assert.equal(isFluent({ "common-noun": true }, "common-noun"), true);
  assert.equal(isFluent({ "common-noun": true }, "fluent"), false);
});
