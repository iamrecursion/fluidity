/**
 * The suggestion items the link completer hands to `selectSuggestion`, and the two Fluidity will
 * touch.
 *
 * None of these shapes are published by Obsidian, so they are declared here rather than imported,
 * and this file is the single written statement of what the plugin believes they look like. The
 * architecture doc records why each belief is held; if one turns out to be wrong, this is the file
 * that was wrong.
 *
 * It is separate from `suggest/transform` so that the shapes can be described once and asserted
 * against without pulling in the decision that reads them.
 */

import type { TFile } from "obsidian";

/** A completion for a note itself: its title, with no alias involved. */
export interface FileSuggestion {
  type: "file";
  file: TFile;
  path: string;
}

/** A completion for one of a note's aliases, carrying the text that will follow the `|`. */
export interface AliasSuggestion {
  type: "alias";
  alias: string;
  file: TFile;
  path: string;
}

/**
 * Everything else the completer can produce — headings, block references, plain link text, and the
 * `{ type: "none" }` that `Shift+Enter` passes directly.
 */
export interface UnhandledSuggestion {
  type: string;
}

/** What `selectSuggestion` is called with. */
export type LinkSuggestion = FileSuggestion | AliasSuggestion | UnhandledSuggestion;

/**
 * Is this a completion for a note's own title?
 *
 * The checks on the note are not defensive padding. These objects come from code this plugin does
 * not own, across an interface nobody has promised to keep, and a guard that only reads `type`
 * would hand a malformed item to the transform and turn a missing field into a crash
 * mid-keystroke.
 */
export function isFileSuggestion(item: LinkSuggestion): item is FileSuggestion {
  return item.type === "file" && carriesBasename(item);
}

/**
 * Is this a completion for one of a note's aliases?
 *
 * Every other suggestion type is passed through untouched and by identity. That is not tidiness: a
 * `block` item writes a block id into the *target* file when it is selected, so a plugin that
 * intercepts one and returns something slightly different is a plugin that corrupts notes.
 */
export function isAliasSuggestion(item: LinkSuggestion): item is AliasSuggestion {
  return item.type === "alias" && carriesFile(item) && typeof (item as AliasSuggestion).alias === "string";
}

/** Does the item carry the note it refers to, as both handled types are expected to? */
function carriesFile(item: LinkSuggestion): boolean {
  const file = (item as { file?: unknown; }).file;
  return typeof file === "object" && file !== null;
}

/**
 * Does the item carry a note with the title a file completion's display text comes from?
 *
 * This is the whole check for a file item, and subsumes `carriesFile`: nothing without a note has
 * a `basename` on it. The title is checked rather than assumed because the transform reads
 * `file.basename` and lowercases it, so an item whose note lacks one throws on the keystroke —
 * caught, but logged, and for a completion that was never ours to touch.
 */
function carriesBasename(item: LinkSuggestion): boolean {
  const file = (item as { file?: { basename?: unknown; }; }).file;
  return typeof file?.basename === "string";
}
