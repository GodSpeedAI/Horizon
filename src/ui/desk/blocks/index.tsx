/** @jsxImportSource react */
/**
 * Every part an agent can put on the page, drawn (stage 8, step 6). One drawer per type in the grammar's closed list; a test fails if a
 * type has none. Each part sits in its own guard. Text is always built as page elements, never as raw markup.
 */
import type { ReactNode } from "react";
import { BLOCK_TYPES, type BlockType } from "../../surface2/grammar.ts";
import { Ask, Form } from "./ask.tsx";
import { CtxContext, type BlockCtx } from "./ctx.tsx";
import { Chart, Graph, Media } from "./viz.tsx";
import { Compare, Table, Timeline, Tree } from "./data.tsx";
import { BlockGuard, CANNOT_SHOW, Fallback } from "./guard.tsx";
import { Callout, Document, Entity, Metric, Preflight, Progress } from "./read.tsx";
import { isRec, type Raw } from "./shared.tsx";

export type { BlockCtx, BlockAction, AskOutcome, AskState } from "./ctx.tsx";
export { NO_CTX } from "./ctx.tsx";
export { Question } from "./ask.tsx";
export { BlockGuard, CANNOT_SHOW, COULD_NOT_SHOW } from "./guard.tsx";

type Drawer = (props: { readonly block: Raw }) => ReactNode;

/** Keyed on the grammar's list: a missing key is a type error here and a failing test. */
export const DRAWERS: Readonly<Record<BlockType, Drawer>> = {
  metric: Metric,
  callout: Callout,
  table: Table,
  tree: Tree,
  timeline: Timeline,
  graph: Graph,
  chart: Chart,
  compare: Compare,
  media: Media,
  document: Document,
  entity: Entity,
  preflight: Preflight,
  progress: Progress,
  ask: Ask,
  form: Form,
};

const known = (type: unknown): type is BlockType => typeof type === "string" && (BLOCK_TYPES as readonly string[]).includes(type);

/** One part as page elements. A type outside the grammar says so in words; a part that fails to draw is contained and says so. */
export function drawBlock(block: unknown, ctx: BlockCtx): ReactNode {
  if (!isRec(block) || !known(block.type)) return <p className="hb-fallback" role="note">{CANNOT_SHOW}</p>;
  const Draw = DRAWERS[block.type];
  return (
    <CtxContext.Provider value={ctx}>
      <BlockGuard>
        <Draw block={block} />
      </BlockGuard>
    </CtxContext.Provider>
  );
}

export { Fallback };
