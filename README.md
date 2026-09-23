# Fluidity

Fluidity is a plugin for [Obsidian](https://obsidian.md) that finishes the links the link completer
starts while giving you control over exactly how itt's done!

Obsidian's autocomplete is usually very good at working out _which note you meant_, and then hands
you a link that is _nearly_ right. The display text might be capitalized when the sentence wanted it
lowercase, or the linked pointing at the top of a note when you meant it to point at a section
half-way down. Both leave you editing a link that could have just been right the first time.

Fluidity changes what gets inserted, at the moment it gets inserted, so there is nothing to go back
and fix. It lets you tailor linking and aliases, as well as casing for sentence-form insertion, on a
per-note basis, and makes the completer truly work for you!

```text
A note on the [[Interiority|interiority]] of the thing.
                            ^ Fluidity added this, because the sentence did not start here
```

> **Fluidity is not released yet.** It is in active development, and the community-plugin listing
> below does not exist. Until it does, [BRAT](https://github.com/TfTHacker/obsidian42-brat) or a
> manual install from a release is the way in.

## Key Features

TBC

## Installation

Fluidity is not yet listed in the Community Plugins directory. Until it is:

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/iamrecursion/fluidity/releases/latest).
2. Create `<vault>/.obsidian/plugins/fluidity/` and put all three files in it.
3. Reload Obsidian, then enable **Fluidity** under **Settings → Community plugins**.

[BRAT](https://github.com/TfTHacker/obsidian42-brat) will do the same thing and keep it updated.

> **Fluidity requires Obsidian 1.13.0 or newer.**

## Basic Usage

TBC

## A Note on How This Works

Obsidian's link completer is not exposed, so Fluidity achieves what it does by being a bit naughty
and **patching it**. It finds the built-in suggester at runtime, wraps the method that turns your
choice into text, and then adjusts the choice before handing it to Obsidian's code to insert. The
insertion itself is never reimplemented, which is why the result respects your link-format settings
and why undoing a link costs no more than undoing any other completion.

The cost of doing it this way is simply that an Obsidian update can trivially break the plugin.
Fluidity is designed to fail gracefully when this happens, not installing the patch and reporting
the failure in its settings tab. The [architecture doc](./docs/architecture.md) lays out exactly
what assumptions this plugin makes and what happens when they stop holding.

## Documentation

If you are interested in contributing to Fluidity, or simply building it yourself, please read the
[contributing guide](docs/CONTRIBUTING.md).

- The [feature reference](docs/features.md) explains every behavior and the settings that govern it,
  including exactly what counts as a sentence start.
- The [architecture doc](docs/architecture.md) lays out the modules, the pure layer, and everything
  the plugin assumes about Obsidian's internals.
- The [roadmap](docs/roadmap.md) provides an overview of what is planned, what is not, and the known
  limitations.

## Credits

Fluidity leans on [`monkey-around`](https://github.com/pjeby/monkey-around) by PJ Eby, the Obsidian
ecosystem's standard way to wrap a method and be able to unwrap it again. It is ISC-licensed.

This plugin is [MIT-licensed](./LICENSE).
