import type { LogEntry } from "../types";
import { getPathValues, parsePath, type ParsedPath } from "./pathValue";

type Literal = string | number | boolean | null;

type FilterExpr =
  | { type: "binary"; op: "and" | "or"; left: FilterExpr; right: FilterExpr }
  | { type: "not"; expr: FilterExpr }
  | { type: "exists"; path: ParsedPath }
  | {
      type: "compare";
      path: ParsedPath;
      op:
        | "="
        | "!="
        | ">"
        | ">="
        | "<"
        | "<="
        | "~="
        | "!~="
        | "like"
        | "~~=";
      value: Literal;
    }
  | { type: "in"; path: ParsedPath; negated: boolean; values: Literal[] };

type Token =
  | { type: "word"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" }
  | { type: "operator"; value: string };

const COMPARISON_OPERATORS = new Set([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "~=",
  "!~=",
  "like",
  "~~=",
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }
    if (char === '"') {
      let value = "";
      let cursor = index + 1;
      while (cursor < input.length) {
        const current = input[cursor];
        if (current === "\\" && cursor + 1 < input.length) {
          value += input[cursor + 1];
          cursor += 2;
          continue;
        }
        if (current === '"') {
          break;
        }
        value += current;
        cursor += 1;
      }
      if (cursor >= input.length || input[cursor] !== '"') {
        throw new Error("unterminated string literal");
      }
      tokens.push({ type: "string", value });
      index = cursor + 1;
      continue;
    }
    let matchedOperator = false;
    for (const operator of ["!~=", "~~=", ">=", "<=", "!=", "~=", "=", ">", "<"]) {
      if (input.startsWith(operator, index)) {
        tokens.push({ type: "operator", value: operator });
        index += operator.length;
        matchedOperator = true;
        break;
      }
    }
    if (matchedOperator) {
      continue;
    }
    const match = /^(?:\.?[A-Za-z0-9_.\-[\]?]+|\[\])/.exec(input.slice(index));
    if (!match) {
      throw new Error(`unexpected token near: ${input.slice(index)}`);
    }
    const raw = match[0];
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      tokens.push({ type: "number", value: Number(raw) });
    } else {
      tokens.push({ type: "word", value: raw });
    }
    index += raw.length;
  }

  return tokens;
}

function isWord(token: Token | undefined, value?: string): token is Extract<Token, { type: "word" }> {
  return token?.type === "word" && (value ? token.value.toLowerCase() === value : true);
}

function parseLiteral(token: Token | undefined): Literal {
  if (!token) {
    throw new Error("expected value");
  }
  if (token.type === "string" || token.type === "number") {
    return token.value;
  }
  if (token.type === "word") {
    const lowered = token.value.toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
    if (lowered === "null") return null;
    return token.value;
  }
  throw new Error("expected literal");
}

export function parseFilterExpression(input: string): FilterExpr {
  const tokens = tokenize(input);
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => tokens[index++];
  const expectParen = (value: "(" | ")") => {
    const token = consume();
    if (token?.type !== "paren" || token.value !== value) {
      throw new Error(`expected ${value}`);
    }
  };

  const parsePrimary = (): FilterExpr => {
    const token = peek();
    if (!token) {
      throw new Error("expected expression");
    }
    if (token.type === "paren" && token.value === "(") {
      consume();
      const expr = parseOr();
      expectParen(")");
      return expr;
    }
    if (isWord(token, "exists")) {
      consume();
      expectParen("(");
      const pathToken = consume();
      if (!isWord(pathToken)) {
        throw new Error("expected path in exists()");
      }
      expectParen(")");
      return { type: "exists", path: parsePath(pathToken.value) };
    }
    if (!isWord(token)) {
      throw new Error("expected field path");
    }
    const pathToken = consume();
    if (!isWord(pathToken)) {
      throw new Error("expected field path");
    }
    const path = parsePath(pathToken.value);
    const maybeNot = isWord(peek(), "not");
    if (maybeNot) {
      consume();
      if (isWord(peek(), "in")) {
        consume();
        expectParen("(");
        const values: Literal[] = [];
        while (true) {
          values.push(parseLiteral(consume()));
          if (peek()?.type === "comma") {
            consume();
            continue;
          }
          break;
        }
        expectParen(")");
        return { type: "in", path, negated: true, values };
      }
      throw new Error("expected in after not");
    }
    if (isWord(peek(), "in")) {
      consume();
      expectParen("(");
      const values: Literal[] = [];
      while (true) {
        values.push(parseLiteral(consume()));
        if (peek()?.type === "comma") {
          consume();
          continue;
        }
        break;
      }
      expectParen(")");
      return { type: "in", path, negated: false, values };
    }

    const operatorToken = consume();
    let operator: string | undefined;
    if (operatorToken?.type === "operator") {
      operator = operatorToken.value;
    } else if (isWord(operatorToken, "like")) {
      operator = operatorToken.value;
    }
    if (!operator || !COMPARISON_OPERATORS.has(operator)) {
      throw new Error("expected comparison operator");
    }
    return {
      type: "compare",
      path,
      op: operator as FilterExpr extends { type: "compare"; op: infer T } ? T : never,
      value: parseLiteral(consume()),
    };
  };

  const parseNot = (): FilterExpr => {
    if (isWord(peek(), "not")) {
      consume();
      return { type: "not", expr: parseNot() };
    }
    return parsePrimary();
  };

  const parseAnd = (): FilterExpr => {
    let expr = parseNot();
    while (isWord(peek(), "and")) {
      consume();
      expr = { type: "binary", op: "and", left: expr, right: parseNot() };
    }
    return expr;
  };

  const parseOr = (): FilterExpr => {
    let expr = parseAnd();
    while (isWord(peek(), "or")) {
      consume();
      expr = { type: "binary", op: "or", left: expr, right: parseAnd() };
    }
    return expr;
  };

  const expression = parseOr();
  if (index < tokens.length) {
    throw new Error("unexpected trailing filter tokens");
  }
  return expression;
}

