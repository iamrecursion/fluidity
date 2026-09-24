# Contributing

Thanks for taking an interest in contributing to Fluidity! This document covers getting a working
checkout, building the plugin, testing it in a real vault, and how a release is cut.

Before you write anything substantial, please open an
[issue](https://github.com/iamrecursion/fluidity/issues/new/choose) or a
[discussion](https://github.com/iamrecursion/fluidity/discussions). This plugin reaches past
Obsidian's public API to do its job, and the constraints that come with that are subtle and
non-obvious so it is worth reading [the architecture doc](./architecture.md) first, as it explains
the surprising parts of the design.

## Getting Started

This repository ships a [Nix](https://lix.systems) flake, which is the single definition of this
project's toolchain. CI runs inside the same shell, executing the same `make` targets, so using the
`make` targets is the best way to replicate CI locally. We recommend installing
[Nix](https://lix.systems/install/) before anything else.

```sh
git clone https://github.com/iamrecursion/fluidity.git
cd fluidity
nix develop        # or: make shell
make deps          # npm ci, plus the esbuild binary for every platform sharing the checkout
make build         # type-check and bundle main.js
make check         # exactly what CI runs
```

Every `make` target wraps itself in `nix develop --command` when you are not already inside the
shell, so `make check` works from a bare terminal too while being a little slower to start.

`make help` lists every target, but the main ones you will use are these:

| Target              | What it Does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `make build`        | typecheck + bundle — a release `main.js`                                |
| `make dev`          | rebuild `main.js` on change, with sourcemaps                            |
| `make install`      | build, then copy the plugin into `$DEV_VAULT_PATH`                      |
| `make link`         | symlink this checkout's files into `$DEV_VAULT_PATH` instead of copying |
| `FORCE=1 make link` | the same, taking over an install or a link to another checkout          |
| `make unlink`       | swap those symlinks back for a copied build                             |
| `make check`        | **everything CI checks**: format, typecheck, lint, all tests            |
| `make test-unit`    | the pure tests only — fast                                              |
| `make format`       | reformat Markdown, JSON, CSS and TypeScript with dprint                 |
| `make clean`        | drop build output, keep `node_modules`                                  |

Building without Nix is possible as the toolchain is only Node, and `npm ci && npm run build` is
exactly what Obsidian's plugin review runs, so CI checks that path on every push. You will want
**Node 24** to match the devshell, and at a minimum Node 22, because the test runner is handed a
`**` glob that older versions cannot expand. `make format` needs `dprint` on your `PATH` at the
version `ci.yml` pins.

### Testing in a Real Vault

**This is not optional for anything that touches the patch.** Fluidity's entire job happens at the
moment you pick a suggestion out of a popup, and nothing in the test suite can exercise that. A
change that passes `make check` has been shown not to be obviously broken, but not to be _working_.

When installing a plugin, Obsidian copies `main.js`, `manifest.json` and `styles.css` into the
plugin folder, so `make install` does the same:

```sh
export DEV_VAULT_PATH=~/vaults/dev
make install
```

The destination folder is named from `manifest.json`'s `id`, so it cannot drift from what Obsidian
looks for. The target refuses a path with no `.obsidian` directory in it, and checks that **before**
building rather than after. Obsidian does not notice the new files on its own, so you will need to
reload the app (or toggle the plugin off and back on).

For rapid development, `make link` fills `<vault>/.obsidian/plugins/<id>/` with symlinks to this
checkout's `main.js`, `manifest.json` and `styles.css` instead of copying them. Obsidian follows
each one, so a rebuild is live in the vault with no second step, which pairs well with leaving
`make dev` running.

```sh
export DEV_VAULT_PATH=~/vaults/dev
make link
```

It takes the same two guards as `make install` and deliberately does not build, since the intent is
that you link once and leave `make dev` running — so a fresh checkout has no `main.js` yet, its link
dangles, and the target says so rather than leaving you with a plugin Obsidian cannot load. Settings
Obsidian writes land in the vault folder beside the links. Reloading is still on you, as Obsidian
does not watch the files for changes.

By default it refuses a destination that is already occupied, because those files are somebody's.
`FORCE=1 make link` takes one over, but will never:

- **Remove the plugin directory.** A copied install loses the plugin's three files _by name_, which
  this checkout rebuilds in a second. Anything else in the folder stays.
- **Follow a symlink.** A whole-folder link is removed with no trailing slash, so the checkout on
  the other end is untouched.
- **Remove `data.json`.** It is the one thing in that folder nobody can regenerate, so it is left
  where it lies.
- **Operate on a unrecognized destination.** Force is permission to replace this plugin's files, not
  a licence to guess at somebody else's.

The plugin folder is a real directory and only its contents are links, which is what makes it safe
to remove. `rm` deletes a symlink rather than following it, so clearing the folder out costs three
links that `make link` rebuilds in a second. A folder that is _itself_ one symlink does not have
that property: `rm -rf <folder>/`, carrying the trailing slash that shell completion appends for
you, deletes the contents of the checkout it points at, silently and with nothing reported.

`make unlink` is the way back. It replaces the links with the files they point at, leaving the vault
with an ordinary install:

```sh
export DEV_VAULT_PATH=~/vaults/dev
make unlink
```

Its job is to get a vault off a checkout, so a build it cannot run does not stop it: with a
`main.js` already in the checkout it installs that one and says so, and only a destination with
nothing to copy at all is an error. That matters on a machine which only runs Obsidian, where the
toolchain may not work and where failing would leave a hand-written `rm` as the only way out.

A folder that is itself a symlink to a whole checkout is converted too, and that checkout's
`data.json` is copied across, since that is where a plugin linked that way keeps its settings.

### What to Check by Hand

Any change to what gets inserted should be exercised against at least this much:

1. A note with `fluent: true`, linked **mid-sentence** and at a **sentence start** — after a
   heading, after a bullet, after a checkbox, inside a blockquote, and after a `Note:` lead-in.
2. A **multi-word** fluent title, and one of its **aliases**.
3. A note with no `fluent` property, and one with `fluent: false`, which should both be completely
   untouched.
4. **Undo**, which must cost exactly as many steps as it does with the plugin disabled. Accepting
   any completion takes two in stock Obsidian, one for the completion and one for the typing, so
   count both ways rather than expecting one. A fluent insertion costing more than a control does
   means the plugin is rewriting text after insertion, and that is a bug regardless of what the undo
   produces.
5. Selection by **mouse click**, by **Enter**, and by **Tab**.
6. `#`, `^` and `|` completions, which must behave exactly as they do without the plugin.
7. **Use `[[Wikilinks]]` turned off**, where the same choice must produce a well-formed Markdown
   link.
8. **Disabling the plugin**, after which the completer must behave as stock without any intervention
   from the monkey patch.

Any change to settings should be exercised against this much:

1. The **status line**, which must read **Active** in green behind a checkmark on a working vault,
   and **Inactive** in red behind a crossed octagon the moment the master toggle is turned off. A
   missing icon means Obsidian's Lucide knows neither name `settings/tab` tries for it.
2. The **master toggle off**, after which a fluent note completes exactly as it does with the plugin
   disabled — and **on again**, after which it adjusts once more without a reload.
3. A **renamed property**, which must take effect on the very next completion with no reload: the
   note carrying the old property stops being adjusted, and one carrying the new one starts.
4. **Clearing the property field**, which means `fluent` and shows it as a placeholder.
5. **Reopening the tab**, and restarting Obsidian, after which both settings read back as they were
   left.
6. Searching Obsidian's own **settings search** for `fluent`, which must find both settings.

## Tests

The tests are split across two suites, and the split is crucial to our testing strategy:

- **`test/unit/`** runs under plain Node with **no Obsidian**. A unit test can therefore only load a
  module whose _entire transitive import graph_ is Obsidian-free. That is what keeps the pure layer
  pure: adding an `import { Notice } from "obsidian"` to the sentence detector makes its test stop
  loading, immediately and loudly. If a change means a pure module has to reach for Obsidian, the
  answer is **almost always a second module**, not a looser rule.
- **`test/integration/`** is for things that can only be learned by running something real. Today
  that means the actual esbuild build, as the bundle's externals are checked by building it and
  reading what it requires, and pinning the assumptions the patch makes about Obsidian's internal
  shapes against a fake suggester built to match them.

Both suites mirror `src/`'s folders, so a module's tests sit at the matching path — the sentence
detector at `src/prose/sentence.ts` is covered by `test/unit/prose/sentence.test.ts`. The runner is
given a `**` glob rather than a directory list, so a new folder needs no explicit wiring.

The integration suite **cannot** catch Obsidian changing as nothing outside a real vault can. What
it does is make what we _assume_ explicit and greppable, so that when something breaks there is a
written statement of the belief that turned out to be false.

When fixing a bug, the useful question is **which suite would have caught it**, and the honest
answer is sometimes "neither, only the vault". In this case say so in the pull request and add the
case to the manual list above.

## Style

Coding style in this repository is mostly automated, so just keep the following in mind:

- **Passing `make check` is Not Optional:** This checks formatting, the typecheck, linting, and runs
  both test suites. `src/` is expected to be completely warnings clean, while `test/` has documented
  exemptions in `eslint.config.mjs`. Adding an exception will be subject to significant scrutiny and
  require justification.
- **dprint Handles Formatting:** Run `make format` rather than arguing with it; a rename that
  changes a name's alphabetical position will reorder an import block, and that is fine.
- **Keep `src/` Organized:** It is grouped by concern with one folder each, and a folder holds all
  layers of what it is concerned with. If the files need to change together, they probably should
  live in the same concern. The [architecture doc](./architecture.md#the-shape-of-src) describes
  what each folder holds.
- **Module Headers are Useful:** Nearly every file in `src/` opens with a comment describing what it
  is and why it is separate from its neighbors. All new modules should do this. Name siblings by
  their path inside `src` so references stay unambiguous.
- **Explain Non-Obvious Things:** A good deal of this plugin exists because of things Obsidian does
  that are not written down anywhere. Where the code depends on one of them, the comment saying so
  is the most valuable line in the file — it is what lets the next person tell a deliberate choice
  from an accident.
- **Wrap Comments at 100 Columns:** `make check` enforces the ceiling through ESLint's `max-len`,
  because dprint will not: its `lineWidth` of 120 applies to _code_, and its TypeScript plugin
  treats a comment's text as opaque. The rule reports but cannot fix, so re-wrapping is by hand —
  prose fills to 100, and a bullet's continuation lines align under its text. Dividers, fenced
  samples, and tooling directives such as `// eslint-disable-next-line` are exempt and should be
  left alone; a wrapped directive silently stops working.

## Reaching Past the Public API

Obsidian exposes no way to influence what the link completer inserts, so Fluidity patches it. That
is an accepted and reasonably common thing to do in this ecosystem, but it comes with rules, and a
pull request that breaks one of them will be sent back:

- **Locate the built-in suggester by capability**, never by index and never by class name. Plugins
  put their own suggesters ahead of it in the array, and the class name is minified to a single
  letter in a release build.
- **Patch the located instance's own prototype**, not `EditorSuggest`'s. The latter is shared with
  every other suggester in the app, including ones set up by other plugins.
- **Read what you need before delegating** as the original clears the state you want to read in its
  first statement.
- **Never reimplement the insertion.** Adjust the suggestion and hand it back. That is what makes
  the result honor link-format settings, and what keeps the insertion one editor transaction, so
  undo costs no more than it does without the plugin.
- **Pass through what you do not handle**, untouched and by identity. Some suggestion types write to
  files when selected, and intercepting one of those is how a plugin corrupts a note.
- **Fail quietly** if the patch cannot be installed, log one line naming the plugin, disable the
  feature, and surface it in the settings tab. Never throw during `onload`; a plugin that breaks
  Obsidian's startup is a plugin nobody can uninstall from inside Obsidian.

The [architecture doc](./architecture.md#things-obsidian-does-not-officially-support) records each
assumption and what happens when it no longer holds. If you add an assumption, add it there.

## Pull Requests

Making a PR in this repository follows the standard workflow.

1. Branch off `main`. Keep a PR to one change; we don't want to review two things happening at once.
   Feel free to use stacked PRs where relevant.
2. State explicitly what you verified. `make check` passing is necessary but rarely sufficient here,
   so please say what you did in a vault, and with which link format.
3. Update docs in sync. The [features doc](./features.md) documents behavior, and the
   [architecture doc](./architecture.md) documents structure, intent, and what is being assumed.

Reviews in general will focus on whether a change makes a class of bug impossible rather than fixing
one instance of it. This is the standard that all existing development has been held to.

## Continuous Integration

There are four CI workflows, and none of them do anything you cannot run locally.

- [`ci.yml`](../.github/workflows/ci.yml) runs on every push and PR. It does the equivalent of
  `make check` plus a full build, and separately builds the plugin with **plain `npm`, outside the
  devshell** — which is exactly what Obsidian's plugin review does, and the only job that can catch
  the build quietly acquiring a dependency on a tool the devshell happens to provide.
- [`release.yml`](../.github/workflows/release.yml) runs on every version tag. See
  [below](#releasing).
- [`nix.yml`](../.github/workflows/nix.yml) runs on flake or workflow changes, plus weekly. It
  checks the flake, its formatting, and that the versions pinned inside it still agree with the rest
  of the repository.
- [`update-flake-lock.yml`](../.github/workflows/update-flake-lock.yml) runs monthly and opens a PR
  with `nix flake update` having been run.

If you bump dprint in the flake, you must bump `dprint-version` in `ci.yml` to match and run
`make format`; `nix.yml` will tell you if you forget.

## Releasing

Obsidian resolves a release by looking for a **git tag identical to `manifest.json`'s `version`** —
`1.0.0`, never `v1.0.0`. `.npmrc` sets `tag-version-prefix=` so `npm version` cannot get this wrong;
do not remove it.

```sh
make check                     # green, from a clean tree
npm version <major|minor|patch>
```

`npm version` runs `version-bump.mjs`, which writes the new version into `manifest.json` and adds a
`versions.json` entry mapping it to the current `minAppVersion`, then stages both. Then:

```sh
git push --follow-tags
```

The release workflow validates the tag against both `manifest.json` and `package.json`, checks for
the `versions.json` entry, builds, and opens a **draft** release with `main.js`, `manifest.json`,
and `styles.css` attached as individual root-level assets. Obsidian does not look inside a source
archive. Review the draft, then publish it, as Obsidian only sees published releases.

`test/unit/release/metadata.test.ts` asserts the same invariants against the working tree, so a
version bump that does not add up fails `make check` rather than failing after the tag is already
pushed. The workflow keeps its own copy of those checks because a tag can be pushed at any commit.

The released assets carry a build provenance attestation, and Obsidian's review builds the tagged
source and compares the result against the released `main.js`. Do not rebuild or hand-edit an asset
after the fact: it breaks that comparison and drops the attestation at once. If a published release
needs different bytes, it needs a new version.

**Raising `minAppVersion`** is a separate decision from bumping the version, and it changes what
`versions.json` means: Obsidian scans that file for the highest plugin version whose `minAppVersion`
is at most the user's app version, and offers that release. An entry pointing at a release that does
not exist is a 404 for the user, not a graceful fallback.

## AI / LLM Policy

This repository is perfectly open to code created using LLMs as long as it is well tested and the
potential contributor takes full responsibility for their code. However, communication in issues,
PRs, and commit messages should be between humans, with any LLM-generated text clearly attributed.
