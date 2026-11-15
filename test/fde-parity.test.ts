/**
 * AT-14 and NT-09 (WP-19): the desk's rendered text for case, residuals, settlement and world equals the values computed
 * independently from the raw ledger files (test/support/fde-parity.ts), and altering the adapter's classification mapping
 * is caught as PARITY_MISMATCH. Browser tests run the desk's own component in Chromium via Playwright; a missing
 * browser FAILS (it never skips), because a skipped parity gate is not a pass.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { readFdeSources } from "../src/adapters/fde-sources.ts";
import { expectedFromRaw, parity, renderedFields, type RawPaths } from "./support/fde-parity.ts";

setDefaultTimeout(60_000);
const FX = join(import.meta.dir, "fixtures/fde");
const sf = readdirSync(join(FX, "sf")).sort();
const rt = readdirSync(join(FX, "rt")).sort();
const pins = readdirSync(join(FX, "pin")).sort();

function chromeBinary(): string | null {
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  for (const entry of readdirSync(cache).filter((name) => name.startsWith("chromium-")).sort().reverse()) {
    for (const candidate of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(join(cache, entry, candidate))) return join(cache, entry, candidate);
  }
  return null;
}

/** Bundle the harness; `patch` rewrites src/adapters/fde-view.ts text before bundling (the NT-09 attack), the file on disk is never touched. */
async function bundle(patch?: (source: string) => string): Promise<string> {
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "support/fde-harness.tsx")], target: "browser",
    plugins: patch === undefined ? [] : [{
      name: "nt09-mapping-patch",
      setup(build) {
        build.onLoad({ filter: /adapters[\\/]fde-view\.ts$/ }, ({ path }) => ({ contents: patch(readFileSync(path, "utf8")), loader: "ts" }));
      },
    }],
  });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
  return built.outputs[0]!.text();
}

let browser: Browser;
let script = "";
beforeAll(async () => {
  const binary = chromeBinary();
  if (binary === null) throw new Error("PARITY_NOT_RUN: no Chromium build under ~/.cache/ms-playwright; the parity gate cannot run");
  script = await bundle();
  browser = await chromium.launch({ executablePath: binary, headless: true });
}, 120_000);
afterAll(async () => browser?.close());

async function mount(scriptText: string, paths: RawPaths): Promise<Page> {
  const sources = readFdeSources({
    ...(paths.caseDir === undefined ? {} : { caseDir: paths.caseDir }), ...(paths.comparePath === undefined ? {} : { comparePath: paths.comparePath }),
    ...(paths.derivePath === undefined ? {} : { derivePath: paths.derivePath }), ...(paths.pinPath === undefined ? {} : { pinPath: paths.pinPath }),
  });
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: scriptText });
  await page.evaluate(([s, ref]) => (window as any).mountEvidence(s, ref), [sources, paths.episodeRef] as const);
  await page.locator("#episode-evidence").waitFor();
  return page;
}

/** The fixture episodes come from two different producers, so the case's own episode is named explicitly. */
const episodeOf = (sfName: string): string =>
  JSON.parse(readFileSync(join(FX, "sf", sfName, "cases/case-0001/field-records.jsonl"), "utf8").split("\n")[0]!).payload.episode_ref;

const paths = (sfName: string, rtName: string, pinName: string): RawPaths => ({
  episodeRef: episodeOf(sfName), caseDir: join(FX, "sf", sfName, "cases/case-0001"), comparePath: join(FX, "rt", rtName, "compare.json"),
  derivePath: join(FX, "rt", rtName, "observed.json"), pinPath: join(FX, "pin", pinName),
});

