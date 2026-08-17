# Architecture

This document is the map to the TypeScript modules that make up the plugin. It describes what each
folder holds, how the modules are layered, why the layering takes this shape, and the thing that is
hard to learn from the source alone: exactly what Fluidity assumes about parts of Obsidian that
Obsidian does not document.

Every module carries a header comment saying what it is and, usually, why it is separate from its
neighbors. Those headers are the primary navigation aid; this document explains the system they sit
in.

> **The plugin is being built out feature by feature, and this document describes the design it is
> being built to.** Where a module named below does not exist yet, its feature has not landed. The
> [roadmap](./roadmap.md) says what is where.

## A Précis

Fluidity does one thing: at the moment you pick a suggestion out of Obsidian's link completer, it
changes _which suggestion Obsidian is asked to insert_, and then gets out of the way.

That framing is the whole design. Everything hard about this plugin is on one side or the other of a
single seam:

- **Deciding** what the link should say by reading frontmatter, working out whether the cursor is at
  a sentence start, applying the casing rule, and later finding the section a chosen alias belongs
  to. All of this is pure, and all of it is unit-tested with no Obsidian in the room.
- **Reaching** the completer at all by finding an object Obsidian never exposes, wrapping one of its
  methods, and undoing that cleanly. This is confined to as few files as it can be, and it is where
  the risk lives.

