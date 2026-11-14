---
"log-cli": minor
---

Add `--version` / `-V`. An explicit `--config` that is missing, is not valid JSON, or fails validation now exits 1 with a message that names the file. A malformed auto-discovered config prints a warning and the defaults are used. `--url` must be an http or https URL, and `--cmd` must not be empty.
