# Plan: Epic log-cli-5vk — Packaging & Distribution

Status: pending approval
Epic bead: log-cli-5vk
Spec: .internal/specs/2026-09-06-remaining-backlog-design.md (Epic 4)
Consensus: 2 rounds (Architect, Critic). Both rounds found real gaps the
initial filename/script-existence read missed.

## Requirements Summary

`package.json` has `"private": true`, no publish script; `bin/log` shells
out to `bun` against a relative `src/cli.ts` path; build scripts produce
`dist/cli.js` (`bun build`) and `dist/log-cli` (`bun build --compile`);
`knowledge-base/config.yml` explicitly treats "private, no publish step" as
a deliberate pilot-repo choice, not an oversight.

## RALPLAN-DR Summary

**Principles:** (1) don't assume this should become a public npm package —
private is a deliberate choice per `knowledge-base/config.yml`, not an
oversight; (2) build on `log-cli-ssw`'s pinned-bun-version CI foundation,
don't duplicate/precede it; (3) versioning/release process proportionate to
a small private pilot repo, no heavyweight automation; (4) verify claims by
actually running things, not assuming from script existence.

**Decision Drivers:** (1) don't build distribution infrastructure for an
audience that may not exist yet; (2) make existing scripts trustworthy
before adding anything new; (3) minimize new CI surface area — `log-cli-ssw`
already adds 3+ CI steps.

**Verified repo facts:**
- `package.json:3-8`: `"version": "0.1.0"`, **`"private": true`**, `bin.log
  → bin/log`. No `files` field, no `publishConfig`, no release script.
- `bin/log:5`: `exec bun "${PROJECT_ROOT}/src/cli.ts" "$@"` — unconditional,
  no fallback to a bundled `dist/cli.js`.
- `.gitignore:2` ignores `dist/`, yet `dist/cli.js` is force-tracked (`git
  ls-files dist/`) because `tests/e2e-smoke.test.ts` (7 references) executes
  it as a fixture.
- `git tag -l` is empty; no CHANGELOG; `docs/adr/` holds 0001-0004 (0005 is
  the correct next ADR number).
- `dist/log-cli` (62MB) exists locally, confirming `build:exe` has run
  successfully at least once on macOS — but this is local/untracked, not
  shared evidence, and CI never exercises it.
- `examples/mixed.log` **does not exist yet** — it's the subject of
  `log-cli-ssw.2` (P0, open). Any smoke-test referencing it has a real
  cross-epic dependency, not something usable today.

## Items

### 1. [S, decision] Publish posture, informed by a publishability audit

**Audit findings (all verified, feed directly into the decision):**
1. **`package.json:4` is `"private": true`.** `npm publish` hard-fails on
   this regardless of anything else — this is the actual current-state
   encoding of "stays private," not a hypothetical option.
2. No `files` field — `npm pack` would fall back to `.gitignore` as the
   effective `.npmignore`, which excludes `dist/` entirely (despite
   `dist/cli.js` being force-tracked in git for test purposes).
3. `bin/log:5` unconditionally execs `bun <clone-path>/src/cli.ts` — no
   fallback to a bundled `dist/cli.js`. Even a hypothetical bin-based npm
   install would still require the full source tree + bun, defeating the
   purpose of a packaged CLI.
4. Related, not duplicated: `log-cli-ssw.5` (Tech Debt epic) is separately
   deciding whether `dist/cli.js` should remain git-tracked at all — that
   decision and this one should be made with awareness of each other, not
   independently.

**Options presented to the user (product decision, not technical):**
- **(A) Stays private, no publish.** This is already the encoded
  current state (`private: true`) — choosing A means "keep as-is, document
  why," not "make a change."
- **(B) Publish as a real npm package.** Requires: flip `private` to
  `false` (or remove it), add a `files` field, AND fix `bin/log` to
  reference a bundled `dist/cli.js` with a real fallback path. This is new
  engineering scope beyond items 2/3 — if chosen, file a new follow-up bead,
  not solved in this epic.
- **(C) GitHub Releases-only compiled-binary distribution (no npm).**
  `bin/log` stays irrelevant to that install path; ties directly into item
  2's `build:exe` verification.

**Acceptance:** `docs/adr/0005-publish-posture.md` documents all 4 audit
findings and the chosen posture with rationale, cross-referencing
`log-cli-ssw.5`. If B is chosen, a new follow-up bead is filed.

### 2. [S/M] Verify/document `build:exe`, local verification only

Scoped as local verification, not a new CI job — a multi-minute,
~60MB-artifact CI job isn't justified before item 1's posture decision, and
would contradict the "minimize new CI surface area" driver given
`log-cli-ssw`'s plan already adds 3+ CI steps.

- **macOS:** `dist/log-cli` (62MB) already confirms `build:exe` runs
  successfully. Smoke-test it: run `./dist/log-cli
  examples/high-volume-generator.mjs`-derived output (the one example
  fixture that exists today) or an ad-hoc local `.log` file, and confirm
  exit 0 with a valid JSON/text summary matching the input. **Once
  `log-cli-ssw.2` lands** (creates `examples/mixed.log`), re-run the smoke
  test against that fixture too, matching README's documented behavior —
  this half of the criterion is explicitly blocked on that bead.
- **Linux:** verify via a one-time local run in a container, writing to a
  **distinct output path** so it doesn't clobber the macOS binary, and
  installing dependencies fresh rather than reusing host `node_modules`:
  `docker run --rm -v $(pwd):/repo -w /repo oven/bun bash -c "bun install && bun build ./src/cli.ts --compile --outfile dist/log-cli-linux"`.
  Smoke-test the resulting `dist/log-cli-linux` the same way as macOS.

