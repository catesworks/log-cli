# Plan: Epic log-cli-6nh — Test Coverage Expansion

Status: pending approval
Epic bead: log-cli-6nh
Spec: .internal/specs/2026-09-06-remaining-backlog-design.md (Epic 2)
Consensus: 2 rounds (Architect, Critic). Both rounds found the plan resting
on false premises about the repo's actual test infrastructure/dead code —
verified independently before finalizing.

## Requirements Summary

Test coverage gaps found by cross-referencing `src/` against `tests/*.test.ts(x)`
by name correspondence. Two full rounds of adversarial review found the
naive filename-gap method conflated "untested logic," "logic tested one
layer down under a different filename," "no logic at all," and "dead code"
— this plan reflects the corrected, verified scope.

## RALPLAN-DR Summary

**Principles:** (1) test observable contracts, not implementation details;
(2) never introduce a new testing approach/dependency without an existing
regression it justifies; (3) don't test dead code — route it to the
ADR-0001 audit (log-cli-nm2.9) for a delete/wire decision instead; (4) every
acceptance criterion names a concrete assertion, not "add tests"; (5)
sequence tests that depend on a sibling epic's in-flight behavior changes to
land after those changes.

**Decision Drivers:** (1) risk-weighted priority — source adapters
(network/process/fs boundaries) are the highest-value target; (2) avoid
duplicating coverage that already exists one layer down (`listWindow.test.ts`,
`jsonTree.test.ts`, `queryAutocomplete.test.ts`); (3) don't smuggle a new
rendering-harness dependency in as "following an existing pattern" — verify
the pattern exists first.

**Verified repo facts (both rounds checked these against the real files):**
- `tests/mergedList.test.tsx` and `tests/stateStore.test.ts` test pure
  functions only — neither establishes a component-rendering or
  hook-testing harness, despite file extensions suggesting otherwise.
  `package.json` has no `ink-testing-library`/`@testing-library/react`/
  `react-test-renderer`.
- `FilterBar.tsx`, `SearchBar.tsx` are pure prop-forwarding to `TextInput`
  with no state. `QueryBar.tsx`'s logic is already tested via
  `queryAutocomplete.test.ts`. `JsonTree.tsx`'s fold state lives in
  `flattenJsonTree`, already tested in `jsonTree.test.ts`.
- `src/utils/handlePromptSubmit.ts` and `src/hooks/useVirtualWindow.ts` have
  **zero call sites anywhere else in the repo** (verified via grep) — dead
  code, not undertested code.
- `src/utils/time.ts` (`isoNow()`) takes no input — cannot be edge-cased.
- `useTerminalSize.ts` uses `useState`/`useEffect`; testing its
  listener-cleanup behavior requires a React renderer, which this repo
  doesn't have — same undeclared-dependency problem as the dropped
  component-test item.

## Items

### 1. [S] Unit tests for `src/lib/pathValue.ts`

Focus on `parsePath`'s throw paths — 5 distinct malformed-input error cases
at `pathValue.ts:14, 27, 42, 50, 62` — plus `getPathValues`'s `found: false`
short-circuit at line 96, plus positive-path resolution for nested paths,
array wildcard (`[]`), and array index (`[1]`). Note: `pathValue.ts:34-37`
skips `.` separators, so `.[]`/`.[1]` and `[]`/`[1]` parse identically —
assert this equivalence directly rather than treating one form as
"corrected" over the other.

**Acceptance:** `tests/pathValue.test.ts` covers all 5 `parsePath` error
cases (each asserting the specific thrown error), the `found: false`
short-circuit, and positive-path resolution for nested/wildcard/index paths
(including confirming `.[]` and `[]` are equivalent).

### 2. [M] Unit tests for `src/lib/source/{fileSource,urlSource,stdinSource,lineChunks}.ts`

(`cmdSource` is already covered by a sibling epic's item, `log-cli-nm2.4` —
not duplicated here.) Cover: `fileSource` — FIFO detection path, basic
read; `urlSource` — the new `response.ok`/timeout behavior being added by
`log-cli-nm2.2`/`log-cli-nm2.3` (write AFTER those land, so tests validate
final behavior, not soon-to-change behavior); `stdinSource` — basic read,
EOF handling, isolated from the real `process.stdin` (use a stubbed/piped
readable stream rather than mutating the global, matching the pattern
`tests/e2e-smoke.test.ts` uses for piped-stdin subprocess tests, or an
injectable stream parameter if the module supports one); `lineChunks` —
chunk-boundary/partial-line handling.

