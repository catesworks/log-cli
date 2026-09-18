# Plan: Epic log-cli-nm2 — Tech Debt / Robustness

Status: pending approval
Epic bead: log-cli-nm2
Spec: .internal/specs/2026-09-06-remaining-backlog-design.md (Epic 5)
Consensus: 3 rounds (Architect, Critic, Architect). Independent of
log-cli-ssw (CI/fixture root cause).

## Requirements Summary

Nine independent latent robustness gaps in shipped code, found by direct
read-through of `src/lib/*.ts` and `src/lib/source/*.ts` against
`docs/ONBOARDING.md`'s core rules and ADR-0001's "some copied shell files
remain generic and may be simplified later" note.

## RALPLAN-DR Summary

**Principles:** (1) fix each gap at its actual failure point, no generic
broad error-handling; (2) preserve existing success-path behavior — these
are error/edge-case-path-only changes; (3) sequence same-file items
explicitly, never declare false parallelism; (4) every acceptance criterion
must be a concrete, runnable check; (5) no security-control changes —
cmdSource/urlSource operate at the same trust boundary as the user's own
shell (resolved in the original brainstorm stress-test).

**Decision Drivers:** (1) each fix independently shippable/revertable; (2)
don't over-engineer (no generic retry framework, no sandboxing); (3) audit
items produce a decision artifact, not prose reassurance.

## Items

### 1. [M] Config error handling — `src/lib/config.ts`

`readConfigFile` (config.ts:47-55) collapses ENOENT / JSON-parse-error /
zod-validation-error into one `null`. Split into 3 cases:
- Explicit `--config <path>` missing (ENOENT) → hard-fail.
- Explicit `--config <path>` malformed (JSON syntax OR zod error) →
  hard-fail naming path + specific error.
- Auto-discovered tier files (`./.log.jsonc`, `$HOME/.config/log/config.jsonc`)
  malformed (any kind) → stderr warning + defaults, continue.
- No config anywhere → silent, unchanged.

`config.ts` must **throw a typed error** (e.g. `ConfigLoadError`), never call
`process.exit` itself (would kill `bun test` if config-loading is unit
tested). There are **two** call sites that must both catch it:
`main.tsx:29` (runSummary path) and `main.tsx:157` (interactive path) —
`main.tsx:152` routes any non-TTY stdout to the runSummary path, so a
scripted/piped acceptance check exercises that path, not the interactive
one. Interactive path routes the caught error through the project's
existing `exitWithMessage` convention (`interactiveHelpers.tsx:75-78`);
summary path prints to stderr and sets `process.exitCode = 1`.

**Acceptance:** `--config missing.jsonc` → clean exit via `exitWithMessage`
(interactive) or stderr+exitCode 1 (summary/piped), naming the path, not a
raw unhandled-rejection stack. `--config bad.jsonc` (JSON syntax error) →
same, naming path+error. `--config wrongtype.jsonc` (zod error, e.g.
`maxEntries` as a string) → same, naming path+validation error. Malformed
auto-discovered `./.log.jsonc` → stderr warning + CLI starts with defaults.
No config file anywhere → silent (unchanged). All four cases verified via
**both** the interactive and the piped/non-TTY invocation path.

### 2. [M] URL source error surfacing — `src/lib/source/urlSource.ts` + status channel

`onStatus: (message: string)` (`source/types.ts:5`, `sourceManager.ts:11`)
carries no `sourceId` and no error/info discriminator — it's the same
channel used for benign "…completed" messages, so string-sniffing to detect
errors is forbidden. Extend the channel to carry `{ sourceId, kind:
"info" | "error", message }`, threaded through all 4 source adapters,
`sourceManager.ts`, `LogScreen.tsx:234`, `main.tsx`, and
`sourceManager.test.ts`. In `LogScreen`, persist source-error state (e.g. a
`sourceErrors` map keyed by sourceId) rather than relying on the transient
status line, which is overwritten by the next ingest batch every ~50ms
(`LogScreen.tsx:231`) — a fleeting status message is not an acceptable
"visible" criterion. `urlSource.ts` checks `response.ok`; non-2xx emits a
`kind: "error"` status instead of streaming the response body as log
entries. In `runSummary` (`main.tsx:29`), wire the same channel: on exit, if
any source reported a `kind: "error"` status, print it to stderr and set
`process.exitCode = 1`.

**Acceptance:** `--url <404-endpoint> --summary-json` → stderr message
naming URL+status, `process.exitCode=1`, JSON shows 0 entries for that
source (not the error-page body ingested as entries). Interactive mode:
the same `response.ok` failure is visible in a persistent per-source error
indicator (not a message that vanishes on the next batch) for as long as
that source remains in error.

