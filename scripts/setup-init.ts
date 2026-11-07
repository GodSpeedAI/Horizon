/**
 * `bun run scripts/setup-init.ts --setup <testing|production>`
 * Creates the setup root, SETUP.json, directories, horizon.toml and (once) secrets/presenting.key.
 * Re-running keeps what exists: the marker, the operator's horizon.toml and the presenting key.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { SETUP_NAMES, argValue, markerFor, recordSources, setupMapping, type SetupMapping, type SetupName } from "../src/config/setup.ts";

const repo = resolve(dirname(import.meta.path), "..");
const tomlString = (value: string) => JSON.stringify(value);

/** `config/horizon.toml` with this setup's port, plus the `[records]`, `[workshop]` and `[ui]` sections. */
export function renderSetupConfig(base: string, mapping: SetupMapping, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const lines = [base.replace(/^port = \d+$/m, `port = ${mapping.horizonPort}`).trimEnd(), ""];
  for (const source of recordSources(mapping)) {
    lines.push("[[records.sources]]", `name = ${tomlString(source.name)}`, `kind = ${tomlString(source.kind)}`);
    if (source.data_home !== undefined && source.state_home !== undefined) lines.push(`data_home = ${tomlString(source.data_home)}`, `state_home = ${tomlString(source.state_home)}`);
    lines.push("");
  }
  lines.push("[workshop]", `url = ${tomlString(`http://127.0.0.1:${mapping.workshopPort}`)}`, `key_path = ${tomlString(mapping.workbenchKey)}`, "");
  lines.push("[ui]", `timezone = ${tomlString(timezone)}`, "");
  return lines.join("\n");
}

export function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void): number {
  const name = argValue(args, "setup");
  if (!name || !(SETUP_NAMES as readonly string[]).includes(name)) {
    err(`setup-init: --setup must be ${SETUP_NAMES.join(" | ")}`);
    return 2;
  }
  const mapping = setupMapping(name as SetupName, env);
  for (const dir of [mapping.root, mapping.cell, mapping.workbench, mapping.secrets, mapping.exports, mapping.run]) mkdirSync(dir, { recursive: true });
  chmodSync(mapping.secrets, 0o700);
  if (!existsSync(mapping.marker)) writeFileSync(mapping.marker, `${JSON.stringify(markerFor(mapping), null, 2)}\n`);
  if (!existsSync(mapping.config)) {
    writeFileSync(mapping.config, renderSetupConfig(readFileSync(resolve(repo, "config", "horizon.toml"), "utf8"), mapping));
  }
  if (!existsSync(mapping.presentingKey)) {
    writeFileSync(mapping.presentingKey, randomBytes(32), { mode: 0o600 });
    chmodSync(mapping.presentingKey, 0o600);
  }
  out(`setup-init: ${mapping.name} ready at ${mapping.root}`);
  return 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2), process.env, console.log, console.error));
