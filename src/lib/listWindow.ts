import type { LogEntry } from "../types";

function getMergedEntryRenderRows(
  entries: LogEntry[],
  startIndex: number,
  index: number,
): number {
  if (index < startIndex || index >= entries.length) {
    return 0;
  }

  const entry = entries[index];
  const previous = index > startIndex ? entries[index - 1] : undefined;
  const hasBoundary = !previous || previous.sourceId !== entry?.sourceId;
  return 1 + (hasBoundary ? 1 : 0);
}

function buildMergedWindow(
  entries: LogEntry[],
  startIndex: number,
  maxRows: number,
): LogEntry[] {
  const window: LogEntry[] = [];
  let usedRows = 0;

  for (let index = startIndex; index < entries.length; index += 1) {
    const nextRows = getMergedEntryRenderRows(entries, startIndex, index);
    if (window.length > 0 && usedRows + nextRows > maxRows) {
      break;
    }
    usedRows += nextRows;
    window.push(entries[index]);
  }

  return window;
}

export function sliceListWindow(input: {
  entries: LogEntry[];
  selectedIndex: number;
  maxRows: number;
  mergedView: boolean;
}): {
  startIndex: number;
  window: LogEntry[];
} {
  const maxRows = Math.max(1, input.maxRows);
  const selectedIndex = Math.min(
    Math.max(0, input.selectedIndex),
    Math.max(0, input.entries.length - 1),
  );

  if (!input.mergedView) {
    const startIndex = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor(maxRows / 2),
        Math.max(0, input.entries.length - maxRows),
      ),
    );
    return {
      startIndex,
      window: input.entries.slice(startIndex, startIndex + maxRows),
    };
  }

  let startIndex = Math.max(0, selectedIndex - Math.floor(maxRows / 2));
  let window = buildMergedWindow(input.entries, startIndex, maxRows);
  if (selectedIndex >= startIndex + window.length) {
    startIndex = selectedIndex;
    window = buildMergedWindow(input.entries, startIndex, maxRows);
  }

  return { startIndex, window };
}
