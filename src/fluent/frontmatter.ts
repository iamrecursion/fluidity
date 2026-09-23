/**
 * Reading fluency out of a note's frontmatter.
 *
 * The property is read from a plain object rather than from a file, which keeps this module free
 * of Obsidian and lets the caller decide where the frontmatter came from. In the plugin that is
 * always the metadata cache, so there is no file read between a keypress and an insertion.
 *
 * It is separate from `fluent/display` because this one is about what a note says about itself and
 * that one is about the text being written; the second feature reads the same frontmatter for a
 * different purpose, and will read it through here.
 */

/**
 * Is this note marked fluent — does its title name a common noun rather than a proper one?
 *
 * The value must be a real boolean. `fluent: "true"` is a string and does not mark the note, which
 * is deliberate: Obsidian's property editor writes a real boolean for a checkbox property, so a
 * string is a typo, and silently honoring one would mean a typo changing how links are written.
 *
 * `frontmatter` is typed loosely because that is what it is — a parsed YAML mapping, which may be
 * absent, may be any shape, and is not ours to trust.
 */
export function isFluent(frontmatter: unknown, property: string): boolean {
  if (typeof frontmatter !== "object" || frontmatter === null) return false;
  return (frontmatter as Record<string, unknown>)[property] === true;
}
