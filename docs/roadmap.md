# Roadmap

This document explains where this project aims to go, and what it is deliberately leaving out.
Nothing here is committed to or has a date; it is a statement of intent.

## Near Term

- **Section-Aware Alias Links.** The second half of the plugin, described below. It is the reason
  Fluidity exists as much as fluent titles are.
- **Real-Vault Coverage of the Settings Tab.** The settings path is exercised by type-checking and
  the pure defaults test, not by anything that renders it. Every settings change needs a manual pass
  until that is no longer true.
- **Mobile.** The manifest says the plugin is not desktop-only, and nothing in the design should
  care — but the completer is reached differently on the mobile toolbar's `[[` button, and that has
  not been exercised. Until it has, "should work" is all that can honestly be claimed.

## Section-Aware Alias Links

Notes accumulate sub-topics under headings, and it is common to alias each of them in the note's
frontmatter so the link completer can find them. Picking such an alias today gets the right display
text but a link to the top of the note, and `#Section` has to be added by hand every time:

```text
Today      see [[Big Note|the thing about tides]]
Intended   see [[Big Note#Tides|the thing about tides]]
```

Two findings make this much smaller than it looks. Obsidian's own composer already handles it: a
suggestion whose path carries a subpath produces the sectioned link, with no string-building and no
link-format handling to reimplement — the same one-line-of-intent change as fluent titles, through
the same hook. And the data is already in the metadata cache, which holds both the note's aliases
and its headings with their levels and positions, so the walk from an alias to its heading needs no
file reads.

What it waits on is a **written convention for how alias lists are structured**. "The heading this
alias belongs to" is only a definite thing if the ordering of the alias list means something;
without that it is a guess, and a guess that silently links to the wrong section is worse than no
feature. That convention is the open item, not the code.

A pleasant side effect falls out for free: the completer popup renders a suggestion's path on its
secondary line, so a section-bearing path shows the section in the list before you pick it.

## The Override Language

The casing rule is blunt on purpose — it lowercases the whole display text, so `History of France`
becomes `history of france`. The [feature reference](./features.md#where-the-rule-is-blunt) says so
plainly, and the first version accepts it: the thing actually being tested by v1 is whether patching
the completer holds up in daily use, and a casing rule with no configuration surface keeps that
question clean.

The fix is **not a dictionary of proper nouns**. That is a large amount of machinery to be subtly
wrong in a new way, it would need maintaining per language, and it would still be wrong about your
notes specifically — which are the only ones that matter here.

The intended answer is a small per-note language mapping an input to an output form, so a note can
state what its own title should look like in prose rather than having a rule inferred for it. It is
deliberately being designed **together with the alias conventions** the section feature needs, for
one reason: those conventions already encode the kind of structure such rules would have to read,
and designing the two separately would very likely produce two overlapping mini-languages where one
would do.

Every casing decision already goes through a single pure function, so this replaces a body rather
than a design.

## Known Limitations

- **The Casing Rule is Blunt.** Described above. A title containing a genuine proper noun will be
  over-lowered; not marking such a note `fluent` is the workaround.
- **A Sentence Start is Judged Within One Line.** A link at the very start of a line is treated as
  starting a sentence without looking at the line above. In Obsidian a paragraph is normally one
  line, so this is right nearly always, and the failure is the conservative one — a capital that
  should have been lowered, which you can see.
- **`:` and `;` Start Sentences.** A judgement call rather than a grammatical rule, made because a
  colon is how most people write a lead-in. It is the behavior most likely to become a setting.
- **Nothing Automated Can Press Enter.** The plugin's whole job happens on selecting a completion,
  and the test suite cannot do that. The pure layer is thoroughly tested and the internal contract
  is pinned, but the last inch is a manual checklist in the
  [contributing guide](./CONTRIBUTING.md#what-to-check-by-hand).
- **The Completer is Not Public API.** An Obsidian update can move what the patch attaches to. The
  plugin fails quietly when that happens — it logs one line, disables the feature, and reports it in
  the settings tab — but "fails quietly" is still a failure, and there is no way to be warned before
  it happens rather than after.

## Under Consideration

- **A Public-API Fallback.** The built-in's insertion is a single CodeMirror 6 transaction tagged
  `userEvent: "input.autocomplete"`, and a transaction filter can see and rewrite it using nothing
  undocumented. It is strictly worse — it sees only the inserted string, so the alias has to be
  re-resolved against the metadata cache, and the same tag is used by the mobile toolbar's `[[`
  button — but it is production-grade, and it is what the plugin would move to if the internals ever
  went away. Written down rather than built, because two code paths doing the same job is a cost
  paid every day against a risk that may never arrive.
- **Fixing Links Already Written.** A command that walks a note, or a vault, and applies the same
  rules to links that already exist. Kept out of v1 by decision: it is a bulk edit of a user's notes
  rather than a change to something being typed, which is a different level of trust and needs a
  different level of care. Whether it belongs here at all is genuinely open.

## Not Planned

- **Live Rewriting as You Type.** Fluidity acts when a completion is selected, and that is the whole
  of its contract with your notes. Watching the editor and adjusting links as the surrounding
  sentence changes would mean the plugin editing text you did not just ask it to write.
- **Changing How Links Render.** What Fluidity produces is stored in the note and reads the same in
  any other Markdown editor. Making a link _display_ differently from what is written is a different
  plugin, and a lossier one.
- **A Proper-Noun Dictionary.** Covered above. The override language does this job better, for the
  only vault that matters.
- **More Runtime Dependencies.** There is one, `monkey-around`, at around seventy lines with no
  dependencies of its own, and it is there because unwrapping a patch correctly is genuinely fiddly.
  Everything else is built against the platform.
