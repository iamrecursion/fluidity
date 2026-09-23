/**
 * The casing rule.
 *
 * Small enough to read in one go, and the single place every casing decision passes through — so
 * these cases are what the roadmap's override language will have to keep answering.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { fluentDisplay } from "../../../src/fluent/display.ts";

test("a fluent title mid-sentence is lowercased whole", () => {
  assert.equal(fluentDisplay("Interiority", false), "interiority");
  assert.equal(fluentDisplay("Object Oriented Programming", false), "object oriented programming");
});

test("a fluent title at a sentence start keeps its capital", () => {
  assert.equal(fluentDisplay("Interiority", true), "Interiority");
});

test("the rule is blunt, and that is the documented behavior", () => {
  // A genuine proper noun is over-lowered. The workaround is not marking such a note fluent, and
  // the fix is the roadmap's per-note override language rather than a dictionary.
  assert.equal(fluentDisplay("History of France", false), "history of france");
});

test("lowercasing is locale-aware rather than ASCII", () => {
  assert.equal(fluentDisplay("ÉTAT", false), "état");
});