function getEntryScope(entry: LogEntry): Record<string, unknown> {
  const jsonRoot =
    entry.kind === "json" && entry.jsonValue && typeof entry.jsonValue === "object"
      ? (entry.jsonValue as Record<string, unknown>)
      : {};

  return {
    ...jsonRoot,
    message: entry.message,
    prefix: entry.prefix,
    level: entry.levelNormalized,
    raw: entry.raw,
    text: entry.text,
    time: entry.timeText,
    timestamp: entry.timeText,
    json: entry.jsonValue,
  };
}

function resolveValues(entry: LogEntry, path: ParsedPath): { found: boolean; values: unknown[] } {
  return getPathValues(getEntryScope(entry), path);
}

function compareLiteral(value: unknown, literal: Literal): boolean {
  if (literal === null) {
    return value === null;
  }
  if (typeof literal === "number") {
    return typeof value === "number"
      ? value === literal
      : Number(value) === literal && !Number.isNaN(Number(value));
  }
  if (typeof literal === "boolean") {
    return value === literal || String(value).toLowerCase() === String(literal);
  }
  return String(value).toLowerCase() === literal.toLowerCase();
}

function compareNumeric(value: unknown, literal: Literal, op: ">" | ">=" | "<" | "<="): boolean {
  const left = typeof value === "number" ? value : Number(value);
  const right = typeof literal === "number" ? literal : Number(literal);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }
  if (op === ">") return left > right;
  if (op === ">=") return left >= right;
  if (op === "<") return left < right;
  return left <= right;
}

function evaluateCompare(expr: Extract<FilterExpr, { type: "compare" }>, entry: LogEntry): boolean {
  const resolved = resolveValues(entry, expr.path);
  if (!resolved.found || resolved.values.length === 0) {
    return expr.path.optional;
  }

  const matcher = (value: unknown) => {
    const current = value ?? "";
    const currentText = String(current);
    switch (expr.op) {
      case "=":
        return compareLiteral(current, expr.value);
      case "!=":
        return !compareLiteral(current, expr.value);
      case ">":
      case ">=":
      case "<":
      case "<=":
        return compareNumeric(current, expr.value, expr.op);
      case "~=":
        return currentText.toLowerCase().includes(String(expr.value).toLowerCase());
      case "!~=":
        return !currentText.toLowerCase().includes(String(expr.value).toLowerCase());
      case "like": {
        const regex = new RegExp(
          `^${escapeRegex(String(expr.value)).replace(/\\\*/g, ".*")}$`,
          "i",
        );
        return regex.test(currentText);
      }
      case "~~=":
        return new RegExp(String(expr.value), "i").test(currentText);
    }
  };

  if (expr.op === "!=" || expr.op === "!~=") {
    return resolved.values.every(matcher);
  }

  return resolved.values.some(matcher);
}

function evaluateIn(expr: Extract<FilterExpr, { type: "in" }>, entry: LogEntry): boolean {
  const resolved = resolveValues(entry, expr.path);
  if (!resolved.found || resolved.values.length === 0) {
    return expr.path.optional;
  }
  const match = resolved.values.some(value =>
    expr.values.some(literal => compareLiteral(value, literal)),
  );
  return expr.negated ? !match : match;
}

export function evaluateFilterExpression(expr: FilterExpr, entry: LogEntry): boolean {
  switch (expr.type) {
    case "binary":
      return expr.op === "and"
        ? evaluateFilterExpression(expr.left, entry) && evaluateFilterExpression(expr.right, entry)
        : evaluateFilterExpression(expr.left, entry) || evaluateFilterExpression(expr.right, entry);
    case "not":
      return !evaluateFilterExpression(expr.expr, entry);
    case "exists": {
      const resolved = resolveValues(entry, expr.path);
      return resolved.found && resolved.values.length > 0;
    }
    case "compare":
      return evaluateCompare(expr, entry);
    case "in":
      return evaluateIn(expr, entry);
  }
}

function buildLegacyFilter(filterText: string): (entry: LogEntry) => boolean {
  const tokens = filterText
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return () => true;
  }

  return (entry: LogEntry) =>
    tokens.every(token => {
      if (token.startsWith("/") && token.endsWith("/") && token.length > 2) {
        return new RegExp(token.slice(1, -1), "i").test(entry.searchText);
      }
      const separator = token.indexOf(":");
      if (separator > 0) {
        const field = token.slice(0, separator).toLowerCase();
        const value = token.slice(separator + 1).toLowerCase();
        return (entry.fieldIndex[field] ?? "").toLowerCase().includes(value);
      }
      return entry.searchText.includes(token.toLowerCase());
    });
}

export function isLegacyFilterExpression(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return true;
  }
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .every(token => !/[()><=!~]/.test(token) && !["and", "or", "not", "exists", "in", "like"].includes(token.toLowerCase()));
}

export function buildFilter(filterText: string): (entry: LogEntry) => boolean {
  const trimmed = filterText.trim();
  if (!trimmed) {
    return () => true;
  }

  try {
    const expression = parseFilterExpression(trimmed);
    return (entry: LogEntry) => evaluateFilterExpression(expression, entry);
  } catch {
    return buildLegacyFilter(trimmed);
  }
}
