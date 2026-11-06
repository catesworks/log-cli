# Coding Standards

This document records the style and conventions this repository actually
follows. Each rule comes from the code and config in this repo: `src/`,
`tests/`, `bin/log`, `examples/`, `eslint.config.js`, `prettier.config.js`,
`tsconfig.json`, `turbo.json`, `.github/workflows/`, `docs/ONBOARDING.md`, and
`docs/adr/`. When this document and the code disagree, the code is the
reference. Fix this document.

Rules marked **(aspirational)** are not followed today. Each one says so and
gives the current state.

Scope: languages and files present in the repo.

| Language / format      | Where                                                | Share         |
| ---------------------- | ---------------------------------------------------- | ------------- |
| TypeScript / TSX       | `src/**` (59 files), `tests/**` (28 files)           | almost all    |
| JavaScript (ESM)       | `eslint.config.js`, `prettier.config.js`, `examples/high-volume-generator.mjs` | 3 files |
| Bash                   | `bin/log`                                            | 1 file        |
| Markdown               | `README.md`, `docs/**`, `.internal/specs/**`         | docs          |
| YAML / JSON            | `.github/workflows/*.yml`, `knowledge-base/config.yml`, `package.json`, `tsconfig.json`, `turbo.json`, `.changeset/config.json` | config |

Runtime and toolchain: Bun (`packageManager: bun@1.4.2`), TypeScript 5.8
(`strict: true`), React 18 + Ink 5 for the TUI, `zod` for config validation,
`bun:test` for tests, Turborepo for task orchestration, Changesets for
versioning.

## 1. General Code Style

- Favor clarity over brevity. Most `src/lib/*` modules are small, single-purpose
  files: `src/lib/merge.ts`, `src/lib/ringBuffer.ts`, `src/utils/id.ts`.
- Keep parsing and ingest logic out of UI code. These are the architecture rules
  in `docs/ONBOARDING.md`:
  - Keep ingest and parsing under `src/lib/`.
  - Keep UI state in the external store (`src/state/store.ts`,
    `src/state/AppStateStore.ts`).
  - Keep the list virtualized (`src/hooks/useVirtualWindow.ts`,
    `src/lib/listWindow.ts`).
  - Keep updates batched for high-volume streams. `src/lib/sourceManager.ts`
    flushes every `config.batchMs`.
  - Do not bypass the source manager to push lines into state directly.
  - Keep advanced filtering in `src/lib/filter.ts` and `src/lib/query.ts`, not
    inline in the screen.
  - Keep detail-pane copy and search behavior in reusable helpers under
    `src/lib/` (`src/lib/detailActions.ts`, `src/lib/textSearch.ts`).
  - `src/screens/LogScreen.tsx` orchestrates input modes. It does not do
    low-level parsing.
- Write pure functions that take state and return new state. Examples:
  `applyEntryBatch` in `src/lib/ingestState.ts`, `createMergedSourceState` in
  `src/lib/mergedSource.ts`, and `updateCurrentSource` in
  `src/screens/LogScreen.tsx`. Spread to copy (`{ ...state, sources: ... }`).
  Do not mutate state in place.
- Use one normalized `LogEntry` type for every input kind (ADR 0002,
  `src/types.ts`). Put all shared domain types in `src/types.ts`.
- Remove unused code. **(Aspirational in part.)**
  `src/utils/handlePromptSubmit.ts` has no importers. It is starter-shell
  residue (ADR 0001). The `preserveAnsiText` config key has no read sites
  (backlog spec, Epic 5 item 8).

## 2. Naming Conventions

