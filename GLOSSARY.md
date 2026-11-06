# log

`log` is an interactive terminal viewer for mixed web and server logs. It reads
JSON lines, plain text lines, and prefixed JSON from one or more sources. It
shows the lines in a navigable list with a detail pane, and it can also print a
headless summary.

## Language

### Inputs

**Source**:
One input that `log` reads lines from: a file, stdin, a URL stream, or a
spawned command. Each source has its own tab, entries, and view settings.
_Avoid_: input, feed, stream (except in "URL stream")

**Source kind**:
The category of a **Source**: `file`, `stdin`, `url`, or `cmd`.
_Avoid_: source type

**Named pipe**:
A file **Source** that is a FIFO. It is read as a continuous stream, not as a
finished file.
_Avoid_: FIFO source, pipe file

**Source tab**:
The per-**Source** view the user cycles through with `Tab` and `Shift+Tab`.
_Avoid_: pane, buffer

### Entries

**Log entry**:
One input line, normalized into a single shape whatever its original format.
_Avoid_: line, row, record, event

**Entry kind**:
Whether a **Log entry** parsed as structured JSON (`json`) or stayed plain text
(`text`).
_Avoid_: format, line type

**Prefixed JSON**:
A line of the form `PREFIX | {...}`: a label, then ` | `, then a JSON object or
array. Example: `api-1 | {"level":"warn",...}`.
_Avoid_: piped JSON, tagged JSON

**Prefix**:
The label in front of ` | ` in a **Prefixed JSON** line. It is usually a pod or
service name.
_Avoid_: pod, service, tag

**Raw line**:
The exact text of a **Log entry** as it was read, before any extraction.
_Avoid_: original, source line

**Message**:
The human-readable text of a **Log entry**. For JSON entries it comes from the
`msg` or `message` field, after **Placeholder** substitution. For text entries
it is the line itself.
_Avoid_: msg, body

**Level**:
The severity of a **Log entry**. It comes from the `level` or `severity` field,
optionally remapped by the **Level map**.
_Avoid_: severity (only as an input field name), priority

**Normalized level**:
One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `unknown`. Text
entries are always `unknown`.
_Avoid_: canonical level

**Field path**:
A dotted address into a JSON **Log entry**. Examples: `request.method`,
`span.[].name`, `span.[1].name`, `.trace_id?`.
_Avoid_: key path, selector, JSON path

**Virtual field**:
A field available on every **Log entry**, text entries included: `message`,
`level`, `prefix`, `raw`.
_Avoid_: synthetic field, computed field

### Views and navigation

**Merged view**:
A single list of **Log entries** from all **Sources**, ordered by timestamp.
It is turned on with `M` or `--merge`.
_Avoid_: merge mode, merged source, "all sources"

**Merge ignored**:
The state where `--merge` was requested but only one **Source** exists. The
session falls back to the normal view and says so.
_Avoid_: merge failed, merge disabled

**Source marker**:
The short tag (up to 4 characters, e.g. `API1`) in front of each row in the
**Merged view**. It shows which **Source** the row came from.
_Avoid_: source abbreviation, source badge

**Source boundary**:
The label row in the **Merged view** where consecutive entries switch from one
**Source** to another.
_Avoid_: separator, divider

**Follow mode**:
A setting that keeps the selection on the newest **Log entry** as new lines
arrive. It is on by default; `--no-follow` turns it off.
_Avoid_: tail, auto-scroll, live mode

**Reverse ordering**:
Showing **Log entries** newest first. It is toggled with `R` or `--reverse`.
_Avoid_: descending, flipped

**Focus mode**:
The input mode that owns the keyboard at a given moment: `list`, `detail`,
`filter`, `query`, `search`, or `help`.
_Avoid_: screen, panel, state

**Detail pane**:
The right-hand pane that shows the selected **Log entry** in full.
_Avoid_: inspector, preview pane

**Detail mode**:
How the **Detail pane** renders a JSON entry: `tree` (the foldable **JSON
tree**) or `raw` (the **Raw line** as text). It is toggled with `m`.
_Avoid_: view mode, display mode

**JSON tree**:
The foldable rendering of a JSON **Log entry** in the **Detail pane**. `Space`
folds or unfolds a node.
_Avoid_: object view, outline

**Detail search**:
A search inside the **Detail pane** of the selected entry, started with `/`.
`n` and `N` step through the matches.
_Avoid_: find, list search

**Yank**:
Copying the value, **Field path**, or key at the cursor in the **JSON tree** to
the clipboard (`yy`, `yp`, `yk`).
_Avoid_: copy (except when you mean the clipboard write itself), grab

### Narrowing

**Filter**:
An expression in the filter language, entered with `F` or `--filter`, that
hides non-matching **Log entries**.
_Avoid_: search, where clause

**Legacy filter**:
The older shorthand **Filter** syntax, such as `level:error` or a bare
substring. It is used when the input does not parse as a full **Filter**
expression.
_Avoid_: simple filter, quick filter

**Query**:
An expression in the separate query language (inspired by `hl`), entered with
`Q` or `--query`, that hides non-matching **Log entries**.
_Avoid_: filter, search

**Query suggestion**:
A completion offered in the query editor. It is built from default snippets and
from field names seen in the current entries.
_Avoid_: autocomplete, hint

**Quick level filter**:
The set of **Normalized levels** toggled with keys `1` to `6`. Only entries at
a selected level stay visible.
_Avoid_: level toggle, severity filter

### Ingest and capacity

**Ingest batch**:
The group of new **Log entries** from one **Source** that is applied to the
view at once, every `batchMs` milliseconds.
_Avoid_: chunk (that word means raw byte buffers during line splitting), flush

