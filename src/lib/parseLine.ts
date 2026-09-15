import type { AppConfig, LogEntry, NormalizedLevel } from "../types";
import { normalizeMappedLevel } from "./config";
import { getPathValue } from "./pathValue";
import { createId } from "../utils/id";

type ParseContext = {
  sourceId: string;
  sourceLabel?: string;
  lineNumber: number;
};

type ParseLineOptions = Pick<AppConfig, "levelMap" | "placeholderFormat" | "contextPath">;

const TIME_FIELDS = ["time", "timestamp", "ts"];
const LEVEL_FIELDS = ["level", "severity"];
const MESSAGE_FIELDS = ["msg", "message"];

function normalizeLevel(raw: string | undefined): NormalizedLevel | string {
  if (!raw) return "unknown";
  const value = raw.toLowerCase();
  if (["trace", "debug", "info", "warn", "error", "fatal"].includes(value)) {
    return value;
  }
  if (value === "warning") return "warn";
  return raw;
}

function tryTimestamp(value: unknown): { text?: string; epoch?: number } {
  if (typeof value === "number") {
    const epoch = value > 10_000_000_000 ? value : value * 1000;
    return { text: new Date(epoch).toISOString(), epoch };
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== "") {
      const epoch = numeric > 10_000_000_000 ? numeric : numeric * 1000;
      return { text: new Date(epoch).toISOString(), epoch };
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return { text: new Date(parsed).toISOString(), epoch: parsed };
    }
  }

  return {};
}

function previewFromJson(json: unknown): string {
  try {
    const text = JSON.stringify(json);
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  } catch {
    return "[unserializable json]";
  }
}

function addIndexedFields(
  target: Record<string, string>,
  prefix: string,
  value: unknown,
): void {
  const key = prefix.toLowerCase();
  if (typeof value === "string") {
    target[key] = value;
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    target[key] = String(value);
    return;
  }
  if (Array.isArray(value)) {
    target[key] = previewFromJson(value);
    value.forEach((item, index) => addIndexedFields(target, `${prefix}.${index}`, item));
    return;
  }
  if (value && typeof value === "object") {
    target[key] = previewFromJson(value);
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      addIndexedFields(target, `${prefix}.${childKey}`, childValue);
    }
  }
}

function extractFromRecord(record: Record<string, unknown>) {
  let timeText: string | undefined;
  let timestampMs: number | undefined;
  let levelRaw: string | undefined;
  let message = "";

  for (const field of TIME_FIELDS) {
    if (field in record) {
      const parsed = tryTimestamp(record[field]);
      timeText = parsed.text;
      timestampMs = parsed.epoch;
      if (timeText) break;
    }
  }

  for (const field of LEVEL_FIELDS) {
    const value = record[field];
    if (typeof value === "string" || typeof value === "number") {
      levelRaw = String(value);
      break;
    }
  }

  for (const field of MESSAGE_FIELDS) {
    const value = record[field];
    if (typeof value === "string") {
      message = value;
      break;
    }
  }

  if (!message) {
    message = previewFromJson(record);
  }

  const fieldIndex: Record<string, string> = {
    message,
  };

  for (const [key, value] of Object.entries(record)) {
    addIndexedFields(fieldIndex, key, value);
  }

  if (timeText) fieldIndex.time = timeText;
  if (levelRaw) fieldIndex.level = levelRaw;

  return {
    timeText,
    timestampMs,
    levelRaw,
    message,
    fieldIndex,
  };
}

function substituteMessagePlaceholders(
  message: string,
  record: Record<string, unknown>,
  options?: ParseLineOptions,
): string {
  if (!options?.placeholderFormat || !options.contextPath) {
    return message;
  }

  const [prefix, suffix] = options.placeholderFormat.split("key");
  if (prefix === undefined || suffix === undefined) {
    return message;
  }

  const context = getPathValue(record, options.contextPath);
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return message;
  }

  const pattern = new RegExp(
    `${escapeRegExp(prefix)}(.+?)${escapeRegExp(suffix)}`,
    "g",
  );

  return message.replace(pattern, (full, key: string) => {
    const value = (context as Record<string, unknown>)[key];
    return value === undefined ? full : String(value);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMaybePrefixedJson(line: string): { prefix?: string; jsonText?: string } {
  const separator = " | ";
  const index = line.indexOf(separator);
  if (index === -1) {
    return { jsonText: line };
  }

  const prefix = line.slice(0, index).trim();
  const rest = line.slice(index + separator.length).trim();
  if (rest.startsWith("{") || rest.startsWith("[")) {
    return { prefix, jsonText: rest };
  }

  return { jsonText: line };
}

export function parseLine(
  line: string,
  context: ParseContext,
  options?: ParseLineOptions,
): LogEntry {
  const { prefix, jsonText } = parseMaybePrefixedJson(line);
  let jsonValue: unknown;

  if (jsonText) {
    try {
      jsonValue = JSON.parse(jsonText);
    } catch {
      jsonValue = undefined;
    }
  }

  if (jsonValue !== undefined) {
    const record =
      jsonValue !== null && typeof jsonValue === "object"
        ? (jsonValue as Record<string, unknown>)
        : { value: jsonValue };

    const extracted = extractFromRecord(record);
    const mappedLevel =
      normalizeMappedLevel(options?.levelMap ?? {}, extracted.levelRaw) ?? extracted.levelRaw;
    const substitutedMessage = substituteMessagePlaceholders(
      extracted.message,
      record,
      options,
    );
    const searchPieces = [
      prefix,
      extracted.timeText,
      mappedLevel,
      substitutedMessage,
      previewFromJson(jsonValue),
    ].filter(Boolean);

    return {
      id: createId("entry"),
      sourceId: context.sourceId,
      sourceLabel: context.sourceLabel,
      lineNumber: context.lineNumber,
      raw: line,
      prefix,
      kind: "json",
      jsonValue,
      message: substitutedMessage,
      preview: substitutedMessage,
      text: line,
      timeText: extracted.timeText,
      timestampMs: extracted.timestampMs,
      levelRaw: mappedLevel,
      levelNormalized: normalizeLevel(mappedLevel),
      fieldIndex: prefix
        ? { ...extracted.fieldIndex, message: substitutedMessage, level: mappedLevel ?? "", prefix }
        : { ...extracted.fieldIndex, message: substitutedMessage, level: mappedLevel ?? "" },
      searchText: searchPieces.join(" ").toLowerCase(),
    };
  }

  const searchText = [prefix, line].filter(Boolean).join(" ").toLowerCase();
  return {
    id: createId("entry"),
    sourceId: context.sourceId,
    sourceLabel: context.sourceLabel,
    lineNumber: context.lineNumber,
    raw: line,
    prefix,
    kind: "text",
    message: line.length > 140 ? `${line.slice(0, 137)}...` : line,
    preview: line,
    text: line,
    levelNormalized: "unknown",
    fieldIndex: prefix ? { message: line, prefix } : { message: line },
    searchText,
  };
}
