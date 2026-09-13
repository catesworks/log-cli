# log

**Topics:** `cli` `tui`

`log` is an interactive TUI for mixed web/server logs:

- JSON lines most of the time
- plain text lines sometimes
- prefixed JSON like `POD | {"level":"info","message":"..."}` as well

It accepts files, stdin, a streaming URL, or a spawned command.

## Features

- Left pane virtualized log list with follow mode
- Right pane JSON tree or raw text detail view
- Tabs for multiple file sources
- Merged view across all sources
- Ring buffer with configurable max size
- Batched ingest updates for fast streams
- Reverse ordering toggle
- Advanced filter mode with nested-field expressions and boolean logic
- Query mode with boolean expressions inspired by `hl`
- Handlebars main-line templates with fblog-style helpers
- Detail-pane search and copy actions inspired by `jless`
- Basic ANSI color preservation for text detail
- Help modal
- Summary JSON / text mode for automation and smoke testing

## Run

```bash
bun install
bun run src/cli.ts examples/mixed.log
```

When passing CLI flags to `bun run src/cli.ts`, prefer inserting `--` before
the tool arguments:

```bash
bun run src/cli.ts -- examples/mixed.log --merge --filter 'level = "error"'
```

For day-to-day use, the wrapper binary is the least surprising:

```bash
./bin/log examples/mixed.log --merge
```

## Quick how-tos

Open a local file:

```bash
bun run src/cli.ts examples/mixed.log
```

Tail command output:

```bash
./bin/log --cmd "docker logs -f my-container 2>&1"
```

Read a URL stream:

```bash
./bin/log --url https://example.com/logs
```

Summarize mixed input as JSON:

```bash
bun run src/cli.ts examples/mixed.log --summary-json
```

Summarize piped stdin as text:

```bash
cat examples/mixed.log | bun run src/cli.ts --summary-text
```

Stress-test command ingestion:

```bash
bun run build
bun run stress:cmd
```

## Input sources

Files:

```bash
bun run src/cli.ts server.log access.log
```

Files in merged view from startup:

```bash
./bin/log server.log access.log --merge
```

If `--merge` is used with only one source, the session falls back to normal mode
and reports that merge was ignored in both the startup status line and the live
footer state.

Files in merged view with explicit reverse and no-follow startup:

```bash
./bin/log server.log access.log --merge --reverse --no-follow
```

Files in merged view with startup filter and query:

```bash
./bin/log server.log access.log --merge --filter 'request.method = "POST"' --query 'level = "error"'
```

Files in merged view with startup filter/query and zero-follow reverse mode:

```bash
./bin/log server.log access.log --merge --reverse --no-follow --filter message:error --query 'level = "error"'
```

Files in merged view with the full startup control set:

```bash
./bin/log server.log access.log --merge --reverse --no-follow --filter message:line --query 'level = "unknown"'
```

Those startup flags are reflected back into the live TUI session state:

- header summary includes merged/filter/query/reverse/nofollow context
- footer state includes merged session markers like `srcs:<n>`, `mflt:...`, and `mqry:...`

stdin:

```bash
cat examples/mixed.log | bun run src/cli.ts
```

URL stream:

```bash
bun run src/cli.ts -- --url https://example.com/logs
```

Command stream:

```bash
bun run src/cli.ts -- --cmd "docker logs -f my-container 2>&1"
```

Installed binary:

```bash
./bin/log --cmd "docker logs -f my-container 2>&1"
./bin/log --url https://example.com/logs
```

## Headless summary modes

JSON summary:

```bash
bun run src/cli.ts examples/mixed.log --summary-json
```

Text summary:

```bash
bun run src/cli.ts examples/mixed.log --summary-text
```

## Keybindings

