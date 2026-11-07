/**
 * Exports of labels and of one comparison, written under `<setup root>/exports/`.
 *
 * Stand-ins come from `presenting.ts`, the same function the page uses. While Presenting is on, an export always uses them.
 * With Presenting off the request must say `standins=0` or `standins=1`; a request with neither is refused (400), and the UI offers 1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunLabel } from "../capabilities/labels.ts";
import type { CompareView } from "../ui/workspace/compare-model.ts";
import { applyStandIns } from "../ui/workspace/presenting.ts";

export type StandInChoice = { readonly ok: true; readonly standins: boolean } | { readonly ok: false; readonly status: 400; readonly message: string };

export function chooseStandIns(presenting: boolean, param: string | null): StandInChoice {
  if (presenting) return { ok: true, standins: true };
  if (param === "0") return { ok: true, standins: false };
  if (param === "1") return { ok: true, standins: true };
  return { ok: false, status: 400, message: "EXPORT: say standins=0 or standins=1 (the desk offers 1, which hides project names)" };
}

export interface ExportInput {
  readonly kind: "labels" | "comparison";
  readonly labels: readonly RunLabel[];
  readonly comparison: CompareView | null;
  readonly standins: boolean;
  readonly key: string | Uint8Array;
  readonly names: readonly string[];
  readonly now: Date;
}

/** Labels grouped by the first thing that went wrong, so the commonest failure is visible (design 8.2). */
export function groupLabels(labels: readonly RunLabel[]): { first_failure: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const label of labels) if (label.verdict === "fail") counts.set(label.first_failure || "(no note)", (counts.get(label.first_failure || "(no note)") ?? 0) + 1);
  return [...counts].map(([first_failure, count]) => ({ first_failure, count })).sort((a, b) => b.count - a.count || a.first_failure.localeCompare(b.first_failure));
}

export function buildExport(input: ExportInput): { readonly name: string; readonly body: string } {
  const stamp = input.now.toISOString().replace(/[:.]/g, "-");
  const doc =
    input.kind === "labels"
      ? { schema: "horizon.labels-export/1", exported_at: input.now.toISOString(), labels: input.labels, failures_by_first_thing: groupLabels(input.labels) }
      : { schema: "horizon.comparison-export/1", exported_at: input.now.toISOString(), comparison: input.comparison };
  const shown = input.standins ? applyStandIns(doc, input.key, input.names) : doc;
  return { name: `${input.kind}-${stamp}${input.standins ? "-standins" : ""}.json`, body: `${JSON.stringify(shown, null, 2)}\n` };
}

/** Writes the file (mode 0600) and returns its path. */
export function writeExport(dir: string, built: { readonly name: string; readonly body: string }): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, built.name);
  writeFileSync(path, built.body, { mode: 0o600 });
  return path;
}
