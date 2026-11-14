import fs from "node:fs";
import path from "node:path";
import type { SourceSpec } from "../types";
import { createId } from "../utils/id";

export function resolveSources(input: {
  files: string[];
  url?: string;
  cmd?: string;
}): SourceSpec[] {
  const specs: SourceSpec[] = [];
  for (const file of input.files) {
    specs.push({
      id: createId("src"),
      label: path.basename(file),
      kind: "file",
      filePath: file,
    });
  }

  if (input.url !== undefined) {
    specs.push({
      id: createId("src"),
      label: input.url,
      kind: "url",
      url: input.url,
    });
  }

  if (input.cmd !== undefined) {
    specs.push({
      id: createId("src"),
      label: input.cmd,
      kind: "cmd",
      command: input.cmd,
    });
  }

  if (specs.length === 0 && !process.stdin.isTTY) {
    specs.push({
      id: createId("src"),
      label: "stdin",
      kind: "stdin",
    });
  }

  return specs;
}

export function validateSources(sources: SourceSpec[]): string | null {
  if (sources.length === 0) {
    return "No input sources provided. Pass files, --url, --cmd, or pipe stdin.";
  }

  for (const source of sources) {
    if (source.kind === "file" && source.filePath) {
      let stats: fs.Stats;
      try {
        stats = fs.statSync(source.filePath);
      } catch {
        return `File not found: ${source.filePath}`;
      }
      if (stats.isDirectory()) {
        return `Path is a directory, not a file: ${source.filePath}`;
      }
      // Regular files and named pipes (FIFOs) are both accepted
    }
    if (source.kind === "url" && source.url !== undefined) {
      let parsed: URL;
      try {
        parsed = new URL(source.url);
      } catch {
        return `Invalid URL: ${source.url}`;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return `Unsupported URL scheme (expected http or https): ${source.url}`;
      }
    }
    if (source.kind === "cmd" && !source.command?.trim()) {
      return "Command must not be empty (--cmd)";
    }
  }

  return null;
}
