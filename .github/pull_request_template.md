<!-- Thanks for the contribution. Please read docs/CONTRIBUTING.md if you have not already. -->

## Description

<!-- What the change does, and why. If it fixes an issue, say `Fixes #123`. -->

## How it was Verified

<!--
`make check` is necessary but rarely sufficient. This plugin's entire job happens at the moment you
pick a suggestion from a popup, and nothing in the test suite can press Enter. Say which surfaces you
actually exercised, and on what.
-->

- [ ] `make check` passes from a clean tree (format, typecheck, lint, unit + integration tests)
- [ ] Exercised in a real vault — surfaces touched:
- [ ] Checked with **Use [[Wikilinks]]** both on and off (only if the change touches what is
      inserted)
- [ ] Undo still puts the note back in one step

## Tests

- [ ] New behavior has tests, or this section says why it cannot
- [ ] Pure logic is tested in `test/unit/` (no Obsidian imports anywhere in its import graph)
- [ ] Assumptions about Obsidian's internals are pinned in `test/integration/`

## Docs

- [ ] `docs/features.md` has been updated if behavior changed
- [ ] `docs/architecture.md` has been updated if the module structure changed, or if what the plugin
      assumes of Obsidian's internals changed
- [ ] Module headers say what any new module is and _why_ it is separate from its neighbors

## Reaching Past the Public API

<!-- Only relevant if this touches src/suggest/patch.ts or anything it depends on. -->

- [ ] The built-in suggester is still located **by capability**, never by index and never by class
      name
- [ ] The patch is installed on the located instance's own prototype, not on `EditorSuggest`'s
- [ ] Everything the patch reads from the suggester is read **before** delegating to the original
- [ ] Suggestion types the plugin does not handle are passed through untouched, by identity
- [ ] Failure is a logged line and a disabled feature, never a throw during `onload`
- [ ] The patch uninstalls cleanly when the plugin is disabled

## Naming

<!-- Only relevant if this touches user-facing strings or persisted identifiers. -->

- [ ] No change to the settings keys in `data.json`, the default frontmatter property name, or the
      plugin `id` — each of these is already written into somebody's vault
- [ ] Any new setting has a default that leaves existing behavior alone

## Anything Else

<!-- Trade-offs you made, things you were unsure about, things you would like looked at closely. -->
