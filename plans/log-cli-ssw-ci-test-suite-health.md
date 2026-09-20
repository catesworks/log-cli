# Plan: Epic log-cli-ssw — CI/Test-Suite Health

Status: pending approval
Epic bead: log-cli-ssw
Spec: .internal/specs/2026-09-06-remaining-backlog-design.md (Epic 1)
Consensus: 4 rounds of Planner/Architect/Critic (see Changelog). Fixture
content below was independently verified against all 4 rounds' findings.

## Requirements Summary

`examples/mixed.log` and `examples/mixed-2.log` have never existed in this
repo's git history (`git log --all -- examples/mixed.log examples/mixed-2.log`
returns nothing), yet `README.md` references `examples/mixed.log` in 10
places (lines 32, 39, 45, 53, 71, 77, 137, 164, 170, 339 — none reference
`mixed-2.log`) and `tests/e2e-smoke.test.ts` spawns the CLI against both
files in 8 test cases. Running `bun test` today produces **85 pass / 8
fail**, all 8 failures being exactly the tests referencing these two missing
files. `.github/workflows/ci.yml` currently runs ONLY `bun install` + `bun
run typecheck` — no build, no test, no test:e2e step exist in CI today (there
is nothing to "re-enable"; this plan *adds* them). A comment in that file
explains `bun test` was excluded because of these 8 failures, which blocks
the agent-ops auto-merge gate (`ciState === "success"` requirement).

## RALPLAN-DR Summary (short mode)

**Principles:**
1. Restore the actual missing fixtures — don't weaken test assertions to fit
   convenient content.
2. Where assertions underdetermine content, state the free variable
   explicitly and resolve it by fiat with documented rationale — never claim
   false pure-derivation.
3. CI changes land as one atomic, sequenced diff — never parallel edits to
   the same file, and never assume a CI step exists before verifying it does.
4. Flakiness must be caught via a CI-side trial, not asserted away by local
   runs alone — local and CI environments (and even local vs. CI *build
   artifacts*) can genuinely differ.
5. Add a lightweight recurrence guard so these fixtures can't silently
   vanish again.

**Decision Drivers (top 3):**
1. Correctness under underdetermined assertions — mixed-2.log's json/text
   split is a genuinely free variable (confirmed via `src/lib/summary.ts:23`
   mapping all sources including 0-match ones), and it's cross-file coupled
   to a "line"-substring/unknown-level budget — needs an explicit,
   verified resolution, not a guess.
2. Restore CI trust without introducing new flakiness or an unrecoverable
   rollback situation on `main`.
3. Minimal, non-conflicting CI diff — avoid redundant steps (`test:e2e` is a
   strict subset of `test`) and avoid silently testing a stale artifact.

**Viable Options:**
- **Option A (chosen):** Reconstruct fixture content by reading every
  assertion in `tests/e2e-smoke.test.ts` and cross-referencing
  `src/lib/parseLine.ts`'s level-normalization rules, explicitly resolving
  every free variable. Pros: deterministic where determinable, explicit
  where not, fully traceable, no test-file changes. Cons: requires careful
  derivation (done below) including a real cross-file coupling constraint.
- **Option B:** Rewrite the 8 failing assertions to depend on inline content
  instead of external fixture files. Rejected — `README.md:339` (`See
  [examples/mixed.log](examples/mixed.log)`) is a broken link regardless of
  test design; this is the dispositive reason, not merely "masks the
  regression."
- **Option C:** Skip/delete the 8 failing tests. Rejected — violates the
  Production-Grade Doctrine's ban on shortcut-via-deletion; these tests
  exercise real, documented CLI behavior (merge, filter, query, wrapper
  binary) and defeat the epic's own purpose.

Option A is the only viable option; B and C are invalidated above.

## Derived Fixture Content

Key semantic facts: `parseLine.ts` gives a plain-text line `levelNormalized:
"unknown"` unconditionally; a JSON entry gets `levelNormalized` from its
`level`/`severity` field if present, or `"unknown"` if that field is
**absent** — so a level-less JSON line also counts as "unknown," which is
why every JSON fixture entry below carries an explicit `level`.

### `examples/mixed.log` (5 entries: 3 json, 2 text) — fully determined

```
{"level":"info","message":"server started on port 8080"}
{"level":"error","message":"connection timeout after 30s"}
{"level":"warn","message":"slow request detected"}
processing line 42
worker heartbeat ok
```

- `entries: 5, json: 3, text: 2` by construction.
- `--filter message:timeout --query 'level = "error"'` → `totalEntries: 1`:
  only the error line contains "timeout"; intersection is exactly 1.
