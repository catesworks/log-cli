import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AppConfig, NormalizedLevel } from "../types";

const normalizedLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "unknown",
]);

const configSchema = z.object({
  maxEntries: z.number().int().positive().default(50000),
  batchMs: z.number().int().positive().default(50),
  preserveAnsiText: z.boolean().default(true),
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        width: z.number().int().positive().default(18),
      }),
    )
    .default([
      { key: "time", label: "TIME", width: 24 },
      { key: "level", label: "LEVEL", width: 8 },
      { key: "message", label: "MESSAGE", width: 60 },
    ]),
  mainLineTemplate: z.string().optional(),
  placeholderFormat: z.string().optional(),
  contextPath: z.string().optional(),
  levelMap: z.record(z.string(), normalizedLevelSchema).default({}),
});

export const DEFAULT_CONFIG: AppConfig = configSchema.parse({});

function stripJsonComments(text: string): string {
  return text
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

// Explicit --config problems throw ConfigError; auto-discovered files that are
// malformed warn and yield defaults; missing auto-discovered files are silent.
async function readConfigFile(
  filePath: string,
  explicit: boolean,
  warn: (message: string) => void,
): Promise<AppConfig | null> {
  let message: string;
  try {
    return configSchema.parse(JSON.parse(stripJsonComments(await fs.readFile(filePath, "utf8"))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (!explicit) return null;
      message = `Config file not found: ${filePath}`;
    } else if (error instanceof z.ZodError) {
      message = `Invalid config ${filePath}: ${z.prettifyError(error)}`;
    } else if (error instanceof SyntaxError) {
      message = `Invalid JSON in config ${filePath}: ${error.message}`;
    } else {
      message = `Cannot read config ${filePath}: ${(error as Error).message}`;
    }
  }
  if (explicit) throw new ConfigError(message);
  warn(`${message}; using defaults`);
  return DEFAULT_CONFIG;
}

export async function loadConfig(
  cwd: string,
  explicitPath?: string,
  warn: (message: string) => void = message => process.stderr.write(`${message}\n`),
): Promise<AppConfig> {
  if (explicitPath) {
    return (await readConfigFile(explicitPath, true, warn)) ?? DEFAULT_CONFIG;
  }

  const candidates = [
    path.join(cwd, ".log.jsonc"),
    path.join(process.env.HOME ?? "", ".config", "log", "config.jsonc"),
  ];

  for (const candidate of candidates) {
    const loaded = await readConfigFile(candidate, false, warn);
    if (loaded) {
      return loaded;
    }
  }

  return DEFAULT_CONFIG;
}

export function normalizeMappedLevel(
  levelMap: Record<string, NormalizedLevel>,
  raw: string | number | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  return levelMap[String(raw)];
}
