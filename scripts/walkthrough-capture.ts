/**
 * `bun run scripts/walkthrough-capture.ts --stage 1 --sessions matched=<id>,contradicted=<id>,unrecorded=<id>
 *    --repo <repo_id> --day YYYY-MM-DD [--source personal] [--base http://127.0.0.1:4339] [--out <dir>]`
 * Fetches the comparison page of each named session from the running desk, and the labels export, and saves them into
 * `.agents/reports/v2-build/stage-<N>/` as compare-<name>.html, labels.json and walkthrough.md.
 * Refuses to save a page unless Presenting is on (the pages are meant to be shown). Read-only: it labels nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argValue, setupMapping } from "../src/config/setup.ts";

export interface Captured {
  readonly name: string;
  readonly session: string;
  readonly file: string;
  readonly outcome: string;
  readonly labelled: boolean;
  readonly presenting: boolean;
}

export function parseSessions(text: string): { name: string; session: string }[] {
  return text.split(",").map((pair) => {
    const at = pair.indexOf("=");
    if (at < 1 || at === pair.length - 1) throw new Error(`--sessions entry '${pair}' must be name=id`);
    return { name: pair.slice(0, at), session: pair.slice(at + 1) };
  });
}

/** What the saved page itself says, read from its markup attributes. */
export function summarizePage(html: string): { outcome: string; labelled: boolean; presenting: boolean } {
  return {
    outcome: /<h2 id="cmp-h">[\s\S]*?data-outcome="([^"]+)"/.exec(html)?.[1] ?? "no comparison on the page",
    labelled: /data-current-label="(pass|fail)"/.test(html),
    presenting: html.includes('data-presenting="on"'),
  };
}

export async function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void, fetcher: typeof fetch = fetch): Promise<number> {
  const stage = argValue(args, "stage");
  const sessionsArg = argValue(args, "sessions");
  const repo = argValue(args, "repo");
  const day = argValue(args, "day");
  if (stage !== "1" || !sessionsArg || !repo || !day) {
    err("walkthrough-capture: --stage 1 --sessions name=id,... --repo <repo_id> --day YYYY-MM-DD");
    return 2;
  }
  const base = (argValue(args, "base") ?? `http://127.0.0.1:${setupMapping("testing", env).horizonPort}`).replace(/\/+$/, "");
  const source = argValue(args, "source") ?? "personal";
  const dir = argValue(args, "out") ?? join(import.meta.dir, "..", ".agents", "reports", "v2-build", `stage-${stage}`);
  mkdirSync(dir, { recursive: true });
  const captured: Captured[] = [];
  for (const { name, session } of parseSessions(sessionsArg)) {
    const query = new URLSearchParams({ source, repo, day, session });
    const res = await fetcher(`${base}/workspace/compare?${query}`);
    const html = await res.text();
    if (!res.ok) {
      err(`walkthrough-capture: ${name}: HTTP ${res.status}`);
      return 1;
    }
    const summary = summarizePage(html);
    if (!summary.presenting) {
      err(`walkthrough-capture: Presenting is off on the page for ${name}; switch it on first (nothing saved for it)`);
      return 1;
    }
    const file = `compare-${name}.html`;
    writeFileSync(join(dir, file), html);
    captured.push({ name, session, file, ...summary });
  }
  const labels = await fetcher(`${base}/workspace/export?kind=labels&standins=1`);
  writeFileSync(join(dir, "labels.json"), await labels.text());
  const lines = [
    "# Stage 1 walkthrough",
    "",
    `Captured from the running desk (${source}, ${day}) with Presenting on. Session ids are shown; project names are not.`,
    "",
    "| Name | Session | Outcome on the page | Labelled | Page |",
    "| --- | --- | --- | --- | --- |",
    ...captured.map((c) => `| ${c.name} | ${c.session} | ${c.outcome} | ${c.labelled ? "yes" : "NO"} | ${c.file} |`),
    "",
  ];
  writeFileSync(join(dir, "walkthrough.md"), lines.join("\n"));
  out(`saved ${captured.length} page(s), labels.json and walkthrough.md in ${dir}`);
  const unlabelled = captured.filter((c) => !c.labelled);
  if (unlabelled.length > 0) err(`walkthrough-capture: not yet labelled: ${unlabelled.map((c) => c.name).join(", ")}`);
  return unlabelled.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(await run(process.argv.slice(2), process.env, console.log, console.error));
