/**
 * What Fluidity remembers between sessions, and what to believe when it reads it back.
 *
 * Obsidian persists a plugin's settings as `data.json` beside the plugin, and hands them back as
 * whatever `JSON.parse` made of that file. It is not a trustworthy shape: it is a file a user can
 * open and edit, it may have been written by an older version of this plugin, and it may be absent
 * entirely on a first run. The usual `Object.assign({}, DEFAULTS, await loadData())` accepts every
 * one of those without comment.
 *
 * So the record is not merged, it is **rebuilt**: every field is checked, and one that does not
 * hold the type it is declared with falls back to its default. That makes a corrupt file degrade
 * to stock behavior rather than to something strange. This is abnormal for a plugin, but important
 * given that fluidity reaches into Obsidian's internals.
 *
 * It imports nothing, which is what lets `settings/tab` render it and `main` persist it without
 * either of them being needed to test the rules.
 */

/** Everything about Fluidity that a user can change. */
export interface FluiditySettings {
  /**
   * The master toggle.
   *
   * Off means the completer is not patched at all, rather than patched and inert — Fluidity's one
   * real risk is reaching past the public API, and an off switch that leaves the wrapper in place
   * does not retire that risk for whoever reached for it.
   */
  fluentTitles: boolean;

  /**
   * The frontmatter property that marks a note fluent.
   *
   * Renaming it migrates nothing: notes still carrying the old property simply stop being treated
   * as fluent. It exists for vaults where `fluent` already means something else.
   */
  fluentProperty: string;
}

/** What Fluidity does before anybody has told it otherwise. */
export const DEFAULT_SETTINGS: FluiditySettings = {
  fluentTitles: true,
  fluentProperty: "fluent",
};

/**
 * Build a settings record from whatever was stored, falling back per field.
 *
 * Per **field** rather than per record, because the two settings are independent: a `data.json`
 * that has been hand-edited into an unusable `fluentProperty` should not also silently flip the
 * master toggle back on.
 */
export function normalizeSettings(stored: unknown): FluiditySettings {
  const raw: Record<string, unknown> = typeof stored === "object" && stored !== null
    ? stored as Record<string, unknown>
    : {};

  return {
    fluentTitles: typeof raw.fluentTitles === "boolean" ? raw.fluentTitles : DEFAULT_SETTINGS.fluentTitles,
    fluentProperty: normalizeProperty(raw.fluentProperty),
  };
}

/**
 * The property name to actually look for, given what was typed or stored.
 *
 * Surrounding whitespace is dropped because it is invisible in both the settings field and the
 * property editor, so a stray space would read as the feature being broken rather than as a typo.
 * Nothing else is corrected: a property name is the user's own vocabulary, and the only wrong
 * answer is one that cannot name a property at all.
 *
 * It is exported because the settings tab normalizes each keystroke through it, which is what lets
 * an empty field mean "the default" rather than "match a property with no name".
 */
export function normalizeProperty(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.fluentProperty;

  const trimmed = value.trim();
  return trimmed === "" ? DEFAULT_SETTINGS.fluentProperty : trimmed;
}
