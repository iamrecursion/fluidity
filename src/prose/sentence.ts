/**
 * Where a sentence begins, judged from the Markdown preceding a link.
 *
 * This module is the reason the casing rule is safe to apply at all: lowercasing a display text is
 * only right when the link sits mid-sentence, and the only evidence for that is the text already
 * on the line. It takes a string and answers a question about it, so it imports nothing and is
 * exercised entirely from `test/unit`.
 *
 * It is separate from `fluent/display` because the two answer different questions — this one is
 * about English and Markdown, that one is about a note's title — and because the second feature
 * will need this judgement without needing the casing rule.
 */

/**
 * Markers that may sit between the end of a sentence's preceding text and the link, without
 * moving where the sentence starts.
 *
 * Emphasis opened immediately before a link is part of the link's presentation, not part of the
 * prose, so `**[[Interiority]]** is …` starts a sentence. Opening quotes and brackets are the same
 * case: `("[[Interiority]] …` does too. Closing marks are deliberately absent — text before a
 * closing bracket is prose that has already begun.
 */
const TRANSPARENT_BEFORE_LINK = new Set([
  // Emphasis: bold, italic, highlight and strikethrough, in every length they come in.
  "*",
  "_",
  "=",
  "~",
  // Opening quotes and brackets, straight and curly, including the ones other languages open with.
  "\"",
  "'",
  "“",
  "‘",
  "„",
  "«",
  "‹",
  "(",
  "[",
  "{",
]);

/**
 * A blockquote or callout opener, which the rest of a line's structure may sit inside.
 *
 * Stripping it before anything else is what lets one set of patterns describe a heading, a bullet
 * or an ordered marker whether or not it is quoted. `> - ` is a bullet in a quote, and the bullet
 * is the part that says a sentence begins; `>` on its own says so too, having nothing after it.
 */
const QUOTE_PREFIX = /^\s*(?:>\s*)+(?:\[![^\]]*\][+-]?\s*)?/;

/** A line that is only Markdown structure: whatever follows it begins the line's prose. */
const STRUCTURE_ONLY = [
  // A heading marker, `#` through `######`.
  /^\s*#{1,6}$/,
  // A bullet, on its own or carrying a checkbox.
  /^\s*[-*+](?:\s+\[.\])?$/,
  // An ordered-list marker.
  /^\s*\d+[.)]$/,
];

/**
 * Sentence-ending punctuation, which must be followed by whitespace to count.
 *
 * `:` and `;` are here as a judgement call rather than a grammatical rule: a colon is how most
 * people write a lead-in, and what follows one reads as a new clause. The feature reference says
 * so plainly, and records it as the behavior most likely to become a setting.
 *
 * Closing quotes and brackets may sit between the punctuation and the space, because a sentence
 * that ends inside quotation marks or parentheses has still ended: `He said "It ends." ` and
 * `(see above.) ` both close one.
 */
const TERMINATED = /[.!?:;]["'”’»›)\]}]*\s+$/;

/**
 * The CJK terminators, which do not take a following space in ordinary use.
 *
 * Their width carries the break that a space carries in Latin script, so requiring whitespace
 * after them would mean never recognising a sentence boundary in Japanese or Chinese prose.
 */
const TERMINATED_CJK = /[。！？]\s*$/;

/**
 * A table cell, which begins after the `|` that opens it.
 *
 * This is matched against the end of the text rather than the whole of it, because the cells
 * before it on the row are prose of their own: `| a | [[…]]` opens a cell just as `| [[…]]` does.
 * A `|` in ordinary prose reads as a cell opener here too, which keeps a capital that could have
 * been lowered — the direction this module fails in everywhere else.
 */
const CELL_OPENER = /\|\s*$/;

/**
 * Does a sentence begin where this text ends?
 *
 * `before` is the text on the line up to the `[[` that opened the completion — see
 * `suggest/transform`, which reads it off the completer's own context rather than inferring it.
 *
 * Where this is wrong, it is wrong in the direction of answering `true`: the caller then leaves a
 * capital alone that might have been lowered, which is visible and fixable, rather than lowering
 * one that should have stayed. That is what makes the punctuation cases below safe to keep simple.
 * A `.` is treated as a boundary even when it ends a decimal, an abbreviation, a URL or a span of
 * inline code; each of those reads as a sentence start here and so keeps its capital.
 */
export function startsSentence(before: string): boolean {
  const text = withoutTransparentMarkers(before);

  // Nothing but whitespace: the link opens the line, and a line opens a sentence. This is the one
  // place the judgement is made within a single line rather than across the paragraph above it.
  if (text.trim() === "") return true;

  // A quote or callout opener is structure in its own right, and what follows it on the line is
  // judged exactly as it would be unquoted — so `>`, `> ## `, `> - ` and `> [!note] - ` all open a
  // sentence, and a bullet inside a callout is not treated as running prose.
  const structure = text.trimEnd().replace(QUOTE_PREFIX, "");
  if (structure === "") return true;
  if (STRUCTURE_ONLY.some((pattern) => pattern.test(structure))) return true;

  return TERMINATED.test(text) || TERMINATED_CJK.test(text) || CELL_OPENER.test(text);
}

/** Drop the run of emphasis, quote and bracket characters sitting directly against the link. */
function withoutTransparentMarkers(before: string): string {
  let end = before.length;
  while (end > 0 && TRANSPARENT_BEFORE_LINK.has(before[end - 1])) end -= 1;
  return before.slice(0, end);
}
