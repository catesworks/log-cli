export type PathSegment =
  | { type: "property"; key: string }
  | { type: "index"; index: number }
  | { type: "wildcard" };

export type ParsedPath = {
  optional: boolean;
  segments: PathSegment[];
};

export function parsePath(input: string): ParsedPath {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("expected path");
  }

  let value = trimmed;
  let optional = false;
  if (value.endsWith("?")) {
    optional = true;
    value = value.slice(0, -1);
  }
  if (value.startsWith(".")) {
    value = value.slice(1);
  }
  if (!value) {
    throw new Error("expected path");
  }

  const segments: PathSegment[] = [];
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === ".") {
      index += 1;
      continue;
    }

    if (char === "[") {
      const end = value.indexOf("]", index);
      if (end === -1) {
        throw new Error(`unterminated path segment: ${input}`);
      }
      const content = value.slice(index + 1, end);
      if (content === "") {
        segments.push({ type: "wildcard" });
      } else if (/^\d+$/.test(content)) {
        segments.push({ type: "index", index: Number(content) });
      } else {
        throw new Error(`invalid path index: ${input}`);
      }
      index = end + 1;
      continue;
    }

    let end = index;
    while (end < value.length && /[A-Za-z0-9_-]/.test(value[end])) {
      end += 1;
    }
    const key = value.slice(index, end);
    if (!key) {
      throw new Error(`invalid path: ${input}`);
    }
    segments.push({ type: "property", key });
    index = end;
  }

  return { optional, segments };
}

export function getPathValues(
  root: unknown,
  path: ParsedPath,
): { found: boolean; values: unknown[] } {
  let current: unknown[] = [root];
  let found = true;

  for (const segment of path.segments) {
    const next: unknown[] = [];
    for (const candidate of current) {
      if (segment.type === "property") {
        if (candidate && typeof candidate === "object" && segment.key in (candidate as Record<string, unknown>)) {
          next.push((candidate as Record<string, unknown>)[segment.key]);
        }
        continue;
      }
      if (!Array.isArray(candidate)) {
        continue;
      }
      if (segment.type === "wildcard") {
        next.push(...candidate);
      } else if (segment.index >= 0 && segment.index < candidate.length) {
        next.push(candidate[segment.index]);
      }
    }
    if (next.length === 0) {
      found = false;
      current = [];
      break;
    }
    current = next;
  }

  return { found, values: current };
}

export function getPathValue(root: unknown, pathInput: string): unknown {
  const resolved = getPathValues(root, parsePath(pathInput));
  return resolved.values[0];
}
