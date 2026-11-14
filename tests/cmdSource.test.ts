import { describe, expect, test } from "bun:test";
import { startCmdSource } from "../src/lib/source/cmdSource.ts";
import type { LogEntry } from "../src/types.ts";

// Documents current behaviour: stdout and stderr are read by two independent
// readline loops, so their relative order is racy, but every line arrives,
// tagged with the source id, and stderr lines carry a "stderr | " prefix.
describe("cmdSource", () => {
  test("captures both stdout and stderr lines with source tagging", async () => {
    const entries: LogEntry[] = [];
    await new Promise<void>(resolve => {
      startCmdSource(
        { id: "cmd1", label: "both", kind: "cmd", command: "echo out-line; echo err-line 1>&2" },
        {
          onEntries: (_id, batch) => entries.push(...batch),
          onStatus: () => {},
          onSourceReady: () => {},
          onSourceDone: () => resolve(),
        },
        { maxEntries: 100, batchMs: 50, columns: [], preserveAnsiText: true, levelMap: {} },
      );
    });
    // close can fire before the readline loops drain their last line
    await new Promise(resolve => setTimeout(resolve, 50));

    const raws = entries.map(entry => entry.raw).sort();
    expect(raws).toEqual(["out-line", "stderr | err-line"]);
    expect(entries.every(entry => entry.sourceId === "cmd1")).toBe(true);
  });
});
