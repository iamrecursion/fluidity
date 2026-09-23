/**
 * The casing rule: what a fluent note's link should actually say.
 *
 * Every casing decision in the plugin goes through this one function, which is what makes the rule
 * replaceable. The roadmap's per-note override language changes this body and nothing else.
 *
 * It is separate from `suggest/transform` because that module decides *whether* a suggestion is
 * ours to touch and this one decides *what the text becomes*; the first is about Obsidian's
 * internals and the second is about English.
 */

/**
 * The display text to insert for a fluent note, given the text Obsidian would have inserted.
 *
 * Whether the note is fluent at all is settled before this is called — that question belongs to
 * `fluent/frontmatter`, and asking it again here would mean two modules answering it.
 *
 * The rule is blunt on purpose: it lowercases the whole display text, so
 * `Object Oriented Programming` comes out right and `History of France` does not. That cost is
 * accepted for the first version, and documented where users will meet it — the point of v1 is to
 * establish that patching the completer is reliable, and a casing rule with no configuration
 * surface keeps that question clean.
 *
 * Lowercasing is locale-aware, so non-ASCII scripts behave as the reader's locale expects rather
 * than as ASCII would have it.
 */
export function fluentDisplay(displayText: string, atSentenceStart: boolean): string {
  if (atSentenceStart) return displayText;
  return displayText.toLocaleLowerCase();
}