- Contributes 1 of 2 matches for the cross-file "line"-substring /
  `levelNormalized === "unknown"` budget: `processing line 42` is text
  (unknown) and contains "line".
- No other line contains "timeout" or "line" as a substring.

### `examples/mixed-2.log` (3 entries: 2 json, 1 text) — resolves the free variable

Combined `totalEntries` must be 8 (`:80`), so with mixed.log fixed at 5,
mixed-2.log must have exactly 3 entries. Its json/text split is genuinely
free in `{3/0, 2/1, 1/2, 0/3}` (per `summary.ts:23`) — resolved here as
**2/1** (non-degenerate for `--merge` demos), and its content is chosen to
land the cross-file "line"/unknown budget at exactly 2 total:

```
{"level":"info","message":"cache warmed successfully"}
reading input line by line
{"level":"debug","message":"metrics flushed"}
```

- Combined with mixed.log: `5 + 3 = 8` total entries.
- Contributes the 2nd of 2 matches for the "line"/unknown budget: `reading
  input line by line` is text (unknown) and contains "line" (once counted
  per entry, despite two occurrences).
- No other line contains "timeout" or "line" as a substring.
- Both JSON entries have an explicit `level`, so neither inflates the
  unknown-level budget.

### Full assertion coverage check (all 8 currently-failing tests)

1. `summarizes a file as json` — generic shape check, satisfied by any valid
   file. ✓
2. `summarizes multiple files as multiple sources` — `totalEntries: 8`,
   labels present — satisfied (5+3=8, both source labels always emitted per
   `summary.ts:23` even if a source had 0 matches). ✓
3. `applies startup filter and query in summary mode` — `totalEntries: 1` —
   satisfied. ✓
4. `applies startup filter and query in merged summary mode` —
   `totalEntries: 2`, both labels present — satisfied via the cross-file
   "line"/unknown budget above. ✓
5. `supports the full merged startup control set together` — same content
   assertions plus flag-echo fields (`mergedActive`/`reverse`/`follow`),
   which come from CLI flags, not fixture content. ✓
6. `ignores piped stdin when explicit file sources are provided` — single
   source (mixed.log only), `entries: 5`, `mergedRequested: true`,
   `mergedActive: false` — satisfied by mixed.log's 5 entries plus existing
   merge-with-one-source-ignored behavior. ✓
7. `wrapper binary supports merged startup filters and queries` — same as
   #4 via `./bin/log`. ✓
8. `wrapper binary ignores merge when only one source is provided` —
   `entries=5, json=3, text=2` — satisfied directly by mixed.log. ✓

## Implementation Steps

