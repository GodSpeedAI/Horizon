/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useCtx, useShown } from "./ctx.tsx";
import { Chip, Frame, num, str, sourceWords, type Raw } from "./shared.tsx";

const TONE_WORD: Record<string, string> = { neutral: "Note", info: "For your information", success: "Good news", warning: "Take care", danger: "Needs attention" };

export function Callout({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const tone = str(block.tone) in TONE_WORD ? str(block.tone) : "neutral";
  const ref = str(block.ref);
  return (
    <Frame block={block}>
      <div className="hb-callout" data-tone={tone} role={tone === "danger" ? "alert" : "note"}>
        <strong className="hb-callout-lead">{TONE_WORD[tone]}: </strong>
        <span dir="auto">{shown(str(block.text ?? block.body ?? block.label))}</span>
        {ref !== "" ? <> <Chip ref_={ref} /></> : null}
      </div>
    </Frame>
  );
}

export function Metric({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const value = typeof block.value === "number" ? String(block.value) : str(block.value ?? block.text, 120);
  const unit = str(block.unit, 16);
  const ref = str(block.ref);
  return (
    <Frame block={block}>
      <dl className="hb-metric">
        <dt>{shown(str(block.label, 120))}</dt>
        <dd>
          <span className="hb-metric-value">{shown(value)}</span>
          {unit !== "" ? <span className="hb-metric-unit"> {unit}</span> : null}
        </dd>
      </dl>
      {ref !== "" ? <Chip ref_={ref} /> : null}
    </Frame>
  );
}

export function Document({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const excerpt = str(block.excerpt ?? block.text ?? block.body, 4000);
  return (
    <Frame block={block} title={str(block.title, 160) || "Document"}>
      {excerpt !== "" ? <p className="hb-excerpt" dir="auto">{shown(excerpt)}</p> : <p className="hb-muted">No preview of this document.</p>}
      {typeof block.source === "string" ? <p className="hb-muted">Read from {shown(sourceWords(block.source))}</p> : null}
    </Frame>
  );
}

export function Entity({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const ref = str(block.ref);
  return (
    <Frame block={block}>
      <p className="hb-entity">
        <span>{shown(str(block.label, 160))}</span> {ref !== "" ? <Chip ref_={ref} /> : null}
      </p>
    </Frame>
  );
}

const OPERATION_WORD: Record<string, string> = {
  "horizon.health": "Check that Horizon is healthy",
  "horizon.research.health": "Check the research tools",
  "horizon.inspect": "Look closely at this",
  "horizon.compare": "Compare these",
  "horizon.decide.defer": "Put this decision off",
  "horizon.decide.approve": "Approve this",
  "horizon.decide.reject": "Reject this",
  "horizon.authorize.confirm": "Confirm this",
  "horizon.monitor.refresh": "Refresh the status",
  "horizon.navigate.back": "Go back",
  "horizon.navigate.cancel": "Cancel",
};
const AVAILABILITY_WORD: Record<string, string> = { available: "Ready", blocked: "Blocked", unknown: "Not known yet", conflicted: "The facts disagree" };

export function Preflight({ block }: { readonly block: Raw }): ReactNode {
  const ctx = useCtx();
  const shown = useShown();
  const operation = str(block.operation, 80);
  const availability = str(block.availability) in AVAILABILITY_WORD ? str(block.availability) : "unknown";
  const blocker = str(block.first_blocker);
  const words = OPERATION_WORD[operation] ?? "This step";
  const id = str(block.id, 64);
  return (
    <Frame block={block} title={words}>
      <p className="hb-preflight" data-availability={availability}>
        <strong>{AVAILABILITY_WORD[availability]}</strong>
        {availability !== "available" ? <span>{blocker !== "" ? `. What stops it first: ${shown(blocker)}` : ". The agent did not say what stops it."}</span> : null}
      </p>
      {availability === "available" ? (
        <button type="button" onClick={() => ctx.onAction({ id: `${id}-open`, operation, label: words, blockId: id })}>
          Show me the preview
        </button>
      ) : null}
      {str(block.evidence_ref) !== "" ? <p className="hb-muted">Backed by {shown(sourceWords(block.evidence_ref))}</p> : null}
    </Frame>
  );
}

export function Progress({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const raw = num(block.value);
  const pct = raw === null ? null : Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
  const label = str(block.label, 160);
  return (
    <Frame block={block}>
      <div className="hb-progress">
        <span>{shown(label)}</span>
        {pct !== null ? (
          <>
            <progress max={100} value={pct} aria-label={shown(label) || "Progress"} /> <span>{Math.round(pct)}%</span>
          </>
        ) : (
          <span className="hb-muted">
            {typeof block.source === "string" ? `Measured from ${shown(sourceWords(block.source))}. No figure is available yet.` : "No figure is available yet."}
          </span>
        )}
      </div>
    </Frame>
  );
}
