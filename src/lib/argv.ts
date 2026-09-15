type OptionSpec = {
  name: string;
  takesValue: boolean;
};

const OPTION_SPECS: OptionSpec[] = [
  { name: "--config", takesValue: true },
  { name: "--url", takesValue: true },
  { name: "--cmd", takesValue: true },
  { name: "--max", takesValue: true },
  { name: "--batch-ms", takesValue: true },
  { name: "--merge", takesValue: false },
  { name: "--filter", takesValue: true },
  { name: "--query", takesValue: true },
  { name: "--reverse", takesValue: false },
  { name: "--no-follow", takesValue: false },
  { name: "--summary-json", takesValue: false },
  { name: "--summary-text", takesValue: false },
  { name: "--help", takesValue: false },
  { name: "-h", takesValue: false },
];

const OPTION_INDEX = new Map(OPTION_SPECS.map(spec => [spec.name, spec] as const));

export function moveTrailingOptionsBeforePositionals(args: string[]): string[] {
  const files: string[] = [];
  const options: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const spec = OPTION_INDEX.get(token);
    if (!spec) {
      files.push(token);
      continue;
    }
    options.push(token);
    if (spec.takesValue) {
      const next = args[index + 1];
      if (next !== undefined) {
        options.push(next);
        index += 1;
      }
    }
  }

  return [...options, ...files];
}

export function parseTopLevelArgs(args: string[]): {
  files: string[];
  options: Record<string, string | boolean | undefined>;
} {
  const normalized = moveTrailingOptionsBeforePositionals(args);
  const files: string[] = [];
  const options: Record<string, string | boolean | undefined> = {};

  for (let index = 0; index < normalized.length; index += 1) {
    const token = normalized[index];
    const spec = OPTION_INDEX.get(token);
    if (!spec) {
      files.push(token);
      continue;
    }

    const key = spec.name.replace(/^--/, "").replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (spec.takesValue) {
      const next = normalized[index + 1];
      options[key] = next;
      index += 1;
    } else {
      options[key] = token.startsWith("--no-") ? false : true;
    }
  }

  return { files, options };
}
