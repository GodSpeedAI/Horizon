/** WP-68: scripts/release-qualification.py decides what a release may claim. Runs the real script on synthetic records. */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "release-qualification.py");
const SHA = "a".repeat(40);
const TAG = "horizon-v0.1.0";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const platformsFile = (dir: string, ids: string[]) => {
  const p = join(dir, "platforms.json");
  writeFileSync(p, JSON.stringify({ platforms: ids.map((id) => ({ id, label: id, claimed: true, required_steps: ["checksums"], ...(id.endsWith("-jetson") ? { build_platform: "linux-x64" } : {}) })) }));
  return p;
};
const record = (platform: string, files: Record<string, string>, over: Record<string, unknown> = {}) => ({
  schema: "horizon.qualification/1", platform, status: "QUALIFIED", required_steps: ["checksums"], commit: SHA,
  host: { real_hardware: platform.endsWith("-jetson") },
  artifacts: Object.entries(files).map(([name, body]) => ({ name, sha256: sha(body) })),
  steps: [{ name: "checksums", status: "PASS", reason: "" }], ...over,
});
const py = (...args: string[]) => Bun.spawnSync(["python3", "-I", SCRIPT, ...args]);

/** A built linux-x64 artifact plus its record, in the layout the workflow downloads. */
function fixture(over: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "relq-"));
  const files = { "horizon-desktop-unqualified_Horizon_0.1.0_amd64.deb": "deb", "horizon-headless-unqualified-x86_64-unknown-linux-gnu.tar.gz": "tgz" };
  const art = join(dir, "dist", "horizon-unqualified-linux-x64");
  mkdirSync(art, { recursive: true });
  for (const [n, b] of Object.entries(files)) writeFileSync(join(art, n), b);
  mkdirSync(join(dir, "records", "horizon-qualification-linux-x64"), { recursive: true });
  writeFileSync(join(dir, "records", "horizon-qualification-linux-x64", "linux-x64.json"), JSON.stringify(record("linux-x64", files, over)));
  return { dir, files, platforms: platformsFile(dir, ["linux-x64", "linux-arm64-jetson"]) };
}
const assemble = (f: ReturnType<typeof fixture>, commit = SHA) =>
  py("assemble", "--platforms", f.platforms, "--dist", join(f.dir, "dist"), "--records", join(f.dir, "records"), "--commit", commit, "--tag", TAG, "--out", join(f.dir, "out"));

describe("assemble", () => {
  test("a QUALIFIED platform drops 'unqualified'; the missing Jetson keeps the release a prerelease", () => {
    const f = fixture();
    expect(assemble(f).exitCode).toBe(0);
    const out = readdirSync(join(f.dir, "out"));
    expect(out).toContain("horizon-desktop_Horizon_0.1.0_amd64.deb");
    expect(out).toContain("horizon-headless-x86_64-unknown-linux-gnu.tar.gz");
    expect(out.some((n) => n.includes("unqualified"))).toBe(false);
    const q = JSON.parse(readFileSync(join(f.dir, "out", "qualification.json"), "utf8"));
    expect(q.release_ready).toBe(false);
    expect(q.platforms.find((p: { id: string }) => p.id === "linux-arm64-jetson").status).toBe("NOT QUALIFIED");
    expect(readFileSync(join(f.dir, "out", "QUALIFICATION.md"), "utf8")).toContain("real-hardware record");
    expect(readFileSync(join(f.dir, "out", "SHA256SUMS.linux-x64"), "utf8")).toContain(`${sha("deb")}  horizon-desktop_Horizon_0.1.0_amd64.deb`);
  });
  test("a platform that is not QUALIFIED keeps the unqualified label and lists why", () => {
    const f = fixture({ status: "PARTIAL", steps: [{ name: "checksums", status: "NOT_RUN", reason: "no root" }] });
    expect(assemble(f).exitCode).toBe(0);
    expect(readdirSync(join(f.dir, "out"))).toContain("horizon-desktop-unqualified_Horizon_0.1.0_amd64.deb");
    expect(readFileSync(join(f.dir, "out", "QUALIFICATION.md"), "utf8")).toContain("checksums NOT_RUN: no root");
  });
  test("a record for another commit fails the run", () => {
    const f = fixture();
    const r = assemble(f, "b".repeat(40));
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString()).toContain("is not the release commit");
  });
  test("an artifact that differs from what the record qualified fails the run", () => {
    const f = fixture();
    writeFileSync(join(f.dir, "dist", "horizon-unqualified-linux-x64", "horizon-desktop-unqualified_Horizon_0.1.0_amd64.deb"), "tampered");
    expect(assemble(f).exitCode).toBe(1);
  });
});