**Acceptance:** one test file per adapter (or a shared suite) with at least
2 named behavior-level assertions per adapter: `fileSource` — FIFO vs
regular file detection, and a basic multi-line read; `urlSource` — a 4xx/5xx
response is surfaced as an error (not ingested as entries) and a
non-responding connection times out per `log-cli-nm2`'s new behavior;
`stdinSource` — full-input read and EOF/close handling, via an isolated
stream (not global `process.stdin` mutation); `lineChunks` — a line split
across two chunk boundaries is reassembled correctly, and a final
chunk without a trailing newline is still emitted.

**Depends on:** `log-cli-nm2.2`, `log-cli-nm2.3` (urlSource behavior must be
final before testing it).

### 3. [S, re-scoped] Unit tests for `useTerminalSize`'s pure fallback logic

Original item (testing `useTerminalSize` + `useVirtualWindow` hooks
directly, including mount/unmount listener behavior) is dropped: (a)
`useVirtualWindow.ts` is dead code (zero call sites — routed to
`log-cli-nm2.9` for a delete/wire decision, not tested here); (b) testing
`useTerminalSize`'s listener add/remove requires a React renderer this repo
doesn't have — the same undeclared dependency problem as the dropped
component-test item. Re-scoped: extract the `columns ?? 100` / `rows ?? 30`
fallback resolution in `useTerminalSize.ts` into a small pure exported
helper function, and unit-test that helper directly — no renderer needed.
Listener add/remove behavior is explicitly left untested here; it's a
natural follow-on once item 4's render harness exists, not a blocker for
this item.

**Acceptance:** the extracted pure helper is tested with `process.stdout`
missing/present `columns`/`rows`, confirming the `100`/`30` fallback values;
no behavior change to `useTerminalSize`'s existing runtime behavior.

### 4. [S, deferred] Render-harness test for `LogList.tsx`/`DetailPane.tsx`

After `log-cli-nm2.8` (threading `preserveAnsiText` through `LogList.tsx`
and `DetailPane.tsx`) lands, establish a first render-harness test
(introducing `ink-testing-library` or equivalent — package.json has none
today) specifically covering that new prop-plumbing, where the harness has
an actual regression to catch. Do not add this dependency for the 4
originally-considered stateless components (`FilterBar`, `SearchBar`,
`QueryBar`, `JsonTree`) — none have extractable testable logic beyond what
`queryAutocomplete.test.ts`/`jsonTree.test.ts` already cover.

**Acceptance:** a render-harness dependency is added, justified by this
specific prop-plumbing need. A test asserts `preserveAnsiText: false`
actually strips ANSI in rendered `LogList`/`DetailPane` output (not just at
the pure-function level already covered by `log-cli-nm2.8`'s own acceptance
criteria).

**Depends on:** `log-cli-nm2.8`.

## Dropped from Scope (routed elsewhere)

- **Unit tests for `handlePromptSubmit.ts`** — dead code (zero call sites),
  not undertested code. Routed to `log-cli-nm2.9` (ADR-0001 audit) for a
  delete-or-wire decision; will be tested only if wired into actual use.
- **Unit tests for `time.ts`/`id.ts`** — `time.ts`'s `isoNow()` takes no
  input (unedge-caseable); `id.ts`'s only real "contract" is a module
  counter with no interesting behavior. Not worth a dedicated test.
- **Unit tests for `useVirtualWindow.ts`** — dead code (zero call sites),
  and a near-duplicate of `listWindow.ts`'s already-tested algorithm even
  if it were live. Routed to `log-cli-nm2.9`'s audit scope alongside
  `handlePromptSubmit.ts` for a delete-or-wire decision (this expands
  `log-cli-nm2.9`'s file list; see that bead's updated description).
- **Component tests for `FilterBar`/`SearchBar`/`QueryBar`/`JsonTree`** —
  none have extractable testable logic; see verified facts above. Superseded
  by item 4's narrower, justified render-harness item.

## Risks and Mitigations

