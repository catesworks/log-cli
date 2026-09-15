import type { AnsiSegment } from "../types";

const COLOR_MAP: Record<number, NonNullable<AnsiSegment["color"]>> = {
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
};

export function parseAnsiText(input: string): AnsiSegment[] {
  // eslint-disable-next-line no-control-regex -- \u001b is the literal ANSI SGR escape byte being parsed
  const regex = /\u001b\[([0-9;]+)m/g;
  const segments: AnsiSegment[] = [];
  let lastIndex = 0;
  let current: Omit<AnsiSegment, "text"> = {};
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: input.slice(lastIndex, match.index),
        ...current,
      });
    }
    const codes = match[1].split(";").map(Number);
    for (const code of codes) {
      if (code === 0) current = {};
      if (code === 1) current = { ...current, bold: true };
      if (code in COLOR_MAP) current = { ...current, color: COLOR_MAP[code] };
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({
      text: input.slice(lastIndex),
      ...current,
    });
  }

  return segments.filter(segment => segment.text.length > 0);
}
