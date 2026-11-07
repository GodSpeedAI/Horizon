/**
 * `bun run scripts/setup-env.ts <name> [--service workbench|horizon|connector]`
 * Prints `KEY=VALUE` lines for `eval "$(...)"` (values are shell-quoted).
 */
import { SETUP_NAMES, SETUP_SERVICES, argValue, setupEnv, type SetupName, type SetupService } from "../src/config/setup.ts";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

export function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void): number {
  const name = args.find((a) => !a.startsWith("--") && a !== argValue(args, "service"));
  if (!name || !(SETUP_NAMES as readonly string[]).includes(name)) {
    err(`setup-env: expected a setup name (${SETUP_NAMES.join(" | ")})`);
    return 2;
  }
  const service = argValue(args, "service");
  if (service !== undefined && !(SETUP_SERVICES as readonly string[]).includes(service)) {
    err(`setup-env: --service must be ${SETUP_SERVICES.join(" | ")}`);
    return 2;
  }
  for (const [key, value] of Object.entries(setupEnv(name as SetupName, service as SetupService | undefined, env))) {
    out(`${key}=${shellQuote(value)}`);
  }
  return 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2), process.env, console.log, console.error));