**Max entries**:
The configured cap (`maxEntries`) on how many **Log entries** one **Source**
keeps. Beyond it, the oldest entries are evicted.
_Avoid_: buffer size, history limit

**Dropped count**:
The number of **Log entries** a **Source** has evicted for exceeding **Max
entries**. It is shown as `dropped=` in the header.
_Avoid_: lost lines, overflow

### Rendering and config

**Main-line template**:
The Handlebars template (`mainLineTemplate`) that renders each **Log entry**'s
row in the list.
_Avoid_: row template, line format

**Level map**:
The config mapping (`levelMap`) from raw **Level** values, such as `"30"`, to
**Normalized levels**.
_Avoid_: level aliases, severity map

**Placeholder**:
A token in a **Message**, in the configured `placeholderFormat` (e.g.
`#{key}`), that is replaced with a value from the **Context path** object.
_Avoid_: variable, interpolation

**Context path**:
The **Field path** (`contextPath`, e.g. `extra_data`) to the JSON object that
supplies **Placeholder** values.
_Avoid_: context object, extra data

### Headless output

**Headless summary**:
Non-interactive output, from `--summary-json` or `--summary-text`. It reports
**Log entry** counts per **Source** (total, json, text) after any **Filter**
and **Query** are applied. No TUI is shown.
_Avoid_: report, summary mode, export

## Relationships

- A **Source** has exactly one **Source kind**. A **Named pipe** is a `file`
  **Source**.
- A **Source** produces many **Log entries**. Each **Log entry** belongs to
  exactly one **Source**.
- Each **Source** has one **Source tab**. It keeps at most **Max entries** and
  counts the rest in its **Dropped count**.
- A **Log entry** has exactly one **Entry kind**, one **Raw line**, one
  **Message**, and one **Normalized level**.
- A **Log entry** has a **Prefix** only if it was **Prefixed JSON**.
- The **Merged view** combines the **Log entries** of two or more **Sources**.
  It orders them by timestamp, then by line number. Entries without a timestamp
  sort after timestamped entries in normal order. With one **Source** the
  result is **Merge ignored**.
- In the **Merged view**, every row carries a **Source marker**. A **Source
  boundary** appears wherever the **Source** changes.
- Each **Source tab** and the **Merged view** keep their own **Filter**,
  **Query**, **Quick level filter**, **Follow mode**, **Reverse ordering**,
  selection, and **JSON tree** fold state.
- A **Log entry** is visible only if it matches the **Filter**, the **Query**,
  and the **Quick level filter**.
- The **Detail pane** shows the selected **Log entry** in one **Detail mode**.
  The **JSON tree** and **Yank** apply only to `json` entries in `tree` mode.
- The **Level map** runs before level normalization. **Placeholders** are
  resolved at parse time, from the **Context path** object of the same entry.
- A **Headless summary** applies the same **Filter** and **Query** semantics
  as the TUI.

## Flagged ambiguities

- **Filter vs Query.** These are two separate languages that narrow the same
  list, and both apply at the same time. The same spelling means different
  things in each:
  - `like` is a wildcard match in a **Filter** and a substring match in a
    **Query**.
  - Regex is `~~= "re"` in a **Filter** and `=~ /re/` in a **Query**.
  - `exists(.user.id)` uses a leading dot in a **Filter**; `exists(user.id)`
    does not in a **Query**.
  - An unparseable **Filter** falls back to the **Legacy filter**. An
    unparseable **Query** has no fallback.

  Unresolved. The backlog spec lists query-language parity as an open item.
- **"detail mode"** means two things in `README.md` and ADR 0004: the `detail`
  **Focus mode** (cursor inside the **Detail pane**), and the `tree`/`raw`
  **Detail mode**. Suggested here: "detail mode" means `tree`/`raw` only. For
  the other meaning, say "focus in the **Detail pane**".
- **"summary"** has three meanings in the code: the **Headless summary**
  (`src/lib/summary.ts`), the header entry-count line
  (`src/lib/headerSummary.ts`), and the **Merged view** header label
  `merged(n): ...` (`formatMergedSourceSummary`). Suggested here: "summary"
  alone means the **Headless summary**.
- **"marker"** names both the **Source marker** and the footer's
  "merged session markers" (`srcs:<n>`, `mflt:`, `mqry:`) in `README.md`.
  Suggested here: **Source marker** keeps the word. Call the footer items
  "footer state".
- **"merge" / "merged source".** The flag is `--merge`. The backlog spec says
  "merge mode". The code builds the **Merged view** as a pseudo-source (id
  `merged`, label `all sources`, kind `file`). Suggested: say **Merged view**.
  It is not a **Source** and has no real **Source kind**.
- **message / preview / text / raw.** A **Log entry** has four similar string
  fields. For text entries, `message` is cut to 140 characters and `preview`
  is the full line. For JSON entries, `message` and `preview` are the same, and
  `text` equals `raw`. Only **Message** and **Raw line** are domain terms.
  "preview" and "text" are implementation fields.
- **"normalized" level is not always normalized.** Unrecognized raw values
  (e.g. `notice`) pass through unchanged, because the type is
  `NormalizedLevel | string`. Only case folding and `warning` to `warn` are
  applied. Unresolved. Do not assume a **Log entry**'s level is in the
  seven-value set.
- **"repl" and prompt "query".** `src/replLauncher.tsx` (`launchRepl`) and
  `src/utils/handlePromptSubmit.ts` (submission kinds `command` and `query`)
  come from the copied starter shell (ADR 0001). `log` has no REPL, and that
  "query" is not a **Query**. `handlePromptSubmit` has no importers.