The one thing Fluidity deliberately does **not** do is write the link. Obsidian's own composer turns
a suggestion into text, and it already knows about Wikilinks-versus-Markdown,
relative-versus-shortest paths, and every other setting a user might have moved. Handing it an
adjusted suggestion inherits all of that for free. Building the string ourselves would mean
reimplementing it, and (as the
[completer notes](#the-composer-collapses-case-and-generatemarkdownlink-does-not) below record) the
obvious public alternative silently produces the wrong text.

## The Shape of `src/`

The `src/` directory is separated by concern into folders. Each holds _every_ layer of its concern,
from the pure decision procedure to the Obsidian bridge, because those are the files that change
together.

| Folder      | What lives there                                                                  |
| ----------- | --------------------------------------------------------------------------------- |
| `prose/`    | reading English out of a line of Markdown: where a sentence starts                |
| `fluent/`   | the fluent-titles rule: reading the property, and deciding the display text       |
| `suggest/`  | the completer: locating it, patching it, and the item decision that patch applies |
| `settings/` | the settings interface and its defaults, and the tab that renders them            |

`main.ts` stays at the root and owns lifecycle: load the settings, install the patch, register the
settings tab. It makes no decisions of its own, which is what lets everything beneath it be tested
without it.

```
src/main.ts                 lifecycle only — load settings, install the patch, add the settings tab
src/settings/defs.ts        settings interface, defaults, normalization (pure)
src/settings/tab.ts         the settings tab
src/suggest/patch.ts        locate + patch the built-in suggester (the only internals-touching file)
src/suggest/item.ts         the suggestion-item union and its type guards
src/suggest/transform.ts    (item, context, settings) → item : the decision, thin and delegating
src/fluent/frontmatter.ts   read fluency from a frontmatter-shaped object (pure)
src/fluent/display.ts       (displayText, isFluent, atSentenceStart) → display text (pure)
src/prose/sentence.ts       is this offset a sentence start? (pure)
```

## Layers

```
                          ┌───────────────────────────────┐
main.ts                   │  plugin lifecycle: settings,  │
                          │  patch install, settings tab  │
                          └───────────────┬───────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  │                                               │
        ┌─────────┴──────────┐                          ┌─────────┴─────────┐
        │  suggest/patch.ts  │                          │  settings/tab.ts  │
        │                    │                          │                   │
        │  the only module   │                          │  renders defs.ts  │
        │  that touches      │                          │                   │
        │  Obsidian internals│                          │                   │
        └─────────┬──────────┘                          └─────────┬─────────┘
                  │                                               │
        ┌─────────┴──────────┐                                    │
        │ suggest/transform  │  the decision: which item should    │
        │ suggest/item       │  Obsidian be asked to insert?       │
        └─────────┬──────────┘                                    │
                  │                                               │
                  └───────────────────────┬───────────────────────┘
                                          │
                            ┌─────────────┴──────────────┐
                            │  pure modules              │  prose/sentence
                            │  (no imports at all, or    │  fluent/display
                            │   only other pure ones)    │  fluent/frontmatter
                            └────────────────────────────┘  settings/defs
```

Dependencies point downward. The one systematic exception is `import type … from "../main"`: lower
modules take the plugin object as a parameter and import its _type_ only. TypeScript erases
type-only imports entirely, so these create no runtime module edge and no cycle.

### A Pure Bottom Layer

Nearly all of Fluidity's actual logic imports nothing at all. `prose/sentence.ts` takes a string and
answers a question about it. `fluent/display.ts` takes a display text and two booleans and returns a
display text. `fluent/frontmatter.ts` takes a plain object shaped like frontmatter.
`settings/defs.ts` is a record and a normalizer.

The rule is not a convention that could quietly rot, but is **self-enforcing**. `test/unit/` runs
under **plain Node** with no access to Obsidian, so a unit test can only load its module if that
module's entire transitive import graph is Obsidian-free. Add an `import { Notice } from "obsidian"`
to `prose/sentence.ts` and its test stops loading, immediately and loudly.

That is why `settings/defs.ts` and `settings/tab.ts` are two files rather than one, and why the
decision in `suggest/transform.ts` is separate from the patch that calls it. It is also what makes
the interesting parts of this plugin cheap to test: the casing rule and the sentence detector are
where the behavior a user actually notices lives, and neither of them needs an editor.

`test/integration/` is the other half, and here it means two things: tests that run the real build
and check what it emits, and tests that pin our assumptions about Obsidian's internal shapes against
a fake suggester built to match them. Nothing outside a real vault can catch Obsidian changing. What
these do is make the assumptions explicit and greppable, so that when one turns out to be false
there is a written statement of the belief to go and read.

## Things Obsidian Does not Officially Support

**One feature reaches past the public API, and it is the feature.** Obsidian exposes no way to
influence what the link completer inserts — there is no hook, no event, and no setting. So Fluidity
patches it, which is a normal and reasonably common thing to do in this ecosystem, and every part of
how it does so is a deliberate response to something that will otherwise go wrong.

### The Suggester Registry

`app.workspace.editorSuggest` is a singleton built in the `Workspace` constructor, holding
`suggests: EditorSuggest[]`. Dispatch is **first non-null `onTrigger` wins, in array order**, which
is how one plugin's suggester displaces another's.

The built-in link suggester is `suggests[0]` at startup, but it **must be located by capability**:

```ts
const builtin = app.workspace.editorSuggest.suggests.find((s) => "suggestManager" in s);
```

Locating it by index is unsafe, because plugins `unshift` their own suggesters ahead of it. Locating
it by `constructor.name` is worse than unsafe: in a release build the minified name is literally
`"t"`, so a filter that tests it is a silent no-op that will never fire and never complain. At least
one published plugin has exactly that bug.

If the search comes back empty, Fluidity logs one line naming itself, records the failure for the
settings tab, and installs nothing. It never throws during `onload` — a plugin that breaks
Obsidian's startup is one nobody can uninstall from inside Obsidian.

### Patching the Instance's Own Prototype

The patch goes on `builtin.constructor.prototype`, via
[`monkey-around`](https://github.com/pjeby/monkey-around), and the uninstaller it returns is handed
to `plugin.register()` so that disabling the plugin puts everything back.

It must not go on `EditorSuggest.prototype`. That is shared with the tag suggester, the footnote
suggester, and every suggester every other plugin has registered — patching it would have Fluidity
inspecting suggestions from surfaces it knows nothing about.

`monkey-around` rather than a hand-rolled wrapper because it composes: several plugins wrap this
same method, and the uninstaller is written so that removing one out of order does not strand the
others.

### `context` Must be Read Before Delegating

The built-in's `selectSuggestion` calls `this.close()` as its **first statement**, and `close()`
clears `this.context`. Since the context is what carries the cursor position — and therefore the
words before the link, and therefore whether this is a sentence start — it has to be captured before
control is handed to the original:

```ts
const ctx = this.context; // before old(), never after
```

This is the kind of thing that works perfectly in every test written against a fake and fails on the
first real keystroke.

### Only Some Suggestion Types May be Touched

Suggestion items are a tagged union, and Fluidity **allow-lists** the two it understands — `alias`
and `file` — passing every other type straight through, by identity.

This is not tidiness. A `block` item **writes a block id into the target file** inside
`selectSuggestion`, so a plugin that intercepts one and returns something slightly different is a
plugin that corrupts notes. `Shift+Enter` calls `selectSuggestion({ type: "none" })` directly,
bypassing the popup entirely. Neither is ours to touch.

`evt` may be a `MouseEvent` and not only a `KeyboardEvent`, because a suggestion can be clicked.

The item itself is **shallow-cloned** before anything is changed. What Fluidity is handed belongs to
Obsidian's suggester and may well be reused.

### The Composer Collapses Case, and `generateMarkdownLink` Does Not

For `type: "alias"`, the internal composer sets `alias = display = item.alias` and appends
`"|" + alias` to the link text **with no case collapse**. So lowercasing `item.alias` yields exactly
`[[Interiority|interiority]]`, which is the entire fluent-titles feature.

The public-looking alternative does not work. `fileManager.generateMarkdownLink()` _does_ collapse
case: `generateMarkdownLink(file, src, "", "interiority")` returns `[[interiority]]`, not
`[[Interiority|interiority]]`. A version of this plugin built on the documented API would therefore
silently write the wrong link — which is worth stating plainly, because "use the public API" is
otherwise the obviously correct advice.

Going through the built-in composer also inherits correct handling of both **Use [[Wikilinks]]** and
**New link format** for free, and keeps the insertion a single editor transaction, which is what
makes undo one step.

### A Fluent Note With no Alias Becomes an Alias Item

When the chosen suggestion is a `file` item — the note's own title, with no alias involved — there
is no display text to change, because the composer derives it from the path. Fluidity therefore
**flips the item to `type: "alias"`** carrying the fluent form. This is a production-proven move;
the Front Matter Title plugin does exactly the same flip for the same reason.

If the transformed text is identical to what would have been inserted anyway, the item is passed
through **unchanged**, so an already-lowercase title never produces `[[interiority|interiority]]`.

The transform fires only on selection, never while building the suggestion list, so the popup keeps
showing properly capitalised titles regardless of what will be inserted.

### Reading the Vault's Own Data

Fluency and aliases are read from the metadata cache rather than by parsing files, so there is no
I/O on the path between a keypress and an insertion. Two details of Obsidian's own behavior have to
be matched exactly, because a disagreement here is a disagreement with the popup the user is looking
at:

- Obsidian recognises **only `aliases`** (plural, case-insensitive) as the alias key. It trims
  values and drops empty ones, and accepts either a scalar or a list. `fluent/frontmatter.ts`
  normalizes identically.
- Obsidian's heading sanitizer — which decides what a `#Section` in a link may contain — is **not
  exported**, so composing one means replicating it: `[:#|^\r\n]`, `%%`, `[[` and `]]` become
  spaces, runs of whitespace collapse, and the result is trimmed. This matters for section-aware
  links and is recorded here so it is not rediscovered.

### Sentence Position Comes From the Context, Not From Guesswork

`ctx.start` is the position just after the `[[`, so the text preceding the link is exactly:

```ts
editor.getLine(ctx.start.line).slice(0, ctx.start.ch - 2);
```

This is a real advantage of patching the completer over the alternatives, all of which have to infer
what was just typed from a diff.

One simplification is taken deliberately: a link at the very start of a line is treated as a
sentence start without inspecting the line above. In Obsidian a paragraph is normally a single line,
so this is right nearly always, and its failure mode — a capital that should have been lowered — is
the conservative one.

### If This Ever Stops Working

There is a **fully public fallback**, and it is written down rather than built. The built-in's
insertion is a single CodeMirror 6 transaction tagged `userEvent: "input.autocomplete"`, and a
transaction filter registered with `registerEditorExtension(EditorState.transactionFilter.of(…))`
can see and rewrite it.

It is strictly worse: it sees only the inserted string, so the alias has to be re-resolved against
the metadata cache, and the same tag is used by the mobile toolbar's `[[` button. But it is
production-grade, it depends on nothing undocumented, and knowing it exists is what makes the
current approach a considered choice rather than the only one anybody thought of. The
[roadmap](./roadmap.md) tracks it.

## The Build

`esbuild` bundles `src/main.ts` to a single CommonJS `main.js`. The plugin is `main.js`,
`manifest.json`, and `styles.css`, and nothing else.

`obsidian`, `electron`, every `@codemirror/*` and `@lezer/*` package, and the Node builtins are
esbuild **externals**: Obsidian supplies each of them at runtime. For CodeMirror this is not merely
about size — its extension system keys off **module identity**, so a second bundled copy of
`@codemirror/state` does not conflict loudly, it just quietly fails to interoperate with the
editor's own. `package.json` forces those versions flat with `overrides`, so the plugin type-checks
against what will actually be there rather than against a nested copy npm was free to install.

`test/integration/build/bundle.test.ts` states that as a property of the output rather than as a
copy of the externals list: it runs the real config and asserts that every module the bundle
requires is one Obsidian provides. A stray import is all it takes, and nothing about that failure is
visible at build time.

`styles.css` is deliberately near-empty. Fluidity has no views and no widgets; every pixel it
touches is Obsidian's own. The file exists because it is one of the three files Obsidian installs
alongside a plugin, and shipping it keeps `make install` and the release workflow uniform.

The one runtime dependency, `monkey-around`, is bundled. It is roughly seventy lines with no
dependencies of its own.
