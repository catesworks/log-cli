# Follow-ups: 2026-11-14 backlog sweep

Shipped in this sweep:

- PR #5: ssw.1–ssw.4, 6nh.1, 6nh.3, nm2.4 (CI and test-suite health)
- PR #6: nm2.1, nm2.6, w0b.1, w0b.2, w0b.9 (startup robustness and docs)

## Blocked on the user

| Bead | What is needed |
| --- | --- |
| log-cli-5vk.1 | Choose a publish posture for ADR-0005. Commit 195da5c already put log-cli on option A (private) plus C (binaries from `release-cli.yml`, artifacts only, no GitHub Release). Confirm A+C, or pick B (npm). |
| log-cli-ssw.5 | Decide whether `dist/cli.js` stays tracked. `.gitignore` lists `dist/`, but `dist/cli.js` is still tracked, and every `bun run build` rewrites it. Several e2e tests run the tracked copy. |
| log-cli-5vk.3 | Write the release-process docs. Blocked on 5vk.1. Changesets (version-only) already exists, see `.changeset/README.md`. |

## Blocked on work

| Bead | State |
| --- | --- |
| log-cli-ssw.4 | Code is in PR #5. Acceptance still needs 3 consecutive green CI runs. |
| log-cli-5vk.2 | `build:exe` has to be verified on macOS and on Linux. No Linux host was used in this sweep. |
| log-cli-nm2.2, nm2.3, nm2.7 | URL error surfacing, URL connect timeout, process-group shutdown. Not started. Each changes runtime behavior and needs its own PR. |
| log-cli-nm2.5, nm2.8, nm2.9 | TOCTOU repro, preserveAnsiText wiring, ADR-0001 re-audit. Not started. |
| log-cli-6nh.2, 6nh.4 | Source-adapter unit tests, render-harness test. Not started. |
| log-cli-w0b.3–w0b.8 | Feature enhancements (P3/P4). Not started. |
| log-cli-klh | Query/filter convergence epic. Has no child beads yet. w0b.1 documented the current divergence in the README. |
