/**
 * The patch, against a fake suggester built to match what Obsidian's is believed to look like.
 *
 * `suggest/item` writes down the shapes and `suggest/transform` is tested against plain objects;
 * neither exercises the part that reaches into the app. This suite does, by standing up a
 * suggester registry with the same shape the real one has and installing the real patch into it.
 *
 * It cannot catch Obsidian changing — nothing outside a vault can. What it catches is *us*
 * changing: every assertion here corresponds to a rule `suggest/patch` states in a comment, and
 * each of those rules is one a plausible refactor would quietly break while `test/unit` stayed
 * green. The sharpest is the context rule, because getting it wrong produces code that works
 * perfectly against a naive fake — one whose `selectSuggestion` leaves `context` alone — and fails
 * on the first real keystroke.
 */

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { App } from "obsidian";

import type { LinkSuggestion } from "../../../src/suggest/item.ts";
import { installFluentTitles } from "../../../src/suggest/patch.ts";

const OPTIONS = { property: "fluent" };

/** Stands in for the `TFile` on a suggestion. */
const file: any = { basename: "Interiority", path: "Interiority.md" };

const fileItem = (): any => ({ type: "file", file, path: "Interiority.md" });

/** A completer context for a link typed after `before`, with `before` the line until `[[`. */
function contextFor(before: string): any {
  const line = `${before}[[`;
  return { editor: { getLine: () => line }, start: { line: 0, ch: line.length } };
}

/**
 * The base every suggester in the app shares, standing in for `EditorSuggest`.
 *
 * Its `selectSuggestion` clears the context first, exactly as Obsidian's does by calling
 * `this.close()`, because that single detail is what the patch has to be written around.
 */
class EditorSuggest {
  context: any = null;
  received: { item: LinkSuggestion; evt: unknown; }[] = [];

  selectSuggestion(item: LinkSuggestion, evt: unknown): void {
    this.context = null;
    this.received.push({ item, evt });
  }
}

/** The built-in link suggester: its own subclass, carrying the property the patch looks for. */
class LinkSuggest extends EditorSuggest {
  suggestManager = {};
}

/** Any other suggester on that same base — the tag suggester, or one belonging to a plugin. */
class OtherSuggest extends EditorSuggest {}

/** A registry holding `suggests` in the order Obsidian would, plus a metadata cache. */
function appWith(suggests: unknown[], frontmatter: unknown = { fluent: true }): App {
  return {
    workspace: { editorSuggest: { suggests } },
    metadataCache: { getFileCache: () => ({ frontmatter }) },
  } as unknown as App;
}

/**
 * Install into `app`, and take the patch back off when the test ends.
 *
 * The patch goes on a class prototype, which every test in this file shares. An install that
 * outlived its test would still be wrapping the next one's — and wrapping it *underneath*, so the
 * inner patch would quietly transform a suggestion the outer one had decided to leave alone.
 */
function installFor(t: TestContext, app: App) {
  const result = installFluentTitles(app, OPTIONS);

  assert.equal(result.installed, true, "expected the fake registry to be patchable");
  t.after(() => {
    if (result.installed) result.uninstall();
  });

  return result;
}

/** Install into a fresh registry, returning everything a test needs to drive it. */
function install(t: TestContext, before = "about the ", frontmatter: unknown = { fluent: true }) {
  const suggest = new LinkSuggest();
  const other = new OtherSuggest();
  // A plugin's own suggester sits ahead of the built-in, which is why an index is unsafe.
  const app = appWith([other, suggest], frontmatter);
  const result = installFor(t, app);

  suggest.context = contextFor(before);
  // The decoy needs one too. Without it the transform would decline to guess and hand the item
  // back by identity, so every "the decoy is left alone" assertion would hold even if the patch
  // had gone on the shared base.
  other.context = contextFor(before);

  return { suggest, other, result };
}

test("a fluent title is lowercased on its way to the composer", (t) => {
  const { suggest } = install(t);
  const evt = { type: "keydown" };

  suggest.selectSuggestion(fileItem(), evt);

  const inserted: any = suggest.received[0]?.item;
  assert.equal(inserted.type, "alias");
  assert.equal(inserted.alias, "interiority");
  assert.equal(inserted.file, file, "the note must travel with the suggestion");
});

test("the context is taken from the live suggester on every call", (t) => {
  // The fake clears `context` as its first statement, exactly as `close()` does.
  //
  // Statement order inside the wrapper is not what this pins — it cannot go wrong, because the
  // adjusted item is an argument to the original call and so has to be computed first. What can go
  // wrong is *where* the context is read from: a wrapper that captured it when the patch was
  // installed, or read it off anything but the instance being called, sees the cleared value and
  // silently stops adjusting anything at all. That is what the assertion below catches.
  const { suggest } = install(t, "about the ");

  suggest.selectSuggestion(fileItem(), {});

  assert.equal(suggest.context, null, "the fake must really have cleared it");
  assert.equal((suggest.received[0]?.item as any).alias, "interiority");
});

