import type { LogEntry } from "../types";

type Token =
  | { type: "identifier"; value: string }
  | { type: "string"; value: string }
  | { type: "regex"; value: string }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

type Expr =
  | { type: "binary"; op: "and" | "or"; left: Expr; right: Expr }
  | { type: "not"; expr: Expr }
  | { type: "exists"; field: string }
  | { type: "in"; field: string; values: string[] }
  | { type: "compare"; field: string; op: "=" | "like" | "=~"; value: string };

type ValueToken = Extract<Token, { value: string }>;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      i += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma" });
      i += 1;
      continue;
    }
    if (char === '"') {
      let j = i + 1;
      let value = "";
      while (j < input.length && input[j] !== '"') {
        value += input[j];
        j += 1;
      }
      tokens.push({ type: "string", value });
      i = j + 1;
      continue;
    }
    if (char === "/") {
      let j = i + 1;
      let value = "";
      while (j < input.length && input[j] !== "/") {
        value += input[j];
        j += 1;
      }
      tokens.push({ type: "regex", value });
      i = j + 1;
      continue;
    }
    if (input.startsWith("=~", i)) {
      tokens.push({ type: "operator", value: "=~" });
      i += 2;
      continue;
    }
    if (char === "=") {
      tokens.push({ type: "operator", value: "=" });
      i += 1;
      continue;
    }
    const match = /^[A-Za-z0-9_.?-]+/.exec(input.slice(i));
    if (!match) {
      throw new Error(`Unexpected query token near: ${input.slice(i)}`);
    }
    const value = match[0];
    const lowered = value.toLowerCase();
    if (["and", "or", "not", "like", "in", "exists"].includes(lowered)) {
      tokens.push({ type: "operator", value: lowered });
    } else {
      tokens.push({ type: "identifier", value });
    }
    i += value.length;
  }
  return tokens;
}

function parse(tokens: Token[]): Expr {
  let index = 0;
  const peek = () => tokens[index];
  const peekValue = () => {
    const token = peek();
    return token && "value" in token ? token.value : undefined;
  };
  const consume = () => tokens[index++];
  const readValueToken = (): ValueToken => {
    const token = consume();
    if (!token || !("value" in token)) {
      throw new Error("expected token value");
    }
    return token;
  };

  const parsePrimary = (): Expr => {
    const token = consume();
    if (!token) throw new Error("Unexpected end of query");
    if (token.type === "operator" && token.value === "not") {
      return { type: "not", expr: parsePrimary() };
    }
    if (token.type === "operator" && token.value === "exists") {
      if (peek()?.type !== "paren" || peekValue() !== "(") throw new Error("expected (");
      consume();
      const field = readValueToken();
      if (!field || field.type !== "identifier") throw new Error("expected field in exists()");
      if (peek()?.type !== "paren" || peekValue() !== ")") throw new Error("expected )");
      consume();
      return { type: "exists", field: field.value };
    }
    if (token.type === "paren" && token.value === "(") {
      const expr = parseOr();
      if (peek()?.type !== "paren" || peekValue() !== ")") throw new Error("expected )");
      consume();
      return expr;
    }
    if (token.type !== "identifier") throw new Error("expected identifier");
    const field = token.value;
    const op = consume();
    if (!op || op.type !== "operator") throw new Error("expected operator");
    if (op.value === "in") {
      if (peek()?.type !== "paren" || peekValue() !== "(") throw new Error("expected (");
      consume();
      const values: string[] = [];
      while (true) {
        const valueToken = readValueToken();
        if (!valueToken || !["string", "identifier"].includes(valueToken.type)) {
          throw new Error("expected value in in()");
        }
        values.push(valueToken.value);
        if (peek()?.type === "comma") {
          consume();
          continue;
        }
        break;
      }
      if (peek()?.type !== "paren" || peekValue() !== ")") throw new Error("expected )");
      consume();
      return { type: "in", field, values };
    }
    const valueToken = readValueToken();
    if (!valueToken || !["string", "identifier", "regex"].includes(valueToken.type)) {
      throw new Error("expected comparison value");
    }
    const value = valueToken.value;
    if (op.value !== "=" && op.value !== "like" && op.value !== "=~") {
      throw new Error(`unsupported operator ${op.value}`);
    }
    return { type: "compare", field, op: op.value, value };
  };

  const parseAnd = (): Expr => {
    let expr = parsePrimary();
    while (peek()?.type === "operator" && peekValue() === "and") {
      consume();
      expr = { type: "binary", op: "and", left: expr, right: parsePrimary() };
    }
    return expr;
  };

  const parseOr = (): Expr => {
    let expr = parseAnd();
    while (peek()?.type === "operator" && peekValue() === "or") {
      consume();
      expr = { type: "binary", op: "or", left: expr, right: parseAnd() };
    }
    return expr;
  };

  const expression = parseOr();
  if (index < tokens.length) {
    throw new Error("unexpected trailing query tokens");
  }
  return expression;
}

function getFieldValue(entry: LogEntry, field: string): string | undefined {
  const normalized = field.toLowerCase();
  if (normalized === "prefix") return entry.prefix;
  if (normalized === "message") return entry.message;
  if (normalized === "level") return String(entry.levelNormalized);
  if (normalized === "time") return entry.timeText;
  return entry.fieldIndex[normalized] ?? entry.fieldIndex[normalized.replace(/\[(\d+)\]/g, ".$1")];
}

function evaluate(expr: Expr, entry: LogEntry): boolean {
  switch (expr.type) {
    case "binary":
      return expr.op === "and"
        ? evaluate(expr.left, entry) && evaluate(expr.right, entry)
        : evaluate(expr.left, entry) || evaluate(expr.right, entry);
    case "not":
      return !evaluate(expr.expr, entry);
    case "exists":
      return getFieldValue(entry, expr.field) !== undefined;
    case "in": {
      const current = getFieldValue(entry, expr.field)?.toLowerCase();
      return current ? expr.values.map(v => v.toLowerCase()).includes(current) : false;
    }
    case "compare": {
      const current = getFieldValue(entry, expr.field) ?? "";
      if (expr.op === "=") return current.toLowerCase() === expr.value.toLowerCase();
      if (expr.op === "like") return current.toLowerCase().includes(expr.value.toLowerCase());
      return new RegExp(expr.value, "i").test(current);
    }
  }
}

export function buildQuery(input: string): (entry: LogEntry) => boolean {
  const trimmed = input.trim();
  if (!trimmed) return () => true;
  const expression = parse(tokenize(trimmed));
  return (entry: LogEntry) => evaluate(expression, entry);
}
