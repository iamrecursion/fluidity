/**
 * What the sentence detector counts as a sentence start.
 *
 * This is where "it did the wrong thing" usually comes from, so the cases below are the feature
 * reference's own table, written out one by one. The cases at the end are the documented
 * simplifications: they assert what the detector actually does, which is to answer `true` and
 * leave a capital alone, rather than what perfect English would say.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { startsSentence } from "../../../src/prose/sentence.ts";

test("a link that opens the line starts a sentence", () => {
  assert.equal(startsSentence(""), true);
  assert.equal(startsSentence("   "), true);
});

test("Markdown structure before the link starts a sentence", () => {
  assert.equal(startsSentence("## "), true);
  assert.equal(startsSentence("> "), true);
  assert.equal(startsSentence(">> "), true);
  assert.equal(startsSentence("> [!note] "), true);
  assert.equal(startsSentence("- "), true);
  assert.equal(startsSentence("* "), true);
  assert.equal(startsSentence("+ "), true);
  assert.equal(startsSentence("1. "), true);
  assert.equal(startsSentence("- [ ] "), true);
  assert.equal(startsSentence("- [x] "), true);
});

test("terminating punctuation followed by whitespace starts a sentence", () => {
  assert.equal(startsSentence("It ended. "), true);
  assert.equal(startsSentence("Really! "), true);
  assert.equal(startsSentence("Did it? "), true);
  assert.equal(startsSentence("Note: "), true);
  assert.equal(startsSentence("Then; "), true);
});

test("structure inside a blockquote or callout still opens a sentence", () => {
  // A bullet in a quote is a bullet. Missing these lowercases a title at the start of a line,
  // which is the direction this module is built not to fail in.
  assert.equal(startsSentence("> - "), true);
  assert.equal(startsSentence("> - [ ] "), true);
  assert.equal(startsSentence("> 1. "), true);
  assert.equal(startsSentence("> ## "), true);
  assert.equal(startsSentence("> [!note] - "), true);
  assert.equal(startsSentence(">> - "), true);
});

test("a sentence that ends inside quotes or brackets has still ended", () => {
  assert.equal(startsSentence("He said \"It ends.\" "), true);
  assert.equal(startsSentence("(see above.) "), true);
  assert.equal(startsSentence("«C’est fini.» "), true);
});

test("a table cell opens a sentence", () => {
  // The cell is the unit of prose in a table, so a title first in one keeps its capital. The
  // cells before it on the row are prose of their own and do not change that.
  assert.equal(startsSentence("| "), true);
  assert.equal(startsSentence("|"), true);
  assert.equal(startsSentence("| a | "), true);
});

test("the CJK terminators need no space after them", () => {
  assert.equal(startsSentence("終わり。"), true);
  assert.equal(startsSentence("本当！"), true);
  assert.equal(startsSentence("どう？"), true);
});

test("a terminator with nothing after it does not start a sentence", () => {
  // `end.[[Note]]` is someone typing a link onto the end of a word, not a new sentence.
  assert.equal(startsSentence("end."), false);
});

test("emphasis and opening brackets are transparent", () => {
  assert.equal(startsSentence("**"), true);
  assert.equal(startsSentence("_"), true);
  assert.equal(startsSentence("=="), true);
  assert.equal(startsSentence("(\""), true);
  assert.equal(startsSentence("- **"), true);
  assert.equal(startsSentence("Note: **"), true);
});

test("emphasis does not make mid-sentence text into a sentence start", () => {
  // The markers are dropped, and what they were attached to is still mid-clause.
  assert.equal(startsSentence("a really *"), false);
  assert.equal(startsSentence("**bold** "), false);
});

test("ordinary prose before the link is not a sentence start", () => {
  assert.equal(startsSentence("which is really about the "), false);
  assert.equal(startsSentence("an introduction to "), false);
  assert.equal(startsSentence("see "), false);
});

test("a full stop ending the text is taken at face value", () => {
  // An abbreviation, a URL or a span of inline code that ends immediately before the link reads as
  // a boundary here, so the capital stays. That is the conservative failure, and a visible one.
  assert.equal(startsSentence("e.g. "), true);
  assert.equal(startsSentence("see https://example.com/tides. "), true);
});

test("a full stop inside the text is not a boundary", () => {
  // The rule only ever looks at what the text ends with, so a decimal or an abbreviation earlier
  // in the clause costs nothing: these are correctly mid-sentence.
  assert.equal(startsSentence("3.14 is the "), false);
  assert.equal(startsSentence("e.g. the "), false);
});