test("the suggester is found by capability rather than by position", (t) => {
  // `suggests[0]` is another plugin's here. Finding the built-in by index would patch that one.
  const { suggest, other } = install(t);

  suggest.selectSuggestion(fileItem(), {});
  other.selectSuggestion(fileItem(), {});

  assert.equal((suggest.received[0]?.item as any).type, "alias");
  assert.equal((other.received[0]?.item as any).type, "file", "the decoy must be left alone");
});

test("only the link suggester's own prototype is patched", (t) => {
  // Patching the shared base would have Fluidity inspecting suggestions from every surface in the
  // app, including ones belonging to other plugins. The base is read through its own property
  // descriptor rather than off the prototype, so that what is compared is the function defined
  // there, not whatever the subclass may now be inheriting or shadowing.
  const stockOf = (o: object): unknown => Object.getOwnPropertyDescriptor(o, "selectSuggestion")?.value;
  const stock = stockOf(EditorSuggest.prototype);
  const { other } = install(t);

  assert.equal(stockOf(EditorSuggest.prototype), stock, "the shared base must be untouched");
  assert.ok(Object.hasOwn(LinkSuggest.prototype, "selectSuggestion"), "the patch belongs on the subclass");

  other.selectSuggestion(fileItem(), {});
  assert.equal((other.received[0]?.item as any).type, "file");
});

test("a suggestion type Fluidity does not handle arrives by identity", (t) => {
  // A block completion writes a block id into the target note. Handing the original the same
  // object it was going to get is the only safe thing to do with one.
  const { suggest } = install(t);
  const item: any = { type: "block", file, path: "Interiority.md" };

  suggest.selectSuggestion(item, {});

  assert.equal(suggest.received[0]?.item, item);
});

test("the event is handed on untouched", (t) => {
  // `evt` may be a MouseEvent or a KeyboardEvent, and the original needs the one it was given.
  const { suggest } = install(t);
  const evt = { which: 13 };

  suggest.selectSuggestion(fileItem(), evt);

  assert.equal(suggest.received[0]?.evt, evt);
});

test("a note that is not fluent reaches the composer exactly as it left the popup", (t) => {
  const { suggest } = install(t, "about the ", { fluent: false });
  const item = fileItem();

  suggest.selectSuggestion(item, {});

  assert.equal(suggest.received[0]?.item, item);
});

test("uninstalling puts the completer back", (t) => {
  const { suggest, result } = install(t);
  assert.equal(result.installed, true);
  if (!result.installed) return;

  result.uninstall();
  const item = fileItem();
  suggest.context = contextFor("about the ");
  suggest.selectSuggestion(item, {});

  assert.equal(suggest.received[0]?.item, item, "the wrapper should be gone, not merely inert");
});

test("a registry that does not look as expected is reported rather than thrown", () => {
  // Failure is a value because an Obsidian update can cause it, and because a plugin that throws
  // during onload is one that cannot be uninstalled from inside Obsidian.
  const registries: unknown[] = [
    {},
    { workspace: {} },
    { workspace: { editorSuggest: {} } },
    { workspace: { editorSuggest: { suggests: "not an array" } } },
    { workspace: { editorSuggest: { suggests: [{ noSuggestManager: true }] } } },
    { workspace: { editorSuggest: { suggests: [{ suggestManager: {} }] } } },
  ];

  for (const app of registries) {
    const result = installFluentTitles(app as App, OPTIONS);
    assert.equal(result.installed, false, `expected no patch for ${JSON.stringify(app)}`);
    if (!result.installed) assert.match(result.reason, /\S/);
  }
});

test("a transform that throws still inserts what Obsidian handed over", (t) => {
  // The keystroke belongs to the user. A failure to adjust a suggestion is not a reason to drop
  // one, so the wrapper falls through with the original item and says so once.
  const suggest = new LinkSuggest();
  const app = {
    workspace: { editorSuggest: { suggests: [suggest] } },
    metadataCache: {
      getFileCache: () => {
        throw new Error("metadata cache exploded");
      },
    },
  } as unknown as App;

  installFor(t, app);
  suggest.context = contextFor("about the ");

  const item = fileItem();
  const logged: unknown[] = [];
  const restore = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    suggest.selectSuggestion(item, {});
  } finally {
    console.error = restore;
  }

  assert.equal(suggest.received[0]?.item, item);
  assert.equal(logged.length, 1);
});
