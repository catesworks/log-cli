import { describe, expect, test } from "bun:test";
import { flattenJsonTree } from "../src/lib/jsonTree.ts";
import {
  copyCurrentJsonValue,
  copyCurrentKey,
  copyCurrentPath,
  createDetailSearch,
} from "../src/lib/detailActions.ts";

describe("detail actions", () => {
  test("copies path, key, and value from current json row", () => {
    const rows = flattenJsonTree({ a: { b: 3 } }, new Set(["root", "root.a"]));
    const row = rows[2];
    expect(copyCurrentPath(row)).toBe("root.a.b");
    expect(copyCurrentKey(row)).toBe("b");
    expect(copyCurrentJsonValue(row)).toBe("3");
  });

  test("searches detail rows and supports next/prev navigation", () => {
    const rows = flattenJsonTree(
      { alpha: { message: "health check" }, beta: { message: "timeout" } },
      new Set(["root", "root.alpha", "root.beta"]),
    );
    const search = createDetailSearch(rows, "message");
    expect(search.matches.length).toBe(2);
    expect(search.next(0)).toBe(2);
    expect(search.next(2)).toBe(4);
    expect(search.prev(4)).toBe(2);
  });
});
