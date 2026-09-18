# Plan: Epic log-cli-w0b — Feature Enhancements

Status: pending approval
Epic bead: log-cli-w0b (P3, lowest priority, speculative)
Spec: .internal/specs/2026-09-06-remaining-backlog-design.md (Epic 3)
Consensus: 2 rounds (Architect, Critic). Nearly every item's initial
premise was wrong or incomplete when checked against real parser/state/
keybinding code — this is the only epic in the backlog not grounded in a
concrete gap, and it shows.

## Requirements Summary

Nine originally-scoped feature ideas, none demanded by a concrete bug or
test failure — kept because each is plausible, but deprioritized relative
to the CI-health, tech-debt, test-coverage, and packaging epics.

**Item 1 (query/filter language parity) was spun off into its own epic,
`log-cli-klh`**, after architect review found it's a real redesign
question, not a small addition: `query.ts` and `filter.ts` share keyword
names with *different* semantics (`like` = substring in query vs
anchored-glob in filter; regex is `=~` in query vs `~~=` in filter) and
resolve values against fundamentally different data shapes (a flat string
map vs. a typed JSON scope). `log-cli-klh` needs its own future
Architect/Critic consensus session before implementation. This plan's item
1 is now just the interim, low-risk documentation deliverable.

## RALPLAN-DR Summary

**Principles:** (1) YAGNI — no speculative sub-features beyond what's
listed; (2) match existing code patterns exactly, verified against the
actual files, not assumed from names; (3) every acceptance criterion is a
concrete runnable check; (4) don't duplicate functionality that already
exists; (5) if an item needs more than small-to-medium change, split it out
rather than force-fitting it (applied to item 1).

**Decision Drivers:** (1) narrowest-scoped items first, even within a P3
epic; (2) avoid new config/state patterns when an existing one fits; (3)
verify before estimating — several items turned out to already
exist/be trivial, or rest on wrong assumptions about the code.

## Items

### 1. [S, interim doc only] Document query/filter semantic divergence

`like` is substring in `query.ts:210` vs. anchored-glob in
`filter.ts:347-352`; regex is `=~` in query vs. `~~=` in filter. Update
`QueryBar.tsx`'s and `FilterBar.tsx`'s inline hint text so they don't imply
identical/interchangeable syntax between the two bars. Full parity is out
of scope — see `log-cli-klh`.

**Acceptance:** README's query/filter sections explicitly call out the
divergence; both bar components' hint text updated to not suggest
interchangeable syntax.

### 2. [S/M] `--level` flag using existing state (both normal and merged)

`AppStateStore.ts` already has first-class `levelFilter: NormalizedLevel[]`
state, seeded in `getDefaultAppState` (line 77) alongside `defaultFilter`/
`defaultQuery` — **and a separate `mergedLevelFilter: []` (line 89)**, which
`LogScreen.tsx:181` reads specifically in `--merge` mode. Seeding only
`levelFilter` would make `--level` silently do nothing under `--merge` — a
real gap the first draft of this item missed. `matchesLevelFilter` (used to
apply the filter) is currently a non-exported function inside
`LogScreen.tsx:38` — it must be extracted to `src/lib/` before it can be
reused in the headless summary path. Separately (second sub-change):
`buildFilteredSummary` (`summary.ts:43-55`) has no level concept at all —
add a `levels` param using the extracted `matchesLevelFilter`.

**Acceptance:** `--level error` / `--level warn,error` seeds **both**
`levelFilter` and `mergedLevelFilter` via the existing startup-option
pattern, verified in both normal and `--merge` interactive startup.
`matchesLevelFilter` is extracted to `src/lib/`. `buildFilteredSummary`
gains a `levels` param and `--level` works in `--summary-json`/
`--summary-text` modes too (verified separately from the interactive path).

### 3. [S] `--version`/`-V` flag with a pre-existing precedent to follow

Confirmed absent: `argv.ts:61-63` falls through to treating `--version` as
a file, erroring "File not found: --version". Fix requires three edits:
add to `OPTION_SPECS` (`argv.ts:6-21`), add a commander `.version()` call,
and add an early-exit **before** `main.tsx:152`'s non-TTY-routes-to-
runSummary gate — `main.tsx:142` already has an identical early-exit
pattern for `--help`; follow that exact precedent rather than inventing a
new one. Without it, a piped `log --version | cat` would hang waiting on
stdin instead of exiting.

**Acceptance:** `log --version`/`-V` both print the `package.json` version
and exit 0 with no other args, verified via both a TTY-attached invocation
and a piped/non-TTY invocation (confirming no hang).

### 4. [S, downgraded from M] Document existing directory-source behavior