| Item                         | Convention                     | Example (real)                                                  |
| ---------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Variables, parameters        | `camelCase`                    | `lineNumber`, `droppedCount`, `mergedEntries`                   |
| Functions                    | `camelCase` verb-first         | `parseLine`, `mergeEntriesByTime`, `startFileSource`            |
| React components             | `PascalCase` function          | `LogScreen`, `DetailPane`, `FilterBar`                          |
| Hooks                        | `useX`                         | `useTerminalSize`, `useVirtualWindow`                           |
| Types                        | `PascalCase` `type` alias      | `LogEntry`, `SourceSpec`, `NormalizedLevel`                     |
| String-literal union members | lowercase                      | `"json" \| "text"`, `"file" \| "stdin" \| "url" \| "cmd"`       |
| Module-level constants       | `UPPER_SNAKE_CASE`             | `TIME_FIELDS`, `OPTION_SPECS`, `COMPARISON_OPERATORS`, `DEFAULT_CONFIG` |
| Classes                      | `PascalCase`                   | `RingBuffer` (the only class)                                   |
| Unused bindings              | `_` prefix                     | enforced by ESLint `argsIgnorePattern: '^_'`                    |
| `src/lib`, `src/utils` files | `camelCase.ts`                 | `parseLine.ts`, `queryAutocomplete.ts`                          |
| Component / screen files     | `PascalCase.tsx`               | `src/components/LogList.tsx`, `src/screens/LogScreen.tsx`       |
| Test files                   | `<module>.test.ts(x)`          | `tests/parseLine.test.ts`, `tests/mergedList.test.tsx`          |
| ADRs                         | `NNNN-kebab-title.md`          | `docs/adr/0003-ring-buffer-and-batched-ui-updates.md`           |

Function name prefixes carry meaning. Reuse them:

- `build*` returns a derived value or predicate: `buildFilter`, `buildQuery`, `buildSummary`.
- `create*` returns a new object or handle: `createStore`, `createId`, `createSourceManagerHarness`.
- `start*` begins I/O and returns a handle: `startFileSource`, `startCmdSource`, `startSourceManager`.
- `format*` returns a display string: `formatMergedSourceSummary`, `formatEntryCountSummary`.
- `derive*`, `resolve*`, `validate*`, `normalize*`, and `apply*` are also used.
  See `src/lib/merge.ts`, `src/lib/sources.ts`, `src/lib/config.ts`, and
  `src/lib/ingestState.ts`.

Outliers: `src/ink-runtime.ts` is the only kebab-case source file. Every other
`src` file follows the camelCase or PascalCase rule.

## 3. Formatting Rules

These rules describe the code as it is written today. For the conflict with
the configured Prettier settings, see "Inconsistencies found" below.

- Indentation: **2 spaces**, no tabs. No file has tabs. No line has an odd
  indent.
- Quotes: **double quotes**. Use single quotes only when the string contains
  double quotes, e.g. `'{"level":"info"}'` fixtures in `tests/parseLine.test.ts`
  and snippets like `'exists(user.id)'` in `src/lib/queryAutocomplete.ts`.
- Semicolons: always.
- Trailing commas: on multi-line argument, parameter, array, and object lists.
  See `parseLine(...)` in `src/lib/parseLine.ts`.
- Braces: K&R style (opening brace on the same line). Single-statement guard
  clauses may go on one line without braces:

  ```ts
  if (!raw) return "unknown";
  if (done) return;
  if (entries.length === 0) continue;
  ```

- Early returns are the norm for guard conditions. See `buildFilter` in
  `src/lib/filter.ts` and `deriveMergedSelectionIndex` in `src/lib/merge.ts`.
- Numeric literals use `_` separators when long: `10_000_000_000` in
  `src/lib/parseLine.ts`.
- Encoding: UTF-8. End files with a newline (all files do). Line endings are LF.
- Line length: target 100 (`printWidth: 100` in `@cogs/prettier-config`).
  **(Aspirational.)** 54 lines in 25 files exceed 100 characters today. The
  longest is 230 characters, in `src/components/DetailPane.tsx`.

### Imports

- Use the `node:` prefix for Node built-ins. All built-in imports do:
  `import path from "node:path"`, `import { spawn } from "node:child_process"`.
- Use `import type` for type-only imports. ESLint enforces this
  (`@typescript-eslint/consistent-type-imports`, `prefer: 'type-imports'`).
  There are 44 `import type` statements, e.g. `import type { LogEntry } from "../types"`.
- Order imports: external and `node:` imports first, then relative imports.
  See `src/lib/config.ts` and `src/lib/source/cmdSource.ts`.
- Relative import extensions:
  - `src/**`: **no extension** (`from "./parseLine"`). 119 of 119.
  - `tests/**`: **explicit `.ts`/`.tsx`** (`from "../src/lib/parseLine.ts"`).
    40 of 40. `tsconfig.json` sets `allowImportingTsExtensions` and allows both.
