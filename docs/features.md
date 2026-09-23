# Feature Reference

This document describes everything Fluidity does, precisely enough to predict it, along with the
settings that govern each behavior. The [architecture doc](./architecture.md) covers _how_ it is
done; this one is only about _what happens_.

> **Fluidity is under active development.** Behavior described here without a caveat is what the
> plugin is built to do; anything not yet implemented says so. The [roadmap](./roadmap.md) tracks
> the difference.

## The Core Rule

Fluidity acts **at the moment you pick a suggestion from the link completer**, and only then. That
single sentence answers most questions about scope:

- It does not change links already written in your notes. Fixing those is a different problem, with
  a different failure mode, and it is not what this plugin is for.
- It does not change how a link _renders_. What Fluidity produces is stored in the note, and reads
  the same in any other Markdown editor.
- It does not run on typing, on paste, or on save.
- It never rewrites text after Obsidian has inserted it. The link Obsidian writes is already the
  right one, so **undoing it costs exactly what undoing any completion costs**.

## Fluent Note Titles

### Marking a Note Fluent

Add the property to the note's frontmatter:

```yaml
---
fluent: true
---
```

The value must be a real boolean. `fluent: "true"` is a string and does **not** mark the note
fluent, which is deliberate — Obsidian's property editor writes real booleans for a checkbox
property, and silently accepting a string would mean a typo changing how your links are written.

`fluent: false`, and a note with no such property at all, are treated identically: Fluidity does
nothing whatsoever to them.