describe("AT-14 the desk shows the source result", () => {
  for (const s of sf) for (const r of rt) for (const p of pins) {
    test(`AT-14 rendered text equals the ledger values: sf=${s} rt=${r} pin=${p}`, async () => {
      const raw = paths(s, r, p);
      const expected = expectedFromRaw(raw);
      const page = await mount(script, raw);
      const rendered = await renderedFields(page);
      expect(parity(expected, rendered)).toEqual([]);
      // ids and digests are present as text, not only as attributes
      expect(rendered["case.frozen_digest"]).toMatch(/^[0-9a-f]{64}$/);
      expect(rendered["case.episode_ref"]).toMatch(/^episode:.+@sha256:[0-9a-f]{64}$/);
      expect(rendered["rt.input_set"]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(rendered["rt.representation_id"]).toMatch(/^representation:/);
      expect(rendered["world.current"]).toMatch(/^world:.+@sha256:[0-9a-f]{64}$/);
      await page.close();
    });
  }

  test("AT-14 an absent source renders exactly 'not connected' and nothing green", async () => {
    const page = await mount(script, {});
    const rendered = await renderedFields(page);
    for (const key of ["case.state", "realitytrace.state", "settlement.state", "world.state"]) expect(rendered[key]).toBe("not connected");
    expect(await page.locator('[data-tone="affirmed"]').count()).toBe(0);
    expect(await page.locator("[data-field]").count()).toBe(4);
    await page.close();
  });

  test("AT-14 one absent source does not blank the others", async () => {
    const raw = paths("evaluated-settled", "contradicted", "baseline-only.json");
    const page = await mount(script, { episodeRef: raw.episodeRef!, caseDir: raw.caseDir!, pinPath: raw.pinPath! });
    const rendered = await renderedFields(page);
    expect(rendered["realitytrace.state"]).toBe("not connected");
    expect(rendered["case.frozen_digest"]).toMatch(/^[0-9a-f]{64}$/);
    expect(rendered["residual.0.class"]).toBeUndefined();
    await page.close();
  });

  test("AT-14 a source that fails its schema renders an invalid-source state and no partial data", async () => {
    const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "fde-invalid-"));
    try {
      const doc = JSON.parse(readFileSync(join(FX, "rt/contradicted/compare.json"), "utf8"));
      delete doc.residuals.structural[0].world_ref;
      writeFileSync(join(dir, "compare.json"), JSON.stringify(doc));
      const page = await mount(script, { comparePath: join(dir, "compare.json") });
      const rendered = await renderedFields(page);
      expect(rendered["realitytrace.state"]).toBe("invalid source");
      expect(rendered["rt.comparison_id"]).toBeUndefined();
      expect(rendered["residual.0.class"]).toBeUndefined();
      expect(await page.locator('div[role="alert"][data-source="realitytrace"]').innerText()).toContain("world_ref");
      await page.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("AT-14 undecided, unverified and decided states are textually and visibly distinct", async () => {
    const tone = async (rtName: string) => {
      const page = await mount(script, paths("evaluated-settled", rtName, "baseline-only.json"));
      const result = {
        tones: await page.$$eval("[data-residuals] > li", (n) => n.map((x) => x.getAttribute("data-tone"))),
        undecidedText: await page.locator("[data-undecided]").allInnerTexts(),
        glosses: await page.$$eval("[data-gloss]", (n) => n.map((x) => (x as HTMLElement).innerText)),
        tail: await page.locator('[data-field="rt.tail_status"]').innerText(),
        tailTone: await page.locator('tr:has([data-field="rt.tail_status"])').getAttribute("data-tone"),
      };
      await page.close();
      return result;
    };
    const insufficient = await tone("insufficient-silent-source");
    expect(insufficient.tones).toEqual(["undecided"]);
    expect(insufficient.undecidedText.join(" ")).toContain("Not decided");
    const contradicted = await tone("contradicted");
    expect(contradicted.tones).toEqual(["denied"]);
    expect(contradicted.undecidedText).toEqual([]);
    const confirmed = await tone("confirmed-undeclared-verified-tail");
    expect(confirmed.tones).toContain("affirmed");
    expect(confirmed.tones).toContain("undeclared");
    expect(confirmed.tail).toBe("verified_against_expected_head");
    expect(confirmed.tailTone).toBe("affirmed");
    const unverified = await tone("confirmed-undeclared-unverified-tail");
    expect(unverified.tail).toBe("unverified");
    expect(unverified.tailTone).toBe("undecided");
    expect(unverified.glosses.join(" ")).toContain("tail NOT verified");
    // an unresolved settlement is not shown as a decided one
    const page = await mount(script, paths("exploratory-settled-unresolved", "contradicted", "baseline-only.json"));
    expect(await page.locator('tr:has([data-field="settlement.result"])').getAttribute("data-tone")).toBe("undecided");
    expect(await page.locator('[data-field="settlement.result"]').innerText()).toBe("U");
    await page.close();
    const settled = await mount(script, paths("evaluated-settled", "contradicted", "baseline-only.json"));
    expect(await settled.locator('tr:has([data-field="settlement.result"])').getAttribute("data-tone")).toBe("decided");
    await settled.close();
  });
});

describe("NT-09 Horizon equals the programmatic result", () => {
  /** The attack: the adapter's classification mapping labels `contradicted` as `confirmed`. */
  const attack = (source: string): string => {
    const patched = source.replace('contradicted: { label: "contradicted"', 'contradicted: { label: "confirmed"');
    if (patched === source) throw new Error("NT-09 patch did not apply: the mapping text changed");
    return patched;
  };

  test("NT-09 altering the classification mapping makes the parity test report PARITY_MISMATCH", async () => {
    const raw = paths("evaluated-settled", "contradicted", "baseline-only.json");
    const expected = expectedFromRaw(raw);
    expect(expected["residual.0.class"]).toBe("contradicted");

    const clean = await mount(script, raw);
    expect(parity(expected, await renderedFields(clean))).toEqual([]);
    await clean.close();

    const attacked = await mount(await bundle(attack), raw);
    const mismatches = parity(expected, await renderedFields(attacked));
    await attacked.close();
    expect(mismatches).toEqual([{ code: "PARITY_MISMATCH", field: "residual.0.class", expected: "contradicted", rendered: "confirmed" }]);

    // restored: the bundle without the patch passes again, and the file on disk never contained the attack
    expect(readFileSync(join(import.meta.dir, "../src/adapters/fde-view.ts"), "utf8")).toContain('contradicted: { label: "contradicted"');
    const restored = await mount(await bundle(), raw);
    expect(parity(expected, await renderedFields(restored))).toEqual([]);
    await restored.close();
  });

  test("NT-09 the same attack is caught on every fixture that carries a contradicted residual", async () => {
    const mutated = await bundle(attack);
    for (const r of rt) {
      const raw = paths("evaluated-settled", r, "baseline-only.json");
      const expected = expectedFromRaw(raw);
      const hasContradicted = Object.entries(expected).some(([k, v]) => k.endsWith(".class") && v === "contradicted");
      const page = await mount(mutated, raw);
      const mismatches = parity(expected, await renderedFields(page));
      await page.close();
      expect(mismatches.length > 0).toBe(hasContradicted);
      for (const m of mismatches) expect(m.code).toBe("PARITY_MISMATCH");
    }
  });
});