- Use named exports only. Source and test files have zero `export default`.
  Only the two config files (`eslint.config.js`, `prettier.config.js`) use a
  default export, because their tools require it.

### TypeScript

- Use `type` aliases, not `interface`. There are 41 `type` declarations and 0
  `interface` declarations.
- Model variants as discriminated unions with a `type` tag. See `FilterExpr`
  and `Token` in `src/lib/filter.ts`, and `Expr` in `src/lib/query.ts`.
- Give every exported function an explicit return type. All 62 exported
  functions in `src` have one, although ESLint does not require it
  (`explicit-function-return-type: off`). Inner closures may infer.
- Use `unknown` for untrusted JSON (`jsonValue?: unknown` in `src/types.ts`)
  and narrow with `typeof` checks. There is no `any` in `src` or `tests`.
- Use `Boolean(x)` for coercion, never `!!x`. ESLint enforces this
  (`no-implicit-coercion`). `src` has 16 `Boolean(` calls and 0 `!!`.
- Use `===` and `!==`. ESLint warns on `==` (`eqeqeq`, `null: 'ignore'`).
- Avoid non-null assertions (`!`). ESLint warns on them. A few remain:
  `source.command!` in `src/lib/source/cmdSource.ts` and
  `buffers.get(sourceId)!` in `src/lib/sourceManager.ts`.
- Prefer `??` and `?.`. ESLint warns via `prefer-nullish-coalescing` and
  `prefer-optional-chain`. Common forms: `options?.levelMap ?? {}` and
  `entry.timestampMs ?? Number.MAX_SAFE_INTEGER`.
- Validate external config with `zod` at the boundary, then derive defaults
  from the schema. See `configSchema` and
  `DEFAULT_CONFIG = configSchema.parse({})` in `src/lib/config.ts`.

### Functions and React

- Write top-level functions as `function` declarations (137). Write closures
  inside a function as `const x = (...) => {...}`. See `flush` and `onEntries`
  in `src/lib/sourceManager.ts`. No module-level `const f = () =>`
  declarations exist.
- Type component props inline: `export function DetailPane(props: { ... })`.
  11 of 12 components do this. Do not use `React.FC`.
- Keep reusable formatting and layout logic in `src/lib/` (`layout.ts`,
  `headerSummary.ts`, `detailText.ts`). Components call these helpers.

### Bash (`bin/log`)

`bin/log` follows the Google Shell Style Guide where they overlap:

- Use `#!/usr/bin/env bash` and `set -euo pipefail`.
- Brace and quote every expansion (`"${SCRIPT_DIR}"`). Forward arguments with
  `"$@"`.
- `exec` the final command so signals reach `bun` directly.
- Name script-level variables in `UPPER_SNAKE_CASE` (`SCRIPT_DIR`,
  `PROJECT_ROOT`).

The Google guide recommends `#!/bin/bash`. The repo uses `#!/usr/bin/env bash`
for portability. Keep the repo form.

### JavaScript (`.js`, `.mjs`)

Same formatting as the TypeScript code: ESM `import`, double quotes,
semicolons, 2-space indent. See `examples/high-volume-generator.mjs`.

### Markdown

- Use ATX headings (`#`, `##`).
- Use `-` list markers. All docs use them; none use `*`.
- Use fenced code blocks with a language tag (`bash`, `jsonc`, `handlebars`).
  See `README.md`.
- ADRs (`docs/adr/`) use the sections `# ADR NNNN: Title`, `## Status`,
  `## Decision`, and `## Consequences`.
- Wrap prose at about 80 columns. **(Loose.)** Some lines in `README.md` and
  `docs/ONBOARDING.md` exceed this.

## 4. Comments & Documentation

- Comments are rare: 8 line comments in `src` and `tests`, and no JSDoc
  blocks. Write a comment only to explain *why*. Example from
  `src/lib/source/fileSource.ts`:

  ```ts
  // Named pipes (FIFOs) are treated as continuous streams: no batching for
  // low latency, and "stream ended" rather than "Loaded" on completion.
  ```

- Every `eslint-disable` must name one rule and give a reason after `--`.
  ESLint reports unused disable directives (`reportUnusedDisableDirectives`).
  Example from `src/lib/ansi.ts`:

  ```ts
  // eslint-disable-next-line no-control-regex -- \u001b is the literal ANSI SGR escape byte being parsed
  ```

