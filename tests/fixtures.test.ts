import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the entry-count contract that tests/e2e-smoke.test.ts and the README
// examples rely on. These files were once silently lost to a global *.log
// gitignore rule (see .gitignore), so fail loudly if they go missing or drift.
function lines(name: string): string[] {
  return readFileSync(join(import.meta.dir, "..", "examples", name), "utf8")
    .split("\n")
    .filter(line => line.length > 0);
}

function split(name: string) {
  const all = lines(name);
  const json = all.filter(line => line.startsWith("{")).length;
  return { entries: all.length, json, text: all.length - json };
}

describe("example fixtures", () => {
  test("mixed.log has 5 entries: 3 json, 2 text", () => {
    expect(split("mixed.log")).toEqual({ entries: 5, json: 3, text: 2 });
  });

  test("mixed-2.log has 3 entries: 2 json, 1 text", () => {
    expect(split("mixed-2.log")).toEqual({ entries: 3, json: 2, text: 1 });
  });
});