- `↑/↓` or `j/k`: move selection
- `PgUp/PgDn`: move by page
- `Home/End`, `g/G`: jump top/bottom
- `Enter`: toggle focus into detail pane
- `Esc`: back to list / close modal
- `Space`: fold/unfold JSON node in detail pane
- `R`: reverse ordering
- `F`: filter mode
- `1`..`6`: toggle quick level filters for trace/debug/info/warn/error/fatal
- `Q`: query editor mode
- `/`: detail search mode
- `n` / `N`: next/previous detail search match
- `Tab`: next source tab
- `Shift+Tab`: previous source tab
- `M`: toggle merged view
- `m`: toggle detail mode (`tree` / `raw`)
- `yy`, `yp`, `yk`: copy current value, path, or key in JSON detail mode
- `?`: help
- `q`: quit

## Filter language

`F` opens the filter bar. Type a filter expression, press `Enter` to apply it,
or `Esc` to cancel.

Supported operators:

- equality: `field = value`, `field != value`
- numeric comparisons: `duration_ms >= 100`, `size < 4096`
- substring: `message ~= "timeout"`, `message !~= "health"`
- wildcard like: `service like "api*"`
- regex: `message ~~= "timeout|retry"`
- boolean composition: `and`, `or`, `not`, parentheses
- existence: `exists(.user.id)`, `not exists(.trace_id)`
- set membership: `level in ("warn","error")`, `service not in (db,cache)`
- optional path modifier: `.trace_id? = "missing-ok"`
- nested paths: `request.method = "GET"`
- array wildcards: `span.[].name = "db.query"`
- array indexes: `span.[1].name = "cache.hit"`

Notes:

- Filters apply to structured JSON fields when a row is JSON.
- Text rows still support virtual fields like `message`, `level`, `prefix`, and `raw`.
- Legacy shorthand like `level:error` and bare substring filters still work.

Examples:

```bash
level = "error" and request.method = "POST"
exists(.user.id) and duration_ms >= 250
span.[].name like "db*"
message !~= "health" and level in ("warn","error")
.trace_id? = "missing-ok"
```

## Query language

Current query support includes:

- equality: `level = "error"`
- substring: `message like "timeout"`
- regex: `message =~ /health/`
- existence: `exists(user.id)`
- membership: `level in ("warn","error")`
- boolean composition: `and`, `or`, `not`

Examples:

```bash
level = "error" and service like "db"
exists(user.id) and level in ("warn","error")
not message =~ /health/
```

## Config

`log` looks for config in this order:

1. `--config /path/to/file.jsonc`
2. `./.log.jsonc`
3. `$HOME/.config/log/config.jsonc`

Example config:

```jsonc
{
  "maxEntries": 50000,
  "batchMs": 50,
  "mainLineTemplate": "{{level_style (uppercase level)}} {{message}} {{cyan prefix}}",
  "placeholderFormat": "#{key}",
  "contextPath": "extra_data",
  "levelMap": {
    "10": "trace",
    "20": "debug",
    "30": "info",
    "40": "warn",
    "50": "error"
  }
}
```

## Main-line templates

`mainLineTemplate` uses Handlebars and receives these variables:

- `timestamp`
- `level`
- `message`
- `prefix`
- `json`
- `raw`

Helpers:

- `bold`
- `red`
- `yellow`
- `green`
- `cyan`
- `blue`
- `purple`
- `uppercase`
- `fixed_size`
- `min_size`
- `level_style`

Examples:

```handlebars
{{level_style (uppercase level)}} {{message}}
{{cyan timestamp}} {{fixed_size (uppercase level) 5}} {{message}}
{{bold prefix}} {{message}}
```

If `NO_COLOR` is set, color helpers emit plain text instead of ANSI escapes.

### Placeholder substitution

If `message` contains placeholders and config enables:

- `placeholderFormat: "#{key}"`
- `contextPath: "extra_data"`

then a message like `User #{user} logged in` is substituted from
`json.extra_data.user`.

## Testing

```bash
bun run typecheck
bun test
bun run test:e2e
bun run build
```

For a quick high-volume ingest check:

```bash
bun run stress:cmd
```

## Examples

See [examples/mixed.log](examples/mixed.log).
