/**
 * Finding Obsidian's link completer and wrapping the method that inserts a choice.
 *
 * This is the only module that touches Obsidian's internals, and it is deliberately the smallest
 * one that can be: it locates an object the app never exposes, wraps a single method, captures the
 * one piece of state that method destroys, and delegates. It makes no decisions — `suggest/item`
 * says what may be touched and `suggest/transform` says what it becomes.
 *
 * Everything in here is a response to something that otherwise goes wrong, and the architecture
 * doc records each one. Nothing in this file throws: a plugin that breaks Obsidian's startup is a
 * plugin nobody can uninstall from inside Obsidian.
 */

import { around } from "monkey-around";
import type { App, EditorSuggestContext } from "obsidian";

import type { LinkSuggestion } from "./item";
import { type TransformOptions, transformSuggestion } from "./transform";

/**
 * The built-in link suggester, as much of it as Fluidity depends on.
 *
 * `context` carries the cursor position, and therefore the words before the link, and therefore
 * whether this is a sentence start.
 */
interface LinkSuggest {
  context: EditorSuggestContext | null;
  constructor: { prototype: LinkSuggestPrototype; };
}

type SelectSuggestion = (this: LinkSuggest, item: LinkSuggestion, evt: MouseEvent | KeyboardEvent) => void;

/**
 * The prototype the patch is installed on.
 *
 * The index signature is `any` because that is what `around` requires of what it wraps: it types
 * the object it is handed as `Record<string, any>`, and an index signature of `unknown` narrows
 * every wrapper factory to one that cannot be handed a real method.
 */
interface LinkSuggestPrototype extends Record<string, any> {
  selectSuggestion: SelectSuggestion;
}

/**
 * Whether the patch went on, and how to take it off again.
 *
 * A failure is a value rather than an exception because it is an expected outcome — an Obsidian
 * update is entirely capable of moving what this attaches to — and because the settings tab has to
 * be able to report it.
 */
export type PatchResult =
  | { installed: true; uninstall: () => void; }
  | { installed: false; reason: string; };

/**
 * Wrap the completer's `selectSuggestion` so that a fluent note's link reads as prose.
 *
 * The returned uninstaller belongs in `plugin.register()`, so that disabling Fluidity puts the
 * completer back exactly as it was.
 */
export function installFluentTitles(app: App, options: TransformOptions): PatchResult {
  try {
    const builtin = findLinkSuggest(app);
    if (builtin === null) {
      return { installed: false, reason: "the built-in link suggester was not found" };
    }

    const prototype = builtin.constructor?.prototype;
    if (typeof prototype?.selectSuggestion !== "function") {
      return { installed: false, reason: "the link suggester has no selectSuggestion to wrap" };
    }

    // The patch goes on the located instance's own prototype, never on `EditorSuggest`'s. That one
    // is shared with the tag suggester, the footnote suggester, and every suggester every other
    // plugin has registered — patching it would have Fluidity inspecting suggestions from surfaces
    // it knows nothing about.
    //
    // `monkey-around` rather than a hand-rolled wrapper because it composes: several plugins wrap
    // this same method, and its uninstaller is written so that removing one out of order does not
    // strand the others.
    const uninstall = around(prototype, {
      selectSuggestion: (old: SelectSuggestion): SelectSuggestion =>
        function(this: LinkSuggest, item: LinkSuggestion, evt: MouseEvent | KeyboardEvent): void {
          // Read before delegating. The original calls `this.close()` as its first statement, and
          // `close()` clears `this.context` — so reading it afterwards reads null. This is the
          // kind of thing that works perfectly against a fake and fails on the first keystroke.
          const context = this.context;

          let chosen = item;
          try {
            chosen = transformSuggestion(app, item, context, options);
          } catch (error) {
            // A failure to adjust is not a reason to swallow the user's keystroke: fall through
            // with what Obsidian handed us, which inserts exactly what it would have without the
            // plugin.
            console.error("Fluidity: adjusting a completion failed, inserting it unchanged", error);
          }

          return old.call(this, chosen, evt);
        },
    });

    return { installed: true, uninstall };
  } catch (error) {
    return { installed: false, reason: `installing the completer patch failed: ${String(error)}` };
  }
}

/**
 * Locate the built-in link suggester **by capability**.
 *
 * `app.workspace.editorSuggest` holds `suggests: EditorSuggest[]`, and dispatch is first non-null
 * `onTrigger` wins, in array order. The built-in is `suggests[0]` at startup, but plugins
 * `unshift` their own ahead of it, so an index is unsafe.
 *
 * A class name is worse than unsafe: in a release build the minified name is literally `"t"`, so a
 * filter testing it is a silent no-op that never fires and never complains. At least one published
 * plugin has exactly that bug. `suggestManager` is a property only the link suggester carries.
 */
function findLinkSuggest(app: App): LinkSuggest | null {
  const registry = (app.workspace as unknown as { editorSuggest?: { suggests?: unknown[]; }; }).editorSuggest;
  const suggests = registry?.suggests;
  if (!Array.isArray(suggests)) return null;

  const builtin = suggests.find((candidate) =>
    typeof candidate === "object" && candidate !== null && "suggestManager" in candidate
  );

  return (builtin as LinkSuggest | undefined) ?? null;
}
