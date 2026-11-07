/** @jsxImportSource react */
import type { ReactNode } from "react";
import { useShown } from "./ctx.tsx";
import { Chip, Frame, arr, isRec, str, sourceWords, type Raw } from "./shared.tsx";

const cell = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : str(v, 400));
const SOURCE_NOTE = (block: Raw, shown: (t: string) => string): ReactNode => (typeof block.source === "string" ? <p className="hb-muted">Read from {shown(sourceWords(block.source))}</p> : null);

export function Table({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const cols = arr(block.columns).slice(0, 12).map((c) => (isRec(c) ? { key: str(c.key), label: str(c.label ?? c.key, 80) } : { key: str(c), label: str(c, 80) }));
  const rows = arr(block.rows).slice(0, 500);
  return (
    <Frame block={block}>
      {rows.length === 0 ? (
        <p className="hb-muted">No rows to show.</p>
      ) : (
        <div className="hb-scroll" tabIndex={0} role="region" aria-label="Table, scrolls sideways if it is wide">
          <table className="hb-table">
            <thead>
              <tr>{cols.map((c, i) => <th key={i} scope="col">{shown(c.label)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {cols.map((c, i) => (
                    <td key={i}>{shown(cell(isRec(row) ? row[c.key] : Array.isArray(row) ? row[i] : i === 0 ? row : ""))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {SOURCE_NOTE(block, shown)}
    </Frame>
  );
}

interface TreeNode { ref: string; label: string; parent: string | null }

export function Tree({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const nodes: TreeNode[] = arr(block.nodes).flatMap((n) => (isRec(n) && str(n.ref) !== "" ? [{ ref: str(n.ref), label: str(n.label, 200), parent: n.parent_ref === null || n.parent_ref === undefined ? null : str(n.parent_ref) }] : []));
  const known = new Set(nodes.map((n) => n.ref));
  const kids = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const key = n.parent !== null && known.has(n.parent) && n.parent !== n.ref ? n.parent : null;
    kids.set(key, [...(kids.get(key) ?? []), n]);
  }
  const seen = new Set<string>();
  const branch = (parent: string | null, depth: number): ReactNode => {
    const list = (kids.get(parent) ?? []).filter((n) => !seen.has(n.ref));
    if (list.length === 0 || depth > 12) return null;
    return (
      <ul role={depth === 0 ? "tree" : "group"} className="hb-tree">
        {list.map((n) => {
          seen.add(n.ref);
          return (
            <li key={n.ref} role="treeitem" aria-selected={false}>
              <span>{shown(n.label)}</span> <Chip ref_={n.ref} />
              {branch(n.ref, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };
  return (
    <Frame block={block}>
      {nodes.length === 0 ? <p className="hb-muted">Nothing to show.</p> : branch(null, 0)}
      {SOURCE_NOTE(block, shown)}
    </Frame>
  );
}

/** Date and time to the minute, taken from the text itself so it reads the same everywhere. */
export const whenWords = (at: string): string => (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(at) ? `${at.slice(0, 10)} ${at.slice(11, 16)}` : at.slice(0, 40));

export function Timeline({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const entries = arr(block.entries)
    .flatMap((e) => (isRec(e) ? [{ at: str(e.at, 40), label: str(e.label, 300), ref: str(e.ref) }] : []))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return (
    <Frame block={block}>
      {entries.length === 0 ? (
        <p className="hb-muted">Nothing has happened yet.</p>
      ) : (
        <ol className="hb-timeline">
          {entries.map((e, i) => (
            <li key={i}>
              <time dateTime={e.at}>{whenWords(e.at)}</time> <span>{shown(e.label)}</span> {e.ref !== "" ? <Chip ref_={e.ref} /> : null}
            </li>
          ))}
        </ol>
      )}
      {SOURCE_NOTE(block, shown)}
    </Frame>
  );
}

export function Compare({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const side = (v: unknown): { ref: string; label: string } => (isRec(v) ? { ref: str(v.ref), label: str(v.label, 160) || "(unnamed)" } : { ref: "", label: "(unnamed)" });
  const left = side(block.left);
  const right = side(block.right);
  const dims = arr(block.dimensions).slice(0, 12);
  return (
    <Frame block={block}>
      <table className="hb-table hb-compare">
        <thead>
          <tr>
            <th scope="col">What is compared</th>
            <th scope="col">{shown(left.label)} {left.ref !== "" ? <Chip ref_={left.ref} /> : null}</th>
            <th scope="col">{shown(right.label)} {right.ref !== "" ? <Chip ref_={right.ref} /> : null}</th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d, i) => (isRec(d) ? (
            <tr key={i}>
              <th scope="row">{shown(str(d.label, 160))}</th>
              <td>{shown(cell(d.left))}</td>
              <td>{shown(cell(d.right))}</td>
            </tr>
          ) : null))}
        </tbody>
      </table>
    </Frame>
  );
}
