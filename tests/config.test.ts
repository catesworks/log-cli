import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConfigError, DEFAULT_CONFIG, loadConfig } from "../src/lib/config.ts";

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const directory = createdDirs.pop();
    if (directory) {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
});

async function makeTempDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "log-cli-config-"));
  createdDirs.push(directory);
  return directory;
}

describe("loadConfig", () => {
  test("loads .log.jsonc from cwd before home config", async () => {
    const cwd = await makeTempDir();
    const home = await makeTempDir();
    await fs.mkdir(path.join(home, ".config", "log"), { recursive: true });
    await fs.writeFile(
      path.join(home, ".config", "log", "config.jsonc"),
      JSON.stringify({ mainLineTemplate: "HOME" }),
      "utf8",
    );
    await fs.writeFile(
      path.join(cwd, ".log.jsonc"),
      JSON.stringify({ mainLineTemplate: "CWD" }),
      "utf8",
    );

    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const config = await loadConfig(cwd);
      expect(config.mainLineTemplate).toBe("CWD");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  test("prefers an explicit --config path over discovered config files", async () => {
    const cwd = await makeTempDir();
    const explicit = path.join(cwd, "custom.jsonc");
    await fs.writeFile(
      path.join(cwd, ".log.jsonc"),
      JSON.stringify({ mainLineTemplate: "CWD" }),
      "utf8",
    );
    await fs.writeFile(
      explicit,
      JSON.stringify({ mainLineTemplate: "EXPLICIT", levelMap: { "30": "info" } }),
      "utf8",
    );

    const config = await loadConfig(cwd, explicit);
    expect(config.mainLineTemplate).toBe("EXPLICIT");
    expect(config.levelMap["30"]).toBe("info");
  });

  test("explicit --config that is missing throws ConfigError naming the path", async () => {
    const cwd = await makeTempDir();
    const missing = path.join(cwd, "missing.jsonc");
    const promise = loadConfig(cwd, missing);
    await expect(promise).rejects.toBeInstanceOf(ConfigError);
    await expect(loadConfig(cwd, missing)).rejects.toThrow(`Config file not found: ${missing}`);
  });

  test("explicit --config with invalid JSON throws ConfigError naming the path", async () => {
    const cwd = await makeTempDir();
    const bad = path.join(cwd, "bad.jsonc");
    await fs.writeFile(bad, "{ not json", "utf8");
    await expect(loadConfig(cwd, bad)).rejects.toThrow(`Invalid JSON in config ${bad}`);
  });

  test("explicit --config failing schema validation throws ConfigError naming the path", async () => {
    const cwd = await makeTempDir();
    const wrongType = path.join(cwd, "wrongtype.jsonc");
    await fs.writeFile(wrongType, JSON.stringify({ maxEntries: "lots" }), "utf8");
    await expect(loadConfig(cwd, wrongType)).rejects.toThrow(`Invalid config ${wrongType}`);
  });

  test("malformed auto-discovered .log.jsonc warns and falls back to defaults", async () => {
    const cwd = await makeTempDir();
    const home = await makeTempDir();
    await fs.writeFile(path.join(cwd, ".log.jsonc"), "{ not json", "utf8");
    const warnings: string[] = [];
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const config = await loadConfig(cwd, undefined, message => warnings.push(message));
      expect(config).toEqual(DEFAULT_CONFIG);
    } finally {
      process.env.HOME = originalHome;
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(path.join(cwd, ".log.jsonc"));
  });

  test("no config anywhere is silent and returns defaults", async () => {
    const cwd = await makeTempDir();
    const home = await makeTempDir();
    const warnings: string[] = [];
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(await loadConfig(cwd, undefined, message => warnings.push(message))).toEqual(DEFAULT_CONFIG);
    } finally {
      process.env.HOME = originalHome;
    }
    expect(warnings).toEqual([]);
  });
});
