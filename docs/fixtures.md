# Example fixtures: content contract

`examples/mixed.log` and `examples/mixed-2.log` are test fixtures. `tests/e2e-smoke.test.ts` and the README examples depend on their exact content. `tests/fixtures.test.ts` checks the entry counts. These files were once lost silently to a global `*.log` gitignore rule. `.gitignore` now has a `!examples/*.log` exception to prevent this.

## Content

| File | Entries | JSON | Text | Lines that matter |
| --- | --- | --- | --- | --- |
| `mixed.log` | 5 | 3 | 2 | `{"level":"error","message":"connection timeout occurred"}`, text `plain text line one`, text `system heartbeat ok` |
| `mixed-2.log` | 3 | 2 | 1 | text `plain text second line here` |

Text lines have no level, so their normalized level is `unknown`.

## e2e-smoke assertions (8 tests)

| Test | Fixture facts it needs |
| --- | --- |
| summarizes a file as json | `mixed.log` exists and parses |
| summarizes multiple files as multiple sources | both files exist; 5 + 3 = `totalEntries: 8` |
| applies startup filter and query in summary mode | exactly 1 `mixed.log` entry has `timeout` in its message and level `error` |
| applies startup filter and query in merged summary mode | across both files, exactly 2 entries have `line` in the message and level `unknown` |
| supports the full merged startup control set together | same budget as above: 2 |
| ignores piped stdin when explicit file sources are provided | `mixed.log` has 5 entries |
| wrapper binary supports merged startup filters and queries | same budget as above: 2 |
| wrapper binary ignores merge when only one source is provided | `mixed.log`: entries=5, json=3, text=2 |

## Choices the tests do not force

- **The mixed-2.log split (2 JSON, 1 text).** The tests fix only its total of 3, because 8 − 5 = 3. The 2/1 split was chosen so that the file has one text line, and that line can carry the second `line` match.
- **The cross-file `line` / `unknown` budget is exactly 2.** The only lines that match are the text lines that contain `line`: `plain text line one` (mixed.log) and `plain text second line here` (mixed-2.log). `system heartbeat ok` is text but has no `line`. No JSON message contains `line`. If you add a text line that contains `line`, or a JSON line whose level does not map, the budget changes and three tests break.

## README references (10)

These README lines use the fixtures: 34, 41, 47, 55, 73, 79, 139 (piped stdin), 166, 172, and the link at 341. Each direct or piped invocation exits 0 with `mixed.log`'s 5-entry summary. The network and docker examples do not use the fixtures.
