/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useCtx, useShown } from "./ctx.tsx";

export type Raw = Record<string, unknown>;
export const isRec = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** A value as short plain text. Objects never turn into "[object Object]". */
export const str = (v: unknown, max = 2048): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const AGENT_TAG = "from the agent";

/** Inline data the agent supplied gets a tag. Data from a named source does not. */
export function isFromAgent(block: Raw): boolean {
  const prov = block.provenance;
  if (isRec(prov)) return prov.source_kind === "agent_supplied";
  return typeof block.source !== "string";
}

/** The words of a source name: "file:specs/plan.md" reads "specs/plan.md". */
export function sourceWords(source: unknown): string {
  const s = str(source, 600);
  const at = s.indexOf(":");
  return at > 0 ? s.slice(at + 1) : s;
}

export function Frame({ block, title, children }: { readonly block: Raw; readonly title?: string | null; readonly children: ReactNode }): ReactNode {
  const shown = useShown();
  const agent = isFromAgent(block);
  return (
    <section className="hb" data-block={str(block.type)} data-from-agent={agent ? "yes" : "no"} aria-label={title ? shown(title) : undefined}>
      {title || agent ? (
        <header className="hb-head">
          {title ? <h3 className="hb-title">{shown(title)}</h3> : null}
          {agent ? <span className="hb-tag">{AGENT_TAG}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** A reference as a chip: its name, and a button that asks the desk to open it. */
export function Chip({ ref_ }: { readonly ref_: string }): ReactNode {
  const ctx = useCtx();
  const shown = useShown();
  const name = ref_.includes(":") ? ref_.slice(ref_.indexOf(":") + 1) : ref_;
  return (
    <button type="button" className="hb-chip" onClick={() => ctx.openRef(ref_)} aria-label={`Open ${shown(name)}`}>
      {shown(name)}
    </button>
  );
}

export function Plain({ children }: { readonly children: string }): ReactNode {
  const shown = useShown();
  return <>{shown(children)}</>;
}

export const sentence = (word: string): string => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1));