The property name is configurable; see [Settings](#settings).

### What Changes

When you pick a suggestion for a fluent note, and the link is **not** at a sentence start, Fluidity
lowercases the display text:

```text
… which is really about the [[Interiority|interiority]] of the practice.
```

At a sentence start, the capital stays exactly as it is, and Fluidity inserts precisely what
Obsidian would have:

```text
[[Interiority]] is the nature of the thing.
```

The rule is applied to the **whole** display text, every capital in it:

```text
… an introduction to [[Object Oriented Programming|object oriented programming]] for beginners.
```

Lowercasing is locale-aware, so non-ASCII scripts behave as the reader's locale expects rather than
as ASCII would have it.

### Aliases

The same rule applies to an **alias** of a fluent note, not only to its title. `fluent` says the
note names a common noun, and its aliases are alternative ways of saying that same common noun:

```yaml
---
fluent: true
aliases:
  - Interior Life
---
```

```text
… a question about the [[Interiority|interior life]] of the practice.
```

Aliases are read the way Obsidian itself reads them: only the `aliases` key (plural,
case-insensitive) is recognised, values are trimmed, empty ones are dropped, and both a single value
and a list are accepted. This matters because a disagreement here would be a disagreement with the
popup you are looking at.

### Nothing Redundant is Inserted

If lowercasing the display text produces exactly what would have been inserted anyway — because the
title is already lowercase, or begins with a digit or a symbol — the suggestion is passed through
untouched. You will never see `[[interiority|interiority]]`.

### The Popup is Unchanged

The transform runs when you _select_ a suggestion, not while the list is being built. The completer
popup therefore keeps showing your notes with their real, properly capitalised titles, which is what
makes them readable in a list.

### Other Completions are Untouched

**Embeds are left alone.** `![[Interiority]]` renders the note rather than reading as prose, and
what follows the pipe in one is a display argument rather than text. An embed is inserted exactly as
Obsidian would insert it, whether or not the note is fluent.

Typing `#` for a heading, `^` for a block reference, or `|` for an alias inside a link behaves
exactly as it does without the plugin. So does `Shift+Enter`, and so does every suggestion type
Fluidity does not explicitly handle. In particular, block-reference completions are never
intercepted — selecting one writes a block id into the _target_ note, and that is not something a
plugin should be adjusting on its way past.

## What Counts as a Sentence Start

This is the part worth reading carefully, because it is where "it did the wrong thing" usually comes
from.

Fluidity looks at the text on the line **before** the `[[` you are completing, and asks whether a
sentence begins at that point. Before testing anything, it ignores:

- **Trailing emphasis markers** — `*`, `**`, `***`, `_`, `__`, `___`, `==`, `~~`. Emphasis opened
  immediately before a link does not move the sentence.
- **Opening quotes and brackets** — `"`, `'`, the curly quotes, `(`, `[`, and their kin.

So `**[[Interiority]]** is …` and `("[[Interiority]] …` both count as sentence starts.

What remains counts as a sentence start when it is:

| The preceding text is…                   | Example                          |
| ---------------------------------------- | -------------------------------- |
| empty — the link starts the line         | `[[Interiority]] is …`           |
| a heading marker                         | `## [[Interiority]]`             |
| a blockquote marker                      | `> [[Interiority]] is …`         |
| a callout header                         | `> [!note] [[Interiority]] is …` |
| a list bullet — `-`, `*`, or `+`         | `- [[Interiority]] is …`         |
| an ordered-list marker                   | `1. [[Interiority]] is …`        |
| a checkbox                               | `- [ ] [[Interiority]] is …`     |
| terminated by `.`, `!`, `?`, `:`, or `;` | `Note: [[Interiority]] is …`     |
| terminated by `。`, `！`, or `？`        | `終わり。[[Interiority]] …`      |

The terminator cases need whitespace after the punctuation, except for the CJK terminators, which do
not take a following space in ordinary use.

`:` and `;` are included because a colon is how most people write a lead-in, and what follows one
reads as the start of a new clause. This is a judgement call rather than a grammatical rule, and it
is the one most likely to be made configurable later.

A `.` is **not** a sentence boundary when it is:

- inside a decimal number — `3.14 is the [[Interiority]] …` is mid-sentence,
- part of a common abbreviation — `e.g.`, `i.e.`, `etc.`, `Dr.`, `Mr.`, `vs.` and friends,
- inside a URL,
- inside inline code.

### One Deliberate Simplification

A link at the very **start of a line** is treated as a sentence start without looking at the line
above it. In Obsidian a paragraph is normally a single line, so this is correct nearly always, and
when it is wrong the result is a capital that should have been lowered — the conservative failure,
and one you can see and fix.

## Where the Rule is Blunt

The casing rule lowercases the entire display text. This is right for the titles it was built for:

```text
[[Object Oriented Programming|object oriented programming]]     ✓
[[Interiority|interiority]]                                     ✓
```

And it is wrong when a title contains a genuine proper noun:

```text
[[History of France|history of france]]                         ✗ should be "history of France"
```

This is **known and accepted** for the first version of the plugin, not an oversight. The purpose of
v1 is to establish that patching the completer is reliable enough to build on, and a casing rule
with no configuration surface keeps that question clean. Every casing decision goes through one
small pure function, so replacing the rule later changes nothing else.

The plan is not a dictionary of proper nouns — that would be a large amount of machinery to be
subtly wrong in a new way. It is a per-note override, expressed in a small language, designed
together with the alias conventions the second feature needs. The [roadmap](./roadmap.md) has the
reasoning.

Until then, the workaround is to not mark such a note `fluent`, and to write its links as you always
have.

## Section-Aware Alias Links

**Not implemented yet.** The intent is that picking an alias which names a sub-topic of a note
inserts a link to the _heading_ that sub-topic lives under, rather than to the top of the note:

```text
Before   see [[Big Note|the thing about tides]]
After    see [[Big Note#Tides|the thing about tides]]
```

Two things about this are already settled. Obsidian's own composer supports it directly — a
suggestion whose path carries a subpath produces the sectioned link without any string-building on
our side — and the data needed to find the heading is already in the metadata cache, so no file has
to be read. What it waits on is a written convention for how alias lists are structured, which is
what makes "the heading this alias belongs to" a definite thing rather than a guess.

See the [roadmap](./roadmap.md).

## Settings

**Not implemented yet.** There is no settings tab. The property is fixed as `fluent` in
`src/main.ts`, there is no master toggle, and changing either takes an edit and a rebuild. What this
section describes is the intended shape, and the [roadmap](./roadmap.md) tracks it.

**Settings → Fluidity**.

| Setting             | Default  | What it does                                                   |
| ------------------- | -------- | -------------------------------------------------------------- |
| **Fluent titles**   | on       | The master toggle. Off, nothing about a completion is changed. |
| **Fluent property** | `fluent` | Which frontmatter property marks a note fluent.                |

Renaming the property takes effect immediately and does not migrate anything — notes still carrying
the old property simply stop being treated as fluent. It exists for vaults where `fluent` already
means something else.

Above these sits a **read-only status line** reporting whether the completer patch installed. It is
the first thing to check when nothing seems to be happening: Fluidity works by patching a part of
Obsidian that is not public API, and an Obsidian update is capable of moving what it attaches to. If
that happens the plugin declines to install the patch, says so here and once in the developer
console, and leaves the completer behaving exactly as it does without the plugin.

Until that line exists, the developer console is the only place the failure is reported, which is
why checking the plugin by hand starts by opening it.
