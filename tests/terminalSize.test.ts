import { describe, expect, test } from "bun:test";
import { readTerminalSize } from "../src/hooks/useTerminalSize.ts";

describe("readTerminalSize", () => {
  test("falls back to 100x30 when columns/rows are missing", () => {
    expect(readTerminalSize({})).toEqual({ columns: 100, rows: 30 });
  });

  test("uses reported columns/rows when present", () => {
    expect(readTerminalSize({ columns: 80, rows: 24 })).toEqual({ columns: 80, rows: 24 });
  });
});
