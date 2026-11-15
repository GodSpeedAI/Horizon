/**
 * Builds the Horizon server as one self-contained binary per target, plus the read-only resource tree it reads.
 *
 *   bun run build:sidecar [--target <rust-triple>] [--skip-desk] [--no-tauri]
 *
 * Output:
 *   .tmp/sidecar/<triple>/horizon-server[.exe]      the compiled server (`horizon-server serve ...`)
 *   .tmp/sidecar/<triple>/horizon-resources/        config/, domain/, contracts/, dist/desk/ (read only at run time)
 *
 * and, unless --no-tauri, the same two staged where Tauri bundles them:
 *   src-tauri/binaries/horizon-server-<triple>[.exe]   (externalBin naming)
 *   .tmp/desktop/horizon-resources/                    (tauri.conf.json maps it to the bundle's resource dir)
 *
 * Everything generated lands under `.tmp/` (ignored by git): the resource tree holds `.sea` files, and `just boundaries` rejects a
 * second copy of the semantic model anywhere else in the repository.
 *
 * Builds are native: the target must be the host's. Bun can cross-compile, but a binary nobody ran on its target is not a build
 * this repository will claim.
 */
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildDesk } from "./build-desk.ts";

const root = join(import.meta.dir, "..");

/** Rust target triple -> Bun compile target and file suffix. */
const TARGETS: Readonly<Record<string, { readonly bun: string; readonly exe: string }>> = {
  "x86_64-unknown-linux-gnu": { bun: "bun-linux-x64", exe: "" },
  "aarch64-unknown-linux-gnu": { bun: "bun-linux-arm64", exe: "" },
  "x86_64-pc-windows-msvc": { bun: "bun-windows-x64", exe: ".exe" },
  "aarch64-apple-darwin": { bun: "bun-darwin-arm64", exe: "" },
  "x86_64-apple-darwin": { bun: "bun-darwin-x64", exe: "" },
};

export function hostTriple(platform: string = process.platform, arch: string = process.arch): string {
  const key = `${platform}/${arch}`;
  const triple = { "linux/x64": "x86_64-unknown-linux-gnu", "linux/arm64": "aarch64-unknown-linux-gnu", "win32/x64": "x86_64-pc-windows-msvc", "darwin/arm64": "aarch64-apple-darwin", "darwin/x64": "x86_64-apple-darwin" }[key];
  if (triple === undefined) throw new Error(`build-sidecar: no supported target for ${key}`);
  return triple;
}

/** The files the server reads at run time, copied (never linked: Windows and installers do not carry symlinks). */
export function stageResources(out: string): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "config"), { recursive: true });
  copyFileSync(join(root, "config", "horizon.toml"), join(out, "config", "horizon.toml"));
  cpSync(join(root, ".sea", "interaction"), join(out, "domain"), { recursive: true, dereference: true });
  cpSync(join(root, "contracts"), join(out, "contracts"), { recursive: true, dereference: true });
  cpSync(join(root, "dist", "desk"), join(out, "dist", "desk"), { recursive: true });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const given = args.indexOf("--target") === -1 ? undefined : args[args.indexOf("--target") + 1];
  const host = hostTriple();
  const triple = given ?? host;
  const target = TARGETS[triple];
  if (target === undefined) throw new Error(`build-sidecar: unsupported target '${triple}'`);
  if (triple !== host) throw new Error(`build-sidecar: target ${triple} is not this host (${host}); builds are native`);

  if (!args.includes("--skip-desk") || !existsSync(join(root, "dist", "desk", "app.js"))) await buildDesk();

  const dir = join(root, ".tmp", "sidecar", triple);
  const binary = join(dir, `horizon-server${target.exe}`);
  mkdirSync(dir, { recursive: true });
  const compiled = Bun.spawnSync(["bun", "build", "--compile", `--target=${target.bun}`, join(root, "src", "main.ts"), "--outfile", binary], { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (compiled.exitCode !== 0) throw new Error(`build-sidecar: bun build --compile failed (${compiled.exitCode})`);
  stageResources(join(dir, "horizon-resources"));
  console.log(`built ${binary}`);

  if (!args.includes("--no-tauri")) {
    const binaries = join(root, "src-tauri", "binaries");
    mkdirSync(binaries, { recursive: true });
    copyFileSync(binary, join(binaries, `horizon-server-${triple}${target.exe}`));
    stageResources(join(root, ".tmp", "desktop", "horizon-resources"));
    // Linux bundles carry the server as a resource: linuxdeploy cannot inspect a compiled Bun executable (see tauri.linux.conf.json).
    mkdirSync(join(root, ".tmp", "desktop", "server"), { recursive: true });
    copyFileSync(binary, join(root, ".tmp", "desktop", "server", `horizon-server${target.exe}`));
    console.log(`staged src-tauri/binaries/horizon-server-${triple}${target.exe} and .tmp/desktop/horizon-resources`);
  }
}