- **Risk:** item 2's urlSource tests could be written against pre-`nm2`
  behavior if sequencing isn't enforced. **Mitigation:** explicit `bd dep`
  on `log-cli-nm2.2`/`log-cli-nm2.3`.
- **Risk:** `stdinSource` tests could flake or interfere with other tests
  if they mutate the real global `process.stdin`. **Mitigation:** use an
  isolated/injectable stream, matching `e2e-smoke.test.ts`'s
  subprocess-piping pattern rather than touching the global directly.
- **Risk:** item 4 introduces a new dependency (`ink-testing-library` or
  equivalent) — scope creep if not tightly bounded. **Mitigation:** it's
  gated behind `log-cli-nm2.8` landing first and scoped only to the
  specific `preserveAnsiText` prop-plumbing regression it exists to catch.

## Verification Steps

- `bun test` after each item — 0 new failures, new tests pass.
- `bun run typecheck` after any extracted-helper refactor (item 3).
- For item 4: confirm the new dev dependency is dev-only (not shipped in
  `dist/`).

## Dependencies / Ordering

- Item 2 depends on `log-cli-nm2.2`, `log-cli-nm2.3`.
- Item 4 depends on `log-cli-nm2.8`.
- Items 1 and 3 have no cross-epic dependency.
- `log-cli-nm2.9`'s audit scope is expanded (via that bead's description)
  to include `handlePromptSubmit.ts` and `useVirtualWindow.ts` as
  additional dead-code-or-wire candidates, discovered here.

## ADR

**Decision:** Narrow the test-coverage epic from 5 filename-gap-derived
items to 4 verified items, dropping or rerouting everything that rested on
a false premise (nonexistent test harness, already-covered logic one layer
down, or outright dead code).

**Drivers:** tests-as-contracts over coverage-as-ratchet — a test on dead
code or on logic with no behavior to break is negative value (maintenance
cost, false confidence), not neutral.

**Alternatives considered:** shipping the original 5-item plan as written
(rejected — 3 of 5 items would have produced tests that pass trivially and
never catch a real regression, per two independent adversarial reviews);
adding a full component-rendering harness now for the 4 stateless
components (rejected — no existing regression justifies it; deferred to
item 4's narrower, justified scope).

**Why chosen:** every remaining item asserts a contract that can actually
break, verified against the real code rather than assumed from filenames.

**Consequences:** the epic is smaller than originally scoped (4 items, not
5) but every item has verified value. Two dead-code findings
(`handlePromptSubmit.ts`, `useVirtualWindow.ts`) get folded into the
existing ADR-0001 audit item rather than spawning a new "duplication" bead
(the original routing idea, corrected — this is dead code, not a live
duplicate needing DRY cleanup).

**Follow-ups:** `log-cli-nm2.9`'s audit should decide whether
`handlePromptSubmit.ts` and `useVirtualWindow.ts` get wired into actual use
or deleted; if wired, they'd need their own future test-coverage bead.

## Changelog (consensus rounds)

- **v1 → v2** (Architect round 1): item 5 (originally 4 component tests)
  assumed a rendering harness (`mergedList.test.tsx`'s pattern) that
  doesn't exist — that file tests pure functions only, and `package.json`
  has no React/Ink test-rendering dependency; all 4 target components were
  found to have no extractable testable logic. Item 4 assumed a
  hook-testing pattern (`stateStore.test.ts`) that also doesn't exist (pure
  functions only) and duplicated `listWindow.ts`'s already-tested
  algorithm. Item 3's `time.ts` target takes no input to edge-case. Item 1
  needed strengthening toward `parsePath`'s untested throw paths.
- **v2 → v3 (final)** (Critic round 1): `handlePromptSubmit.ts` and
  `useVirtualWindow.ts` (item 4's rescoped hook target) both found to be
  dead code with zero call sites repo-wide — verified independently via
  grep before finalizing; routed to the ADR-0001 audit instead of being
  tested. Item 4 (`useTerminalSize`) still secretly required the same
  undeclared render-harness dependency item 5 was deferring — re-scoped to
  test only an extracted pure helper, no renderer needed. Item 1's
  bracket-syntax "correction" was itself wrong (`.` separators are skipped,
  so `.[]`/`[]` are equivalent, not different) and its cited line numbers
  were off by 1-8 lines — both corrected. Capped at round 2 — fixes applied
  directly rather than triggering a 3rd full review round.