`sources.ts:63-65` already errors clearly ("Path is a directory, not a
file: `<path>`") when given a directory — not a gap, just undocumented.
Glob-expansion of a directory into multiple files is explicitly descoped
from this epic (real feature growth, not a documentation fix) — noted only
as a possible future idea, not tracked as its own bead here.

**Acceptance:** README documents the existing directory-rejection behavior
with the exact error message shape.

### 5. [S/M] Named/saved filters, following an exact existing config pattern

Follows `config.ts`'s `levelMap: z.record(...)` pattern (line 36) exactly
for a new `savedFilters` config key.

**Acceptance:** `savedFilters: { "errors-only": "level = \"error\"" }` in
config lets `--filter @errors-only` (or equivalent syntax) resolve to the
saved expression, also usable via the interactive filter bar. An
unresolvable `@name` reference fails loudly with a clear error **at the
point of use** — distinct from `readConfigFile`'s existing file-level error
swallowing (`config.ts:47-55`), which only covers malformed config files,
not a valid config referencing a missing saved-filter name.

### 6. [M] List-level search, no new keybinding needed

Premise correction: `/` is **not** reserved in list mode —
`LogScreen.tsx:380` only guards `focusMode === "detail"`, and `n`/`N`
(lines 493/513) are likewise detail-scoped — so `/`/`n`/`N` are free when
list-focused, no collision. First extract the currently-duplicated
match-navigation (`next`/`prev`) logic out of `src/lib/textSearch.ts` and
`src/lib/detailActions.ts:28-42` (confirmed genuinely identical) into one
shared primitive, avoiding a third duplicate for list search.

**Acceptance:** pressing `/` while list-focused searches list entries'
main-line rendered text via the shared next/prev primitive; `n`/`N`
navigate matches, consistent with detail-mode's existing semantics; a
regression check confirms detail-mode search behavior is unchanged after
the extraction.

### 7. [M] Export/pipe filtered+queried results to a file

Nothing like this exists today. `clipboardy` usage in `LogScreen.tsx` is
precedent for a side-effecting interactive action.

**Acceptance:** a new keybinding/command exports the currently visible/
filtered/ordered entries to a file (json-lines or raw text), usable without
leaving the interactive session.

### 8. [M, corrected mechanism] Real, visible-by-default level coloring

Two premise corrections from the first draft: (a) SGR is **not** the wrong
primitive for Ink's styled `Text` — it is this component's *established*
rendering path: `LogList.tsx:55` runs `parseAnsiText(lineText)` and
`LogList.tsx:72-79` maps each parsed segment to `<Text color={segment.color}
bold={segment.bold}>`. `level_style` (`mainLineTemplate.ts:49-67`) already
emits the right SGR shape — it's inert today only because it's gated behind
a custom `config.mainLineTemplate` (which `DEFAULT_CONFIG` doesn't set) and
only touches `message`, never the `level` column. (b) The selected row
(`LogList.tsx:63-70`) renders as a single inverse-video `Text` that
explicitly **drops all segment colors** (`segments.map(s => s.text).join
("")`) — this is existing, intentional behavior for the cursor row, not a
bug to fix as part of this item.

Fix: wrap the level column's rendered text with an SGR sequence from a
default level→color mapping (reusing `level_style`'s actual SGR-generation
logic), applied unconditionally (not gated behind a custom
`mainLineTemplate`) so it flows through the *existing* `parseAnsiText` →
segment-color rendering path — not a new mechanism. A `levelColors` config
key overrides the default mapping.

**Acceptance:** by default (no config), the level field on non-selected
rows is visibly colored per a documented default mapping (error=red,
warn=yellow, info=default, debug/trace=dim), verified via the computed
segment/SGR output. The selected row's existing inverse-video rendering is
explicitly unchanged — documented as intentional, not a gap. `levelColors:
{ error: "magenta" }` overrides just that level's color. Full render-level
verification may lean on `log-cli-6nh.4`'s future render harness once
available; until then, test via the computed color value directly.

### 9. [M] Bookmarks/marks with a non-colliding key, reusing an existing pattern

`m` is already globally bound to the detail tree/raw toggle
(`LogScreen.tsx:407-410`), confirmed to fire before any detail-mode branch
— use a different key (e.g. backtick/apostrophe + letter, vim-style,
confirmed unbound). The existing `pendingYankRef` pending-prefix-key
handling (`LogScreen.tsx:419,534`) is a pattern to **copy**, not literally
reuse — it lives only inside the `focusMode === "detail"` branch, while
marks are list-scoped.

**Acceptance:** mark-set key + letter marks the current entry; mark-jump
key + letter jumps to it; state in-memory per session only (not
persisted); verified against the full keybinding list in README to confirm
no collision.

## Dependencies / Ordering

- Item 2's `matchesLevelFilter` extraction has no cross-epic dependency.
- Item 6's shared next/prev extraction has no cross-epic dependency.
- Item 8 has a soft (non-blocking) dependency on `log-cli-6nh.4`'s future
  render harness for full verification; testable now via computed values.
- No item in this epic blocks or is blocked by any other epic.
- `log-cli-klh` (spun off from item 1) needs its own future planning
  session before implementation.

## Risks and Mitigations

- **Risk:** item 2 seeding only `levelFilter` (not `mergedLevelFilter`)
  would make `--level` silently no-op under `--merge`. **Mitigation:**
  acceptance explicitly requires both states, tested under both modes.
- **Risk:** item 8's SGR approach could be applied inconsistently with the
  selected-row's existing color-dropping behavior. **Mitigation:**
  explicitly documented as intentional, not solved by this item.
- **Risk:** item 6's extraction could regress existing detail-mode search.
  **Mitigation:** explicit regression check in acceptance criteria.
- **Risk:** item 5's saved-filter resolution failure could be silently
  swallowed by the same error-handling path as malformed config files.
  **Mitigation:** explicit acceptance criterion distinguishing the two
  failure modes.

## Verification Steps

- `bun test` after each item — 0 new failures.
- Item 3: manual verification of both TTY and piped invocation.
- Item 2: manual verification under both normal and `--merge` startup.
- Item 6: regression test confirming detail-mode search unaffected.
- Item 9: keybinding collision check against the full README keybinding
  list.

## ADR

**Decision:** Ship 8 narrowly-scoped, verified feature items; spin off the
one genuinely large item (query/filter parity) into its own future epic
rather than force-fitting a redesign into a P3 "small enhancements" epic.

**Drivers:** YAGNI and honest sizing — several items' original premises
(query.ts's operator gap being a quick fix, `levelColors` having any visual
effect, `/` being unavailable in list mode, `m` being free for bookmarks)
were factually wrong when checked against the real code, and shipping
against a wrong premise produces tests/features that "pass" while being
broken or inert.

**Alternatives considered:** keeping query/filter parity in this epic
(rejected — architect found it requires either deleting ~200 lines to
converge on one parser, or accepting a permanently-diverging pair with
different value-resolution layers; neither is a small P3 addition);
leaving `levelColors` as originally scoped (rejected — it would have been a
no-op for every default user, since level coloring didn't previously exist
at all outside a custom template).

**Why chosen:** every remaining item's acceptance criterion is now checked
against verified current behavior, not assumed behavior — the two rounds
of review that preceded this doc caught wrong premises in 6 of the original
9 items.

**Consequences:** item 8 grew from a config-only no-op into a real
default-behavior change (level coloring becomes visible for everyone, not
just users who opt into a custom template) — a slightly larger but honest
scope. `log-cli-klh` exists as a new epic needing its own future planning
cycle.

**Follow-ups:** `log-cli-klh` (query/filter convergence) needs its own
Architect/Critic consensus session; the directory-glob-expansion idea
(item 4) is noted but not tracked as a bead.

## Changelog (consensus rounds)

- **v1 → v2** (Architect round 1): item 1 spun off entirely into
  `log-cli-klh` (found to be a redesign, not a small addition — shared
  keyword names with different semantics between the two parsers). Item 2's
  premise ("synthesize a filter expression for --level") was wrong — a
  first-class `levelFilter` state already exists; rewritten to seed it
  directly, plus a separate `buildFilteredSummary` sub-change for headless
  modes. Item 3 needed 3 edits, not 1 (including a pre-runSummary early
  exit to avoid hanging on piped stdin). Item 4 downgraded from [M] to [S]
  — directory rejection already works, just undocumented. Item 5 gained an
  explicit "fail loudly on unresolvable @name" criterion. Item 6's premise
  (`/` reserved, needing a new Ctrl+/ binding) was wrong — `/` is free in
  list mode; also found `textSearch.ts`/`detailActions.ts` already
  duplicate identical next/prev logic, extract first rather than
  triplicate. Item 8's premise (a `levelColors` config key alone would do
  something) was wrong — level isn't colored by default at all; reframed
  into a real default-behavior feature. Item 9's `m` key was found to
  collide with the existing detail tree/raw toggle; switched to an unbound
  key.
- **v2 → v3 (final)** (Critic round 1): item 8's *mechanism* correction
  from round 1 was itself wrong — SGR is the established rendering
  primitive here (`parseAnsiText` → segment `color` props), not something
  to avoid; corrected to wrap the level column in the same SGR path
  `level_style` already uses, and explicitly documented the selected row's
  existing color-dropping behavior as intentional rather than a bug to also
  fix. Item 2 missed `mergedLevelFilter` entirely — seeding only
  `levelFilter` would make `--level` silently no-op under `--merge`; fixed
  to require both. Also found `matchesLevelFilter` is non-exported and must
  be extracted before reuse in the summary path. Capped at round 2 — fixes
  applied directly rather than triggering a 3rd full review round (this
  epic is P3/lowest priority; matched review depth to that).