describe("assemble with hardware evidence", () => {
  test("a Jetson record is checked against the assembled assets and kept in the output", () => {
    const f = fixture();
    const jf = { "horizon-desktop_Horizon_0.1.0_amd64.deb": "deb", "horizon-headless-x86_64-unknown-linux-gnu.tar.gz": "tgz" };
    writeFileSync(join(f.dir, "records", "jetson.json"), JSON.stringify(record("linux-arm64-jetson", jf)));
    expect(assemble(f).exitCode).toBe(0);
    expect(readdirSync(join(f.dir, "out"))).toContain("qualification-linux-arm64-jetson.json");
    expect(JSON.parse(readFileSync(join(f.dir, "out", "qualification.json"), "utf8")).release_ready).toBe(true);
    writeFileSync(join(f.dir, "records", "jetson.json"), JSON.stringify(record("linux-arm64-jetson", { ...jf, "horizon-desktop_Horizon_0.1.0_amd64.deb": "evil" })));
    expect(assemble(f).exitCode).toBe(1);
  });
});

describe("promote", () => {
  function released() {
    const f = fixture();
    assemble(f);
    const out = join(f.dir, "out");
    const rel = join(f.dir, "rel");
    mkdirSync(rel);
    // The release assets as published: the hosted record and the combined sums.
    writeFileSync(join(rel, "qualification-linux-x64.json"), readFileSync(join(out, "qualification-linux-x64.json")));
    writeFileSync(join(rel, "SHA256SUMS.linux-x64"), readFileSync(join(out, "SHA256SUMS.linux-x64")));
    // Jetson evidence, made against the released (renamed) arm64 assets.
    const jf = { "horizon-desktop_Horizon_0.1.0_amd64.deb": "deb", "horizon-headless-x86_64-unknown-linux-gnu.tar.gz": "tgz" };
    return { f, rel, jf };
  }
  const promote = (r: ReturnType<typeof released>, commit = SHA) =>
    py("promote", "--platforms", r.f.platforms, "--records", r.rel, "--sums-dir", r.rel, "--commit", commit, "--tag", TAG,
      "--out-json", join(r.f.dir, "p.json"), "--out-md", join(r.f.dir, "p.md"));

  test("without the Jetson record the release stays not ready", () => {
    const r = released();
    expect(promote(r).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(r.f.dir, "p.json"), "utf8")).release_ready).toBe(false);
  });
  test("a valid real-hardware record makes the release ready", () => {
    const r = released();
    writeFileSync(join(r.rel, "qualification-linux-arm64-jetson.json"), JSON.stringify(record("linux-arm64-jetson", r.jf)));
    expect(promote(r).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(r.f.dir, "p.json"), "utf8")).release_ready).toBe(true);
    const notes = py("notes", "--json", join(r.f.dir, "p.json"), "--attested", "true").stdout.toString();
    expect(notes).toContain("<!-- readiness:begin -->");
    expect(notes).toContain("<!-- provenance:attested -->");
  });
  test("Jetson evidence that is not real hardware, for another commit, or for other bytes is rejected", () => {
    for (const [over, files, commit] of [
      [{ host: { real_hardware: false } }, undefined, SHA],
      [{ commit: "c".repeat(40) }, undefined, SHA],
      [{}, { "horizon-desktop_Horizon_0.1.0_amd64.deb": "other bytes", "horizon-headless-x86_64-unknown-linux-gnu.tar.gz": "tgz" }, SHA],
      [{}, { "horizon-desktop_Horizon_0.1.0_amd64.deb": "deb" }, SHA], // does not cover the platform's assets
      [{ status: "QUALIFIED", steps: [{ name: "checksums", status: "NOT_RUN", reason: "" }] }, undefined, SHA], // verdict not backed by steps
    ] as const) {
      const r = released();
      writeFileSync(join(r.rel, "qualification-linux-arm64-jetson.json"), JSON.stringify(record("linux-arm64-jetson", files ?? r.jf, over)));
      expect(promote(r, commit).exitCode).toBe(1);
    }
  });
});
