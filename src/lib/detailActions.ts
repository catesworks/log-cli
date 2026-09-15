import type { JsonTreeRow } from "../types";

export function copyCurrentPath(row: JsonTreeRow): string {
  return row.path;
}

export function copyCurrentKey(row: JsonTreeRow): string {
  return row.keyLabel;
}

export function copyCurrentJsonValue(row: JsonTreeRow): string {
  return row.valueLabel;
}

export function createDetailSearch(rows: JsonTreeRow[], term: string): {
  matches: number[];
  next: (index: number) => number;
  prev: (index: number) => number;
} {
  const lowered = term.toLowerCase();
  const matches = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      `${row.keyLabel} ${row.valueLabel}`.toLowerCase().includes(lowered),
    )
    .map(({ index }) => index);

  const next = (index: number) => {
    for (const match of matches) {
      if (match > index) return match;
    }
    return matches[0] ?? index;
  };

  const prev = (index: number) => {
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      if (matches[i] < index) return matches[i];
    }
    return matches.at(-1) ?? index;
  };

  return { matches, next, prev };
}
