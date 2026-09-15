import type { JsonTreeRow } from "../types";

function previewValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return "{…}";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function walk(
  keyLabel: string,
  value: unknown,
  path: string,
  depth: number,
  expanded: Set<string>,
  rows: JsonTreeRow[],
): void {
  const expandable =
    value !== null && typeof value === "object" && Object.keys(value).length > 0;
  const isExpanded = expanded.has(path);
  rows.push({
    path,
    depth,
    keyLabel,
    valueLabel: previewValue(value),
    expandable,
    expanded: isExpanded,
  });

  if (!expandable || !isExpanded) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      walk(`[${index}]`, child, `${path}[${index}]`, depth + 1, expanded, rows);
    });
    return;
  }

  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    walk(childKey, childValue, `${path}.${childKey}`, depth + 1, expanded, rows);
  }
}

export function flattenJsonTree(value: unknown, expanded: Set<string>): JsonTreeRow[] {
  const rows: JsonTreeRow[] = [];
  walk("root", value, "root", 0, expanded, rows);
  return rows;
}
