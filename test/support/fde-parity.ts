/**
 * The parity oracle for AT-14 / NT-09. `expectedFromRaw` computes the values the desk must show STRAIGHT FROM the
 * raw ledger and result files: it imports nothing from src/adapters, parses the JSON itself and applies no
 * classification (it copies the producer's words). `parity` compares them with the rendered DOM text.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RawPaths { readonly caseDir?: string; readonly comparePath?: string; readonly derivePath?: string; readonly pinPath?: string; readonly episodeRef?: string }
export interface ParityMismatch { readonly code: "PARITY_MISMATCH"; readonly field: string; readonly expected: string; readonly rendered: string | null }

/** Canonical text: Unicode NFC, runs of whitespace collapsed to one space, trimmed. */
export const canon = (text: string): string => text.normalize("NFC").replace(/\s+/g, " ").trim();

const lines = (path: string): any[] => readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
const json = (path: string): any => JSON.parse(readFileSync(path, "utf8"));

export function expectedFromRaw(paths: RawPaths): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => { out[k] = canon(String(v)); };

  if (paths.caseDir !== undefined) {
    const records = lines(join(paths.caseDir, "field-records.jsonl"));
    const frozen = records.find((r) => r.kind === "episode.frozen" && (paths.episodeRef === undefined || r.payload.episode_ref === paths.episodeRef));
    if (frozen !== undefined) {
      const ref = frozen.payload.episode_ref as string;
      const body = frozen.payload.reference.body;
      put("case.id", body.case_id); put("case.plan_item", body.plan_item_id); put("case.episode_n", body.n);
      put("case.episode_ref", ref); put("case.frozen_digest", frozen.payload.digest); put("case.frozen_record", frozen.record_id);
      put("case.world_ref", body.world_ref);
      const outbox = join(paths.caseDir, "field-anchor-outbox.jsonl");
      const anchor = existsSync(outbox) ? lines(outbox).filter((a) => a.subject_ref === ref).at(-1) : undefined;
      put("case.anchor_state", anchor === undefined ? "none" : anchor.state === "published" ? "published" : "pending");
      put("case.anchor_tag", anchor?.tag ?? "");
      const settled = records.find((r) => r.kind === "episode.settled" && r.payload.episode_ref === ref);
      if (settled === undefined) put("settlement.state", "not settled");
      else {
        put("settlement.result", settled.payload.result); put("settlement.actor", settled.principal);
        put("settlement.ref", settled.payload.settlement_ref); put("settlement.record", settled.record_id);
        put("settlement.world", body.world_ref);
      }
    }
  }
  if (paths.comparePath !== undefined) {
    const doc = json(paths.comparePath);
    put("rt.comparison_id", doc.comparison_id); put("rt.representation_id", doc.representation_id); put("rt.input_set", doc.input_set_sha256);
    put("rt.world_ref", doc.world_ref); put("rt.settleable", doc.settleable); put("rt.tail_status", doc.tail_verification.status);
    put("rt.proposed_result", doc.proposed_result.result ?? "none");
    if (paths.derivePath !== undefined) put("rt.representation_hash", json(paths.derivePath).representation_hash);
    const all = [...doc.residuals.episode, ...doc.residuals.structural];
    if (all.length === 0) put("residuals.count", 0);
    all.forEach((r, i) => {
      put(`residual.${i}.id`, r.residual_id); put(`residual.${i}.class`, r.class); put(`residual.${i}.basis`, r.basis);
      put(`residual.${i}.rule`, `${r.rule.kind}:${r.rule.ref}`); put(`residual.${i}.occurrences`, r.occurrence_ids.join(","));
      put(`residual.${i}.world`, r.world_ref);
    });
  }
  if (paths.pinPath !== undefined) {
    const pin = json(paths.pinPath);
    put("world.current", pin.current ?? "none"); put("world.baseline", pin.baseline ?? "none");
    pin.history.forEach((h: any, i: number) => put(`world.history.${i}`, `${h.pin_id} ${h.from_world_ref} -> ${h.to_world_ref} approval ${h.approval_id} transition ${h.transition_ref}`));
  }
  return out;
}

/** Every expected field must be rendered with exactly that canonical text. */
export function parity(expected: Record<string, string>, rendered: Record<string, string>): ParityMismatch[] {
  const mismatches: ParityMismatch[] = [];
  for (const [field, value] of Object.entries(expected)) {
    const seen = rendered[field] ?? null;
    if (seen !== value) mismatches.push({ code: "PARITY_MISMATCH", field, expected: value, rendered: seen });
  }
  return mismatches;
}

/** The text of every `[data-field]` element on a Playwright page. */
export async function renderedFields(page: import("playwright-core").Page): Promise<Record<string, string>> {
  const pairs = await page.$$eval("[data-field]", (nodes) => nodes.map((n) => [n.getAttribute("data-field")!, (n as HTMLElement).innerText]));
  return Object.fromEntries(pairs.map(([k, v]) => [k!, canon(v!)]));
}