*(Scope note: this item grew from the original "reuse an existing
mechanism" assumption to a real, small interface change across the status
channel. If implementation reveals further complexity, split into its own
follow-up rather than blocking the rest of this epic.)*

### 3. [M] URL connect timeout — `src/lib/source/urlSource.ts`

`AbortSignal.timeout(n)` would abort the whole response including an
already-connected healthy stream — wrong primitive. Also: a naive second,
independent `AbortController` either (a) if it *replaces* the signal passed
to `fetch`, breaks `close()` (`urlSource.ts:62-65`) from being able to abort
an in-flight fetch, or (b) if *detached* from the fetch call entirely, leaks
the socket on timeout. Correct mechanism: pass `AbortSignal.any([lifecycle
AbortController.signal, connectAbortController.signal])` to `fetch`, so
either the source's normal lifecycle abort (`close()`) or the connect
timeout can cancel it. On the connect-timeout path, explicitly call
`finish("URL source <url> connect timeout after Nms")` directly — do not
rely on the existing `if (!abortController.signal.aborted)` guard at
`urlSource.ts:56`, which swallows abort errors from the *lifecycle*
controller and would otherwise also swallow the connect-timeout's abort,
preventing `finish()` from ever running (hanging the source forever). Add an
`if (done) break;` guard in the read loop (`urlSource.ts:35-47`, currently
no such guard) so no entries are emitted after `finish()` has run. Define
"connect" as **headers/response resolved** (the `fetch()` promise settling),
not "first byte of body" — a healthy tail endpoint that is idle for 3s after
connecting must not be killed. Clear the timer in a `.finally` on the fetch
promise and `.unref()` it so it doesn't keep the process alive. New config
key `urlConnectTimeoutMs`, default **3000ms** (must stay under
`main.tsx:45`'s `maxSummaryWaitMs = 5000` so summary mode can actually
observe it). Document the new key in README's Config section.

**Acceptance:** a TCP listener that accepts-but-never-responds → `finish()`
called with a clear connect-timeout message within the configured window,
via the non-swallowed path. Default 3000ms is observable within
`maxSummaryWaitMs=5000`. A stream that resolves headers before the timeout
but is then idle for longer than the timeout value is **not** killed once
connected (only the pre-headers phase is guarded). `close()` still aborts
an in-flight connect-phase fetch (via the combined signal).

### 4. [S] cmdSource interleaving test — `src/lib/source/cmdSource.ts`

No behavior change — stdout/stderr interleaving via two independent
readline loops is acceptable, inherently racy real-process behavior. Add a
test documenting and asserting current behavior so a future refactor can't
silently break it.

**Acceptance:** a new test spawns a command emitting to both stdout and
stderr, asserts both streams appear in parsed entries with correct source
tagging.

### 5. [S, investigate-first] File source TOCTOU — `src/lib/source/fileSource.ts`

Original premise ("errors lack path context") may be false: Node fs errors
already embed the path in `.message`, and `fileSource.ts:54` already
interpolates it. The more likely real POSIX behavior is that unlinking an
open file produces **no error at all** from `fs.createReadStream` — silent
EOF/truncation, a different bug than assumed. Reproduce first (open a file
via fileSource, unlink it mid-read, observe: error, silent EOF, or hang?)
and document the actual finding; scope any fix based on what's actually
observed.

**Acceptance:** a documented repro of the actual unlink-mid-read behavior on
this platform. If it errors and the path is already present: close as
verified-no-op. If it silently EOFs/truncates: file that as the real,
correctly-scoped follow-up (not solved in this item).

### 6. [S] `validateSources` shape validation — `src/lib/sources.ts`

Only file-kind sources are validated today (`sources.ts:50-71`). Add:
`--url` must parse as a URL with scheme `http:` or `https:` (explicit
allowlist, not just "has a scheme" — reject `ftp://`, `file://`, etc.);
`--cmd` must be non-empty after trimming. `new URL(value)` **throws** on
invalid input rather than returning falsy — wrap in try/catch and convert
to a clean validation error.

**Acceptance:** `--url ftp://x`, `--url notaurl`, and `--cmd ""` all fail
fast at startup with a clear error, before attempting to fetch/spawn.
`--url https://x` and `--url http://x` pass shape validation.

### 7. [M] Graceful shutdown / process-group cleanup

