export function createTextSearch(text: string, term: string): {
  matches: number[];
  next: (index: number) => number;
  prev: (index: number) => number;
} {
  const lines = text.split(/\r?\n/);
  const lowered = term.toLowerCase();
  const matches = lowered
    ? lines
        .map((line, index) => ({ line, index }))
        .filter(item => item.line.toLowerCase().includes(lowered))
        .map(item => item.index)
    : [];

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
