import { describe, expect, test } from "bun:test";
import { getPathValue, getPathValues, parsePath } from "../src/lib/pathValue.ts";

describe("parsePath errors", () => {
  test("empty input", () => {
    expect(() => parsePath("   ")).toThrow("expected path");
  });

  test("bare dot or bare optional marker", () => {
    expect(() => parsePath(".")).toThrow("expected path");
    expect(() => parsePath("?")).toThrow("expected path");
  });

  test("unterminated bracket", () => {
    expect(() => parsePath("items[0")).toThrow("unterminated path segment: items[0");
  });

  test("non-numeric index", () => {
    expect(() => parsePath("items[x]")).toThrow("invalid path index: items[x]");
  });

  test("invalid property character", () => {
    expect(() => parsePath("a.$b")).toThrow("invalid path: a.$b");
  });
});

describe("parsePath segments", () => {
  test("optional suffix and leading dot", () => {
    expect(parsePath(".a.b?")).toEqual({
      optional: true,
      segments: [
        { type: "property", key: "a" },
        { type: "property", key: "b" },
      ],
    });
  });

  test(".[] and [] are equivalent", () => {
    expect(parsePath("items.[]")).toEqual(parsePath("items[]"));
  });
});

describe("getPathValues", () => {
  const root = { a: { b: 1 }, items: [{ id: "x" }, { id: "y" }] };

  test("resolves nested properties", () => {
    expect(getPathValues(root, parsePath("a.b"))).toEqual({ found: true, values: [1] });
  });

  test("resolves wildcard and index", () => {
    expect(getPathValues(root, parsePath("items[].id")).values).toEqual(["x", "y"]);
    expect(getPathValue(root, "items[1].id")).toBe("y");
  });

  test("short-circuits to found:false on the first missing segment", () => {
    expect(getPathValues(root, parsePath("missing.b"))).toEqual({ found: false, values: [] });
    expect(getPathValues(root, parsePath("items[5].id"))).toEqual({ found: false, values: [] });
  });
});
