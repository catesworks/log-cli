import { describe, expect, test } from "bun:test";
import { validateSources } from "../src/lib/sources.ts";
import type { SourceSpec } from "../src/types.ts";

const url = (value: string): SourceSpec[] => [{ id: "u", label: value, kind: "url", url: value }];
const cmd = (value: string): SourceSpec[] => [{ id: "c", label: value, kind: "cmd", command: value }];

describe("validateSources", () => {
  test("accepts http and https URLs", () => {
    expect(validateSources(url("http://example.com"))).toBeNull();
    expect(validateSources(url("https://example.com/logs"))).toBeNull();
  });

  test("rejects non-http(s) schemes", () => {
    expect(validateSources(url("ftp://x"))).toBe("Unsupported URL scheme (expected http or https): ftp://x");
    expect(validateSources(url("file:///etc/passwd"))).toContain("Unsupported URL scheme");
  });

  test("rejects unparseable URLs without throwing", () => {
    expect(validateSources(url("notaurl"))).toBe("Invalid URL: notaurl");
  });

  test("rejects an empty or whitespace-only command", () => {
    expect(validateSources(cmd(""))).toBe("Command must not be empty (--cmd)");
    expect(validateSources(cmd("   "))).toBe("Command must not be empty (--cmd)");
  });

  test("rejects a directory with the documented message", () => {
    expect(validateSources([{ id: "f", label: "tests", kind: "file", filePath: "tests" }])).toBe(
      "Path is a directory, not a file: tests",
    );
  });
});