- `@ts-ignore` and `@ts-expect-error` need a description of 10 or more
  characters (`@typescript-eslint/ban-ts-comment`). Neither is used today.
- Config files may carry long rationale comments, e.g. `.gitignore` and
  `.github/workflows/ci.yml`. Use this for non-obvious repo decisions.
- Record architecture decisions as ADRs in `docs/adr/`. Keep the module map in
  `docs/ONBOARDING.md` current when you add a feature boundary.
- No `TODO` or `FIXME` tags exist in code. Track follow-up work in Beads
  (`.beads/`, `bd`), not in comments.

## 5. Error Handling

The repo uses these patterns. Match them:

- **Parsers throw.** Expression parsers throw `new Error(...)` with a short
  lowercase message: `"unterminated string literal"`, `"expected value"`
  (`src/lib/filter.ts`, `src/lib/query.ts`, `src/lib/pathValue.ts`).
- **Callers degrade.** `buildFilter` catches a parse error and falls back to
  the legacy shorthand filter (`buildLegacyFilter`). `parseLine` treats
  unparseable JSON as a text entry. `readConfigFile` in `src/lib/config.ts`
  returns `null`, so defaults apply. Use bare `catch {}` (no binding) when the
  error value is not used. ESLint allows empty catch blocks
  (`allowEmptyCatch: true`).
- **Validation returns a message.** `validateSources` in `src/lib/sources.ts`
  returns `string | null`, for example `` `File not found: ${source.filePath}` ``.
- **Runtime source failures go to the status line**, through
  `events.onStatus(message)`. They are not thrown. See `src/lib/source/*.ts`.
- **Unknown errors:** format them with
  `error instanceof Error ? error.message : String(error)`. See `copyValue` in
  `src/screens/LogScreen.tsx`.
- Never use `console.log` or `console.error` in `src`. There are zero.
  `process.exit` appears once, in `src/interactiveHelpers.tsx`.
- Clean up resources through returned handles: `SourceHandle.close()`, and the
  stop function returned by `startSourceManager` (it clears the interval, then
  flushes).

Known gaps, from `.internal/specs/2026-09-06-remaining-backlog-design.md`,
Epic 5:

- Config parse failures are silent.
- The URL source ignores HTTP status.
- `buildQuery` has no fallback. An invalid query throws, unlike `buildFilter`.

## 6. Commit & Review Practices

### Commits

- Use Conventional Commits with a lowercase type and an optional scope.
  27 of 32 commits do:

  ```text
  feat: support named pipes (FIFOs) as streaming file sources
  fix(tests): restore missing e2e fixtures, re-add bun test to CI
  chore(deps): bump zod ^4.1.12 -> ^4.5.2 (#2)
  ```

  Types in use: `feat`, `fix`, `chore`, `docs`, `ci`.
- One logical change per commit, in line with the Git style guide. The repo
  does not follow that guide's "capitalized summary" rule. Keep the lowercase
  Conventional Commits form.
- Outliers (5): `add prime`, `update gitignore`, `bd init: initialize beads
  issue tracking`, `choer: update bun lock` (typo), and `first commit`.

### Versioning and release

- Changesets (`.changeset/config.json`, `access: restricted`). Run
  `bun run changeset` for user-facing changes. `.github/workflows/version.yml`
  opens a `chore: version packages` PR on push to `main`.
- `.github/workflows/release-cli.yml` is manual only (`workflow_dispatch`). It
  builds `bun build --compile` binaries as artifacts.

### Reviews and CI

- `.github/workflows/ci.yml` runs on every PR and every push to `main`:
  `turbo run lint`, `typecheck`, `test`, and `build` (`--affected` on PRs).
  All four must pass.
- `knowledge-base/config.yml` defines "tested" for agent-ops as
  `bun test && tsc --noEmit`.
- Work items are tracked with Beads (`.beads/`).

## 7. Tests

- Framework: `bun:test`. Use `describe` blocks with `test(...)` (93 calls; `it`
  is never used). Every test file has at least one `describe`.
- Location: a flat `tests/` directory. Tests are not colocated. Name each file
  after the module it covers (`tests/ringBuffer.test.ts` covers
  `src/lib/ringBuffer.ts`).