1. **[S] Write the fixture-content mapping doc.** Record the derivation
   above as the authoritative mapping from all 8 test assertions + all 10
   README refs to the two files' exact content, including the explicit
   free-variable resolution (mixed-2.log's 2/1 split) and the cross-file
   "line"/unknown-level budget check (= 2). No new investigation needed —
   the derivation above already does this; this step is "commit it as the
   spec of record before creating files."
   **Acceptance:** mapping table exists covering all 8 assertions + 10
   README refs; free-variable resolution and cross-file budget both stated
   explicitly with rationale (not "derived," where genuinely chosen).

2. **[S] Create `examples/mixed.log` and `examples/mixed-2.log`** with the
   exact content above, each with a one-line leading comment/header (or
   companion note if the format disallows comments) documenting the entry
   count contract (e.g. "mixed.log: 5 entries, 3 json, 2 text, 1
   error+timeout"). Add one lightweight guard test asserting both files
   exist with the expected entry/json/text counts, so silent future
   deletion is caught immediately rather than surfacing as 8 unrelated
   e2e failures.
   **Acceptance:** `bun test` 0 failures (exact total TBD once the guard
   test is added — do not hardcode a stale count). For the 9 README refs
   that invoke the CLI directly on local fixture content (lines 32, 39, 45,
   53, 71, 77, 164, 170, 339) plus the piped-stdin variant at line 137: run
   each and assert exit code 0 and the expected entries/json/text summary
   counts. (Non-TTY invocations auto-route to summary mode per
   `main.tsx:152` — verified empirically, e.g. `bun run src/cli.ts
   /tmp/t.log </dev/null` exits 0 with summary output — so no hang risk and
   no timeout/kill workaround is needed here.) README examples that hit
   `docker logs -f`/network URLs (lines 58, 64, 146, 155-156) are excluded
   from this acceptance check — not testable against these fixtures.
   Depends on step 1.

3. **[S] Local flake baseline against the CI-equivalent artifact.** First
   run `bun run build` so the local baseline exercises the same freshly
   built `dist/cli.js` that CI will use — not the stale git-tracked one (a
   fresh `bun run build` differs from the currently tracked `dist/cli.js` by
   ~222 lines due to bun-version drift between whatever built the tracked
   copy and the environment running this plan). Then run `bun test` 10
   consecutive times, watching the 4 time-sensitive assertions:
   `elapsedMs < 1500` checks (~:201, :281), a 120ms `setTimeout` stream race
   (~:239-242), and a `sleep 0.06` loop (~:305-309). Since hosted CI
   runners are meaningfully slower than local dev machines, proactively
   loosen these budgets now (e.g. raise the threshold, or gate a looser
   value behind `process.env.CI`) rather than waiting for CI flakiness to
   surface it — a test that flakes even 10% of the time still clears "3
   green CI runs" (step 4) roughly 73% of the time, so reactive-only
   detection is unreliable.
   **Acceptance:** 10 consecutive local runs against a freshly built
   `dist/cli.js`, 0 failures across all 10; the 4 timing assertions
   reviewed and their thresholds justified/loosened with documented
   rationale. Depends on step 2.

4. **[S] Add CI steps + pin the bun version, in one sequenced diff to
   `.github/workflows/ci.yml`.** Pin an explicit `bun-version` on the
   `oven-sh/setup-bun@v2` step (currently unpinned) to eliminate the
   version-drift class of bug found in step 3. Add `bun run build` then
   `bun test` after the existing `typecheck` step, in that order
   (build-before-test, since 7 of the 8 tests exec the git-tracked
   `dist/cli.js`). Do **not** add `test:e2e` as a separate CI step — it is a
   strict subset of `bun test` (`package.json`) and would be pure redundant
   cost; keep the `test:e2e` script for local convenience only. Remove the
   stale "8 pre-existing failures" comment. Update
   `knowledge-base/config.yml`'s `test_command` (currently `"bun test &&
   tsc --noEmit"`) to prefix the build step (`"bun run build && bun test &&
   tsc --noEmit"`) so the agent-ops eval gate matches what CI actually
   verifies. Trial on a draft PR; require 3 consecutive clean CI runs before
   merging to `main` (each push re-running the workflow counts as one
   trial). Explicit revert plan: if `bun test` goes red on `main`
   post-merge, immediately revert this CI diff (not the fixtures) to
   restore the auto-merge gate, then re-open this item.
   **Acceptance:** 3 consecutive green CI runs on a draft PR with pinned
   `bun-version` and build-before-test order; `knowledge-base/config.yml`
   updated to match; documented revert command in the PR description.
   Depends on step 3.

5. **[S, cross-epic pointer, not solved here]** Whether `dist/cli.js` should
   remain git-tracked at all (vs. CI-built, never committed) is flagged as a
   follow-up for the Tech Debt/Robustness epic (`log-cli-nm2`) — the
   version-drift finding in step 3/4 strengthens the case for revisiting
   this, but step 4's pinned-build-before-test ordering already neutralizes
   the immediate staleness risk without requiring that decision now.

## Acceptance Criteria (epic-level)

- [ ] `bun test` exits 0 with all tests passing (10 consecutive local runs,
      against a freshly built `dist/cli.js`).
- [ ] `examples/mixed.log` and `examples/mixed-2.log` exist, are tracked in
      git, and carry a documented entry-count contract.
- [ ] A guard test fails immediately (not via 8 unrelated e2e failures) if
      either fixture is ever deleted or its shape changes.
- [ ] `.github/workflows/ci.yml` pins `bun-version`, runs `build` → `test`
      after `typecheck`, has no `test:e2e` CI step, and no reference to the
      old "8 pre-existing failures" comment remains.
- [ ] `knowledge-base/config.yml`'s `test_command` matches the real CI
      contract.
- [ ] 3 consecutive green CI runs on a draft PR before merge; a documented
      revert command exists in the PR description.

## Risks and Mitigations

- **Risk:** the free-variable resolution (mixed-2.log's 2/1 split) or the
  cross-file "line"/unknown budget was miscounted. **Mitigation:** step 2's
  acceptance requires the full suite green locally before any CI change;
  the derivation above shows the count explicitly (2 total matches: one per
  file), not asserted.
- **Risk:** CI-environment-specific flakiness in the 4 time-sensitive
  assertions, undetectable from local-only runs. **Mitigation:** step 3
  (local N=10 against a CI-equivalent build) *and* step 4 (CI-side N=3
  draft-PR trial) — local-only testing cannot substitute for a real CI
  trial.
- **Risk:** re-enabling `bun test` on `main` with no rollback path could
  block `main` if something environment-specific surfaces post-merge.
  **Mitigation:** explicit revert criterion in step 4.
- **Risk:** version drift between whatever built the currently-tracked
  `dist/cli.js` and the environment building it going forward (confirmed:
  ~222 line diff). **Mitigation:** step 3 rebuilds before baselining; step 4
  pins `bun-version` in CI.

## Verification Steps

1. `bun run build` then `bun test` — expect 0 fail, run 10x locally.
2. `bun run typecheck` — expect no errors.
3. `bun run build` — expect successful build output to `dist/`.
4. Push a draft PR, confirm 3 consecutive green GitHub Actions runs with the
   pinned bun version.
5. Manually exercise the 9 direct-invocation + 1 piped-stdin README examples
   listed in step 2 for exit code 0 and expected summary counts.

## Dependencies / Ordering

- Step 2 depends on step 1 (mapping must exist before files are created).
- Step 3 depends on step 2 (fixtures must exist before baselining).
- Step 4 depends on step 3 (local green + timing review before touching CI).
- Step 5 has no hard dependency on steps 1-4; it's a pointer to
  `log-cli-nm2` (Tech Debt/Robustness epic).
- No dependency on any other epic.

## ADR

**Decision:** Restore `examples/mixed.log` and `examples/mixed-2.log` with
content explicitly derived from `tests/e2e-smoke.test.ts` assertions and
`src/lib/parseLine.ts` semantics (with the one genuinely free variable —
mixed-2.log's json/text split — resolved by fiat and documented), add a
recurrence-guard test, then add `build`+`test` (pinned bun version,
build-before-test order) to CI as a single sequenced, draft-PR-trialed diff
with an explicit revert plan.

**Drivers:** unblock the agent-ops auto-merge gate; fix the actual root
cause (missing fixtures + a broken README link) rather than a symptom; avoid
converting 8 deterministic failures into intermittent CI flakiness.

**Alternatives considered:** rewrite test assertions to depend on inline
content (rejected — doesn't fix README's broken link, the dispositive
issue); skip/delete the 8 tests (rejected — violates the no-shortcut
doctrine and defeats the epic's purpose).

**Why chosen:** Option A is the only alternative that fixes the actual gap
without weakening test coverage, and the 4-round consensus review surfaced
and closed every real correctness gap in the derivation and CI mechanics
(arithmetic, cross-file coupling, unpinned bun version, stale-artifact
testing, timing-budget risk).

**Consequences:** `examples/` gains 2 small tracked fixture files with a
documented contract; CI gains a real build+test gate (pinned bun version);
`knowledge-base/config.yml` needs to stay in sync with `ci.yml`'s actual
contract going forward; the dist-tracking question is deferred to
`log-cli-nm2`.

**Follow-ups:** `log-cli-nm2` (Tech Debt/Robustness) should decide whether
`dist/cli.js` remains git-tracked at all, informed by the version-drift
finding here.

## Changelog (consensus rounds)

- **v1 → v2** (Architect + Critic round 1): fixed README ref count (was
  claimed 9, actually 10, all `mixed.log`, none `mixed-2.log`); removed a
  fabricated risk (README has no output-content assertions to violate);
  fixed a self-defeating risk mitigation (local-only testing can't catch
  CI-specific flake); dropped the redundant `test:e2e` CI step; added an
  explicit revert plan; corrected the false "deterministic" principle to
  "explicit free-variable resolution" (mixed-2.log's split is genuinely
  free per `summary.ts:23`).
- **v2 → v3** (Architect round 2): fixed an arithmetic error — mixed-2.log
  must have exactly 3 entries (not 2), and its split is cross-file coupled
  to the "line"/unknown-level budget, not independently free.
- **v3 → v4** (Critic round 2): fixed step 4 assuming CI steps existed that
  don't (ci.yml only runs typecheck today); corrected the "unknown-level"
  equivalence to include level-less JSON entries, not just text lines;
  corrected the README-hang risk, which was backwards (non-TTY invocations
  auto-exit via summary mode, verified empirically).
- **v4 → v5 (final)** (Architect round 3): pinned `bun-version` in CI
  (found ~222-line drift between a fresh build and the tracked `dist/cli.js`
  from unpinned bun); moved the local flake baseline to run against a
  freshly built artifact, not the stale tracked one; added proactive
  loosening of CI timing-assertion budgets instead of reactive-only
  detection; aligned `knowledge-base/config.yml`'s `test_command` with the
  real CI contract. Capped at 4 rounds — remaining concerns were mechanical
  and directly incorporated rather than triggering a 5th full review round.
