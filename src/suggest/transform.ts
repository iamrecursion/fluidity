/**
 * The decision: which suggestion should Obsidian be asked to insert?
 *
 * This is the seam the whole plugin is arranged around. Everything above it is about reaching the
 * completer at all; everything below it is pure. The module itself is thin and delegating on
 * purpose — it decides whether a suggestion is ours to touch, gathers the three facts the rule
 * needs, and hands off.
 *
 * It imports Obsidian for types only, which TypeScript erases, so it carries no runtime edge to
 * the app and is exercised from `test/unit` against ordinary objects.
 *
 * Nothing here builds link text. Obsidian's own composer turns a suggestion into a link, and it
 * already knows about Wikilinks-versus-Markdown and every other setting a user may have moved;
 * adjusting the suggestion inherits all of that, and keeps the insertion a single transaction.
 */

import type { App, EditorSuggestContext } from "obsidian";

import { fluentDisplay } from "../fluent/display";
import { isFluent } from "../fluent/frontmatter";
import { startsSentence } from "../prose/sentence";
import { isAliasSuggestion, isFileSuggestion, type LinkSuggestion } from "./item";

/** What the rule needs to know from the user, pending the settings tab. */
export interface TransformOptions {
  /** The frontmatter property that marks a note fluent. */
  property: string;
}

/** The `[[` that opened the completion, which sits immediately before the context's start. */
const LINK_OPENER_LENGTH = 2;

/** What turns that opener into an embed, `![[`, rather than a link. */
const EMBED_MARKER = "!";

/**
 * Adjust a suggestion on its way to Obsidian's composer, or return it untouched.
 *
 * Returning the argument **by identity** is how "not ours" is expressed: an unhandled type, a note
 * that is not fluent, a link at a sentence start, and a transform that would change nothing all
 * take that path. The last of those is what stops an already-lowercase title from producing
 * `[[interiority|interiority]]`.
 *
 * `app` is here because fluency is the vault's own data, read from the metadata cache rather than
 * by parsing a file. Keeping that read on this side of the seam leaves `suggest/patch` with no
 * decisions of its own to make.
 */
export function transformSuggestion(
  app: App,
  item: LinkSuggestion,
  context: EditorSuggestContext | null,
  options: TransformOptions,
): LinkSuggestion {
  if (!isAliasSuggestion(item) && !isFileSuggestion(item)) return item;

  // Without the context there is no cursor, so there is no way to tell a sentence start from the
  // middle of a clause. Declining to guess leaves the completer behaving exactly as it does
  // without the plugin, which is the right answer to not knowing.
  if (context === null) return item;

  // The same completer serves `![[`, and an embed is not a link in running text: it renders the
  // note, and what follows the pipe there is a display argument rather than prose. The `!` left
  // sitting before the opener is the only thing that tells the two apart.
  const before = textBeforeLink(context);
  if (before.endsWith(EMBED_MARKER)) return item;

  const frontmatter = app.metadataCache.getFileCache(item.file)?.frontmatter;
  if (!isFluent(frontmatter, options.property)) return item;

  // An alias item carries the text that will follow the `|`; a file item has none, because the
  // composer derives the display text from the note's own title.
  const displayText = item.type === "alias" ? item.alias : item.file.basename;
  const fluent = fluentDisplay(displayText, startsSentence(before));
  if (fluent === displayText) return item;

  // The item belongs to Obsidian's suggester and may well be reused, so it is shallow-cloned
  // before anything is changed.
  //
  // A file item becomes an alias item carrying the fluent form. There is no display text on a file
  // item to adjust, and the composer sets `alias = display = item.alias` for an alias item without
  // collapsing case — which is the entire fluent-titles feature, and is the one thing
  // `generateMarkdownLink` will not do.
  return { ...item, type: "alias", alias: fluent };
}

/**
 * The text on the line up to the `[[` being completed.
 *
 * This comes off the completer's own context, which is a real advantage of patching it: every
 * other route to this feature has to infer what was just typed from a diff of the document.
 */
function textBeforeLink(context: EditorSuggestContext): string {
  const line = context.editor.getLine(context.start.line);
  return line.slice(0, Math.max(0, context.start.ch - LINK_OPENER_LENGTH));
}
