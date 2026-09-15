import type React from "react";
import { openSync } from "node:fs";
import { ReadStream } from "node:tty";
import type { Root } from "./ink";

type RenderStreams = {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
};

type RenderContext = {
  renderOptions: {
    stdout: NodeJS.WriteStream;
    stderr: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
    patchConsole: false;
    exitOnCtrlC: true;
  };
  dispose: () => void;
};

type RenderContextOptions = {
  openInteractiveInput?: () => NodeJS.ReadStream | null;
};

function openControllingTty(): NodeJS.ReadStream | null {
  const devicePath = process.platform === "win32" ? "CONIN$" : "/dev/tty";
  try {
    return new ReadStream(openSync(devicePath, "r"));
  } catch {
    return null;
  }
}

export function buildRenderContext(
  streams: RenderStreams,
  options?: RenderContextOptions,
): RenderContext {
  const fallback =
    !streams.stdin.isTTY && streams.stdout.isTTY
      ? (options?.openInteractiveInput ?? openControllingTty)()
      : null;
  const input = fallback ?? streams.stdin;

  return {
    renderOptions: {
      stdout: streams.stdout,
      stderr: streams.stderr,
      stdin: input,
      patchConsole: false,
      exitOnCtrlC: true,
    },
    dispose() {
      if (fallback && typeof fallback.destroy === "function") {
        fallback.destroy();
      }
    },
  };
}

export function getRenderContext(): RenderContext {
  return buildRenderContext({
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
  });
}

export async function renderAndRun(root: Root, element: React.ReactNode): Promise<void> {
  root.render(element);
  await root.waitUntilExit();
}

export async function exitWithMessage(message: string): Promise<never> {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