- Import the module under test with an explicit extension:
  `import { parseLine } from "../src/lib/parseLine.ts"`.
- Prefer inline literal inputs and direct `expect(...).toBe(...)` assertions
  over shared fixtures. See `tests/parseLine.test.ts`.
- End-to-end: `tests/e2e-smoke.test.ts` runs the real CLI against committed
  fixtures `examples/mixed.log` and `examples/mixed-2.log`. Those fixtures are
  kept by a `!examples/*.log` exception in `.gitignore`. Do not remove it.
- Run locally:

  ```bash
  bun run typecheck
  bun test
  bun run test:e2e
  bun run build
  ```

  `turbo.json` makes `test` depend on `build`.
- Keep tests deterministic. **(Aspirational guidance.)** `createId` in
  `src/utils/id.ts` uses a module-level counter, so exact entry ids depend on
  call order. No test asserts on them today.

## 8. Lint & Format Tooling

- ESLint: `eslint.config.js` uses `@cogs/eslint-config` (`^0.2.10`), with
  typed linting via `tsconfig.json`. That config includes
  `typescript-eslint` recommended, `react` and `react-hooks`
  (`exhaustive-deps: error`), `import/*` hygiene, and `eslint-config-prettier`.
  Run it with `bun run lint` or `bun run lint:fix`.
- Prettier: `prettier.config.js` re-exports `@cogs/prettier-config`. In
  version 0.2.0 that config sets `semi: true`, `singleQuote: true`,
  `trailingComma: 'all'`, `printWidth: 100`, `tabWidth: 2`,
  `arrowParens: 'always'`, and `endOfLine: 'lf'`. There is no `format` script,
  and CI does not run Prettier.

### Inconsistencies found (reported, not fixed)

| Category                 | Majority (actual code)                    | Outliers / conflict                                                                  |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| String quotes            | double: 228 of 228 imports, about 2,077 string literals | `prettier.config.js` via `@cogs/prettier-config` says `singleQuote: true`. Prettier has never been applied. |
| Single-param arrow parens | bare `x => ...`: about 158                | about 54 parenthesized `(x) => ...`. Prettier config says `arrowParens: 'always'`.   |
| Line length              | at most 100 characters                    | 54 lines in 25 files exceed 100 (max 230, `src/components/DetailPane.tsx`)          |
| Relative import extension | `src`: none (119 of 119)                  | `tests`: `.ts`/`.tsx` (40 of 40). Each directory is consistent internally; they differ from each other. |
| React import             | `import React from "react"` (13 files)    | `import type React` (2 files), hooks-only imports (2 files). `jsx: react-jsx` does not need the default import. |
| File naming in `src`     | camelCase or PascalCase                   | `src/ink-runtime.ts` (kebab-case)                                                    |
| Parse-error handling     | `buildFilter` falls back                  | `buildQuery` throws, with no fallback                                                |
| Commit messages          | Conventional Commits (27)                 | 5 non-conforming (listed in section 6)                                               |

Decision needed: either run Prettier once across the repo and add a `format`
check, or override `singleQuote` and `arrowParens` in `prettier.config.js` to
match the code. Running `prettier --write .` with the current config would
rewrite nearly every source file.

## 9. Sources Consulted

Style guides fetched for context (fetchStyleURL):

- TypeScript Do's and Don'ts: <https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html>.
  The repo already follows it: primitive types (not `String`/`Number`), no
  `any`, `unknown` for untyped input, and `void` callbacks
  (`SourceEvents` in `src/lib/source/types.ts`).
- Node.js Style Guide: <https://github.com/felixge/node-style-guide>. The repo
  agrees on 2 spaces, semicolons, same-line braces, `===`, early returns, and
  `UPPER_SNAKE` constants. It differs on quotes (the repo uses double) and line
  length (the repo targets 100, not 80).
- Google Shell Style Guide: <https://google.github.io/styleguide/shellguide.html>.
- Markdown Style Guide: <https://cirosantilli.com/markdown-style-guide/>.
- Git Style Guide: <https://github.com/agis/git-style-guide>.
- Skipped: the W3Schools JavaScript conventions page returned HTTP 403.

## 10. Changes to This Guide

Style evolves. Update this document in the same PR that changes a convention,
and update any counts above that the change affects. Record convention changes
with architectural weight as an ADR in `docs/adr/`.