**Acceptance:** a new "Distributing" section in README documents both
verification results (macOS smoke test with a concrete pass criterion —
exit 0 + expected output — and Linux smoke test, same criterion), including
the container command used. The `examples/mixed.log`-based smoke test is
explicitly marked as pending `log-cli-ssw.2`.

**Depends on:** item 1 (framing depends on the decision — a "stays private"
outcome means this item's value is "confirms our own build tooling works,"
not "ready to distribute"). Partially depends on `log-cli-ssw.2` for the
`examples/mixed.log`-based half of the smoke test.

### 3. [S] Versioning/release process

`package.json` has sat at `0.1.0` since first commit; no CHANGELOG, no git
tags, no release script.

- If item 1's decision is "stays private" (A): a lightweight process is
  enough — bump `package.json` version + `git tag` on notable changes, no
  CHANGELOG automation.
- If a distribution posture is chosen (B or C): tags become load-bearing
  (anchor GitHub Releases or npm publishes) — the process needs tagging
  immediately before any publish action, and a minimal CHANGELOG.

**Acceptance:** a new "## Releasing" section is added to README (the exact
artifact — not just "a documented process somewhere") describing the
chosen process, matching item 1's posture decision.

**Depends on:** item 1.

## Risks and Mitigations

- **Risk:** item 1 requires a live product decision from the user with no
  stated fallback if they don't respond promptly. **Mitigation:** default
  to documenting option A (the current encoded state) if no response is
  given within a reasonable window — "stays private" requires no code
  change, only the ADR.
- **Risk:** item 2's Linux/macOS verification commands could collide
  (same output path) or use stale dependencies. **Mitigation:** distinct
  output filenames (`dist/log-cli` vs `dist/log-cli-linux`) and a fresh
  `bun install` inside the Linux container.
- **Risk:** item 2's smoke test has no fixture to run against until
  `log-cli-ssw.2` lands. **Mitigation:** smoke-test against
  `examples/high-volume-generator.mjs`-derived output now; explicitly defer
  the `mixed.log`-based check.

## Verification Steps

1. `npm pack --dry-run` (or equivalent) run once as part of item 1's audit,
   output referenced in the ADR.
2. macOS `build:exe` smoke test — documented exit code + output.
3. Linux container `build:exe` smoke test — documented exit code + output,
   distinct binary path.
4. README additions (Distributing, Releasing sections) reviewed for
   accuracy against the actual decision made.

## Dependencies / Ordering

- Item 2 depends on item 1 (framing) and partially on `log-cli-ssw.2`
  (fixture availability for one half of its smoke test).
- Item 3 depends on item 1 (posture determines process weight).
- Item 1 is cross-referenced with (not blocked by) `log-cli-ssw.5`.

## ADR

**Decision:** Make the publish-posture decision explicit and
audit-informed (including the previously-missed `private: true` field and
the broken `bin/log` → build-artifact linkage) before doing any
verification or versioning work, rather than assuming a posture or treating
`build:exe` verification as posture-independent.

**Drivers:** an npm publish today would silently ship a broken package
(`dist/` excluded via `.gitignore` fallback, `bin/log` unconditionally
requiring a full source clone) — this needs to be known before any
packaging decision, not discovered after a bad publish.

**Alternatives considered:** treating "verify build:exe" and "publish
posture" as independent, parallelizable work (rejected — item 2's Linux CI
verification would be pure waste if the decision is "stays private," and
its exact framing depends on the outcome); assuming public npm publish is
the goal (rejected — `knowledge-base/config.yml` treats private as
deliberate, not an oversight).

**Why chosen:** sequencing the decision first, informed by a real
publishability audit, prevents doing verification/versioning work whose
value depends on an answer that doesn't exist yet.

**Consequences:** item 1 requires a human product decision, introducing a
soft dependency on user availability; if option B (npm publish) is chosen,
a new follow-up bead with real engineering scope (fixing `bin/log`, adding
a `files` field, flipping `private`) is needed beyond this epic.

**Follow-ups:** if B is chosen, file a `bin/log` + `files` field fix as a
new bead; `log-cli-ssw.5`'s dist/cli.js tracking decision should be made
with awareness of this epic's item 1 outcome and vice versa.

## Changelog (consensus rounds)

- **v1 → v2** (Architect round 1): the plan omitted the actual packaging
  defect in the repo — `bin/log` is disconnected from every build artifact,
  and an npm publish today would ship a broken package (`dist/` excluded
  via `.gitignore` fallback with no `files` field). Reordered so the
  publish-posture decision (with this audit folded in) comes first, since
  items 1/3 (build:exe verification, versioning) are not truly
  posture-agnostic. Resolved a CI-cost contradiction: item 1's original
  acceptance wanted a Linux CI job, directly contradicting a stated
  decision driver to minimize new CI surface area — rescoped to local
  verification only.
- **v2 → v3 (final)** (Critic round 1): `examples/mixed.log` (used in the
  original smoke-test acceptance) doesn't exist yet — it's `log-cli-ssw.2`'s
  deliverable (P0, open) — smoke test rescoped to use the existing
  `high-volume-generator.mjs` fixture now, with the `mixed.log`-based check
  explicitly deferred. `package.json`'s `private: true` field was missing
  entirely from the publishability audit — added as finding #1, clarifying
  that "stays private" (option A) is the already-encoded current state, not
  a new choice, and that option B's scope must include flipping it. Fixed a
  build-command collision: the Linux and macOS `build:exe` verification
  commands would have written to the same output path, clobbering each
  other, and the Linux container run reused host `node_modules` without a
  fresh install — both fixed with a distinct output filename and an
  in-container `bun install`. Named concrete acceptance artifacts (README
  sections) instead of vague "documented process" language. Capped at
  round 2 — fixes applied directly rather than triggering a 3rd full review
  round.
