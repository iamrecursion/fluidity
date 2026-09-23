/**
 * The decision, exercised against ordinary objects.
 *
 * `suggest/transform` imports Obsidian for types only, which TypeScript erases, so it loads under
 * plain Node and the fakes below are enough to drive every path through it. What cannot be checked
 * here is that Obsidian's real objects look like these — that belief lives in `suggest/item` and
 * is checked in a vault, by hand.
 *
 * Passing an item through **by identity** is the contract for "not ours to touch", so these
 * assertions compare references rather than shapes wherever that is what is being claimed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { App, EditorSuggestContext } from "obsidian";

import type { AliasSuggestion, FileSuggestion, LinkSuggestion } from "../../../src/suggest/item.ts";
import { transformSuggestion } from "../../../src/suggest/transform.ts";

const OPTIONS = { property: "fluent" };

/** Stands in for the `TFile` on a suggestion; the transform reads only its basename. */
const file: any = { basename: "Interiority", path: "Interiority.md" };

/** An app whose metadata cache reports exactly this frontmatter for every note. */
function appWith(frontmatter: unknown): App {
  return { metadataCache: { getFileCache: () => ({ frontmatter }) } } as unknown as App;
}

/** A completer context for a link typed after `before`, with `before` the whole line until `[[`. */
function contextFor(before: string): EditorSuggestContext {
  const line = `${before}[[`;
  return {
    editor: { getLine: () => line },
    start: { line: 0, ch: line.length },
  } as unknown as EditorSuggestContext;
}

const aliasItem = (alias: string): AliasSuggestion => ({ type: "alias", alias, file, path: "Interiority.md" });
const fileItem = (): FileSuggestion => ({ type: "file", file, path: "Interiority.md" });

test("an alias for a fluent note is lowercased mid-sentence", () => {
  const item = aliasItem("Interior Life");
  const result = transformSuggestion(appWith({ fluent: true }), item, contextFor("a question about the "), OPTIONS);

  assert.deepEqual(result, { type: "alias", alias: "interior life", file, path: "Interiority.md" });
});

test("an alias for a fluent note keeps its capital at a sentence start", () => {
  const item = aliasItem("Interior Life");
  const result = transformSuggestion(appWith({ fluent: true }), item, contextFor("Note: "), OPTIONS);

  assert.equal(result, item);
});

test("a note's own title becomes an alias item carrying the fluent form", () => {
  // There is no display text on a file item to adjust, because the composer derives it from the
  // path — so the item is flipped to the type that does carry one.
  const item = fileItem();
  const result = transformSuggestion(appWith({ fluent: true }), item, contextFor("really about the "), OPTIONS);

  assert.deepEqual(result, { type: "alias", alias: "interiority", file, path: "Interiority.md" });
});

test("a note that is not fluent is passed through by identity", () => {
  const item = aliasItem("Interior Life");
  const context = contextFor("a question about the ");

  assert.equal(transformSuggestion(appWith({}), item, context, OPTIONS), item);
  assert.equal(transformSuggestion(appWith({ fluent: false }), item, context, OPTIONS), item);
  assert.equal(transformSuggestion(appWith({ fluent: "true" }), item, context, OPTIONS), item);
  assert.equal(transformSuggestion(appWith(undefined), item, context, OPTIONS), item);
});

test("nothing redundant is inserted", () => {
  // Lowercasing an already-lowercase title changes nothing, so the item goes through untouched
  // rather than becoming `[[interiority|interiority]]`.
  const item = aliasItem("interior life");
  const result = transformSuggestion(appWith({ fluent: true }), item, contextFor("about the "), OPTIONS);

  assert.equal(result, item);
});

test("suggestion types Fluidity does not handle are passed through by identity", () => {
  // A block item writes a block id into the target note when it is selected. Returning anything
  // other than the object handed over is how a plugin corrupts a file.
  const context = contextFor("about the ");
  const app = appWith({ fluent: true });

  for (const type of ["block", "heading", "linktext", "none"]) {
    const item = { type } as LinkSuggestion;
    assert.equal(transformSuggestion(app, item, context, OPTIONS), item);
  }
});

test("a malformed item is passed through rather than read", () => {
  const app = appWith({ fluent: true });
  const context = contextFor("about the ");

  const items = [{ type: "alias" }, { type: "file" }, { type: "alias", file }, { type: "file", file: {} }];
  for (const item of items as LinkSuggestion[]) {
    assert.equal(transformSuggestion(app, item, context, OPTIONS), item);
  }
});

test("an embed is passed through by identity", () => {
  // `![[Note]]` renders the note rather than reading as prose, and the text after a pipe there is
  // a display argument. The completer is the same one, so the `!` is all there is to go on.
  const app = appWith({ fluent: true });

  for (const item of [aliasItem("Interior Life"), fileItem()]) {
    assert.equal(transformSuggestion(app, item, contextFor("about the !"), OPTIONS), item);
    assert.equal(transformSuggestion(app, item, contextFor("!"), OPTIONS), item);
  }
});

test("a completion with no context is passed through by identity", () => {
  // Without a cursor there is no way to tell a sentence start from mid-clause, and declining to
  // guess leaves the completer behaving exactly as it does without the plugin.
  const item = aliasItem("Interior Life");

  assert.equal(transformSuggestion(appWith({ fluent: true }), item, null, OPTIONS), item);
});

test("the item Obsidian handed over is never mutated", () => {
  // It belongs to the suggester and may well be reused, so the transform clones before changing.
  const item = aliasItem("Interior Life");
  transformSuggestion(appWith({ fluent: true }), item, contextFor("about the "), OPTIONS);

  assert.equal(item.alias, "Interior Life");
});