Two distinct signal paths, not one: (a) Ink's `exitOnCtrlC: true`
(`interactiveHelpers.tsx:52`) means Ink **intercepts Ctrl+C in raw mode
itself** — no OS `SIGINT` fires for that keypress. The real cleanup path
for Ctrl+C is Ink's own unmount effect cleanup (`LogScreen.tsx:239`), not a
new process-level `SIGINT` handler. (b) An external `SIGTERM` (e.g. `kill
<pid>` from another process) is a genuinely separate case with no existing
handler — add `process.on('SIGTERM', ...)` for it. Both paths must reach
the same close logic. Separately, `cmdSource.ts:12` spawns via `bash -lc`
and `:55` only sends `SIGTERM`/`SIGKILL` to that direct pid — a shell
pipeline (`--cmd "a | b"`) leaves grandchildren running. Fix: spawn with
`detached: true` and kill via `process.kill(-child.pid)` (negative pid =
whole process group) instead of `child.kill()`, guarded against `pid ===
undefined` and an `ESRCH` catch (process already exited). Additionally,
`sourceManager.ts:74-79`'s close-all loop has no try/catch — one source's
throw currently skips closing the rest; wrap each close call individually.

First sub-step: **reproduce** the orphaned-process bug (start CLI with a
pipeline `--cmd "a | b"`, trigger both Ctrl+C and an external SIGTERM,
check the process list each time) before implementing, to confirm the gap
is real on both paths.

**Acceptance:** repro step confirms/refutes the bug on both paths. Fix
results in **all** processes in a `--cmd "a | b"` pipeline being terminated
on both (a) in-TUI Ctrl+C and (b) an external SIGTERM, verified via process
list showing zero orphans. `sourceManager`'s close-all loop completes
closing all sources even if one source's close() throws.

### 8. [M] Dead config flag `preserveAnsiText`

Declared/validated in `config.ts`/`types.ts` but has zero read-sites.
Three real call sites need it threaded through, not one: `detailText.ts:87`
(detail-pane rendering — corrected line ref), `LogList.tsx:55`, and
`LogList.tsx:63-70` (raw `lineText` render for the selected row and
empty-segment rows — a third site missed in earlier drafts). `LogList` and
`DetailPane.tsx` currently have no config prop — add it. "Strip" must still
run `parseAnsiText` (to correctly parse segment boundaries) and then
discard color/style attributes when rendering — not skip parsing entirely.
Document the flag in README's Config section (currently undocumented
anywhere).

**Acceptance:** `preserveAnsiText: false` strips ANSI styling from list-view
rows (including the selected row and empty-segment rows), and detail-pane
text view, in all cases preserving text content/segment structure. Default
(true/unset) unchanged from today. README documents the flag.

### 9. [S, audit] ADR-0001 re-audit — `src/state/*.ts`, `src/components/*.tsx`

`src/ink.tsx`, `src/ink-runtime.ts`, `src/main.tsx`, `src/replLauncher.tsx`,
`src/interactiveHelpers.tsx` were already read and found lean/log-cli-
specific in the original research pass. This item re-audits `src/state/
AppState.tsx`, `src/state/AppStateStore.ts`, `src/state/store.ts`, and each
file in `src/components/` for the same "copied shell, may be simplified
later" concern from ADR-0001.

**Acceptance:** a written finding for each file — either "log-cli-specific,
no action" or "generic leftover, needs simplification" with a specific
reason. Any file needing simplification becomes its own follow-up bead, not
solved in this item.

## Cross-Item Sequencing

- Items 2 and 3 both touch `urlSource.ts` — land as one combined PR/commit,
  not two independent diffs.
- Items 1 and 3 both touch `config.ts` (item 1: error handling in
  `readConfigFile`; item 3: new `urlConnectTimeoutMs` schema field) —
  sequence as separate reviewable commits within one PR (or two small PRs),
  not simultaneous unreviewed edits to the same file.
- All other items are independently shippable.

## Risks and Mitigations

- **Risk:** item 1's stderr warning could fire on the normal "no config
  file found" case. **Mitigation:** only warn on an actual parse/validation
  failure of a file that exists; the 3-tier discovery order's normal
  "nothing found" case stays silent (explicitly verified in acceptance).
- **Risk:** item 3's connect-timeout and the source's lifecycle abort could
  interfere with each other. **Mitigation:** `AbortSignal.any([...])`
  combining both signals, each independently able to cancel; `if (done)
  break` guard against post-finish entries.
- **Risk:** item 7's process-group kill could throw if the child already
  exited. **Mitigation:** explicit `ESRCH`/`undefined pid` guards, and
  per-source try/catch in the close-all loop so one failure doesn't skip
  the rest.
- **Risk:** item 2's status-channel change ripples into 4 source adapters +
  sourceManager + LogScreen + main.tsx + existing tests. **Mitigation:**
  scoped explicitly as [M] rather than [S]; flagged for further splitting
  if implementation reveals more complexity than expected.

## Verification Steps

- `bun test` after each item (or combined PR) — 0 new failures.
- Manual repro for items 3, 5, 7 (timing/signal/race behavior not easily
  unit-tested): TCP listener for item 3, unlink-mid-read for item 5,
  Ctrl+C + external SIGTERM against a pipeline `--cmd` for item 7.
- `bun run typecheck` after config schema changes (items 1, 3, 8).
- README updated for items 3 (`urlConnectTimeoutMs`) and 8
  (`preserveAnsiText`).

## Dependencies / Ordering

- No epic-level blocking dependency on log-cli-ssw or any other epic.
- Item 5's fix (if any) depends on its own investigate-first step completing.
- Item 7's fix depends on its own repro step completing.
- Items 2+3 sequenced together (same file); items 1+3 sequenced (same file,
  separate commits).
- Cross-epic pointer: `log-cli-ssw.5` (dist/cli.js git-tracking policy) is
  discovered-from this epic; no code dependency, just a routing link.

## ADR

**Decision:** Fix each of the 9 robustness gaps at its precise failure
point, with mechanisms corrected through 3 rounds of adversarial review
rather than the plausible-sounding first-draft mechanism for each (e.g.
`AbortSignal.timeout` for item 3, a bare `process.on('SIGINT')` for item 7,
a single call site for item 8 — all found wrong on inspection).

**Drivers:** each fix independently shippable; no over-engineering (no
generic retry/sandboxing frameworks); audit items produce decisions, not
reassurance.

**Alternatives considered:** a generic error-handling/retry framework
covering all sources at once (rejected — over-engineered relative to 9
independent, differently-shaped gaps); leaving item 2 at its original
narrow scope (rejected — the acceptance criterion was provably
unsatisfiable within that scope, per critic round 1).

**Why chosen:** each item's final mechanism is the smallest change that
survives adversarial review of the actual code paths involved, not the
smallest change that merely sounds plausible from a first read.

**Consequences:** items 1, 2, 3, 7, 8 grew from initial [S] estimates to
[M] once the real mechanisms were understood — genuine complexity, not
scope creep. The status channel (item 2) becomes a small but real
cross-cutting interface change. `preserveAnsiText` (item 8) touches 3 call
sites instead of 1.

**Follow-ups:** item 2 may warrant its own split if implementation reveals
further complexity; item 5's fix (if any) is scoped only after its repro
step; `log-cli-ssw.5` (dist/cli.js tracking policy) routes here for a
decision.

## Changelog (consensus rounds)

- **v1 → v2** (Architect round 1): item 3's `AbortSignal.timeout` would
  kill healthy long-lived streams (wrong primitive); item 2's acceptance
  assumed a `SummaryOutput.error` field that doesn't exist; item 7 targeted
  the wrong cleanup owner (`dispose()` never touched sources); item 8
  needed threading into a function with no config param; item 5 likely
  near-zero value (fs errors already carry the path); item 1 needed an
  explicit-vs-discovery-tier split.
- **v2 → v3** (Critic round 1): item 3's timeout would collide with the
  existing abort guard and hang the source forever (CRITICAL); item 2's
  "reuse existing mechanism" was a dead end (`onStatus` is a no-op) — needed
  real scope; item 1 didn't say where hard-fail happens or how JSON vs zod
  errors are distinguished; item 3's 10000ms default exceeded
  `maxSummaryWaitMs=5000`; item 7's `SIGTERM`-only-to-direct-pid misses
  grandchildren in shell pipelines; item 8 missed a second call site
  (`LogList.tsx`); item 5 rescoped to investigate-first (likely silent EOF,
  not a missing-path-context error).
- **v3 → v4 (final)** (Architect round 2): item 3's fetch abort-signal
  handling would break `close()` or leak sockets depending on
  implementation — needed `AbortSignal.any([...])` plus a `done` guard, and
  "connect" redefined as headers-resolved not first-byte; item 2's status
  channel needed a real `{sourceId, kind, message}` shape, not
  string-sniffing, and the interactive acceptance criterion was vacuous
  against a 50ms-refreshing status line; item 1 missed a second
  `loadConfig` call site (`main.tsx:29`, the runSummary/piped path) and
  needed to throw rather than `process.exit` (would kill `bun test`); item
  7's Ink `exitOnCtrlC` means Ctrl+C never raises a real `SIGINT` — the
  cleanup path is Ink's unmount effect, with a *separate* new `SIGTERM`
  handler for external kills; item 8 missed a third strip site
  (`LogList.tsx:63-70`); item 6's `new URL()` throws on invalid input,
  needs a try/catch. Capped at round 3 — fixes applied directly rather than
  triggering a 4th full review round.
