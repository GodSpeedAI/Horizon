/** @jsxImportSource react */
import type { KeyboardEvent, ReactNode } from "react";
import { useCtx, useShown } from "./ctx.tsx";
import { Frame, arr, isRec, num, str, sourceWords, type Raw } from "./shared.tsx";

const clip = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

interface Series { label: string; points: number[] }

export function Chart({ block }: { readonly block: Raw }): ReactNode {
  const shown = useShown();
  const kind = block.kind === "line" ? "line" : "bar";
  const series: Series[] = arr(block.series).slice(0, 8).flatMap((s) => (isRec(s) ? [{ label: str(s.label, 80) || "Series", points: arr(s.points).flatMap((p) => { const n = num(p); return n === null ? [] : [n]; }).slice(0, 500) }] : []));
  const count = Math.max(0, ...series.map((s) => s.points.length));
  if (series.length === 0 || count === 0) {
    return <Frame block={block}><p className="hb-muted">There are no numbers to chart yet.</p></Frame>;
  }
  const all = series.flatMap((s) => s.points);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all, lo + 1);
  const W = 560, H = 220, L = 44, R = 10, T = 10, B = 24;
  const iw = W - L - R, ih = H - T - B;
  const y = (v: number): number => T + ih - ((v - lo) / (hi - lo)) * ih;
  const slot = iw / count;
  const x = (i: number): number => L + slot * (i + 0.5);
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const summary = `${kind === "bar" ? "Bar" : "Line"} chart with ${series.length} ${series.length === 1 ? "series" : "series"} and ${count} points. ${series.map((s) => `${shown(s.label)} runs from ${fmt(Math.min(...s.points))} to ${fmt(Math.max(...s.points))}`).join("; ")}.`;
  const barW = Math.max(2, (slot * 0.8) / series.length);
  return (
    <Frame block={block}>
      <figure className="hb-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="hb-svg" preserveAspectRatio="xMidYMid meet">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="hb-grid" />
              <text x={L - 4} y={y(t) + 4} textAnchor="end" className="hb-axis">{fmt(t)}</text>
            </g>
          ))}
          {kind === "bar"
            ? series.map((s, si) => s.points.map((p, i) => <rect key={`${si}-${i}`} className={`hb-s hb-s${si}`} x={x(i) - (barW * series.length) / 2 + si * barW} width={barW - 1} y={Math.min(y(p), y(0))} height={Math.max(1, Math.abs(y(p) - y(0)))} />))
            : series.map((s, si) => (
                <g key={si} className={`hb-s hb-l${si}`}>
                  <polyline fill="none" points={s.points.map((p, i) => `${x(i)},${y(p)}`).join(" ")} />
                  {s.points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p)} r={3} />)}
                </g>
              ))}
        </svg>
        <figcaption className="hb-legend">
          {series.map((s, i) => <span key={i}><i className={`hb-key hb-k${i}`} aria-hidden="true" />{shown(s.label)}</span>)}
        </figcaption>
        <table className="hb-sr">
          <caption>{summary}</caption>
          <thead><tr><th scope="col">Point</th>{series.map((s, i) => <th key={i} scope="col">{shown(s.label)}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: count }, (_, i) => <tr key={i}><th scope="row">{i + 1}</th>{series.map((s, j) => <td key={j}>{s.points[i] === undefined ? "" : fmt(s.points[i]!)}</td>)}</tr>)}
          </tbody>
        </table>
      </figure>
      {typeof block.source === "string" ? <p className="hb-muted">Read from {shown(sourceWords(block.source))}</p> : null}
    </Frame>
  );
}

interface GNode { id: string; label: string; kind: string }
interface GEdge { from: string; to: string; relation: string }

export function Graph({ block }: { readonly block: Raw }): ReactNode {
  const ctx = useCtx();
  const shown = useShown();
  const nodes: GNode[] = arr(block.nodes).slice(0, 500).flatMap((n) => (isRec(n) && str(n.id) !== "" ? [{ id: str(n.id), label: str(n.label, 200) || str(n.id), kind: str(n.kind, 32) }] : []));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = arr(block.edges).slice(0, 500).flatMap((e) => (isRec(e) && ids.has(str(e.from)) && ids.has(str(e.to)) ? [{ from: str(e.from), to: str(e.to), relation: str(e.relation, 32) }] : []));
  if (nodes.length === 0) return <Frame block={block}><p className="hb-muted">Nothing to draw yet.</p></Frame>;
  // Columns by longest path from the start; the loop count is capped so a cycle ends.
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const e of edges) if (e.from !== e.to && depth.get(e.to)! < Math.min(depth.get(e.from)! + 1, nodes.length)) { depth.set(e.to, depth.get(e.from)! + 1); moved = true; }
    if (!moved) break;
  }
  const rowOf = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  const NW = 150, NH = 30, GX = 56, GY = 14;
  for (const n of nodes) {
    const d = depth.get(n.id)!;
    const r = rowOf.get(d) ?? 0;
    rowOf.set(d, r + 1);
    pos.set(n.id, { x: 8 + d * (NW + GX), y: 8 + r * (NH + GY) });
  }
  const W = 16 + (Math.max(...depth.values()) + 1) * (NW + GX) - GX;
  const H = 16 + Math.max(...rowOf.values()) * (NH + GY) - GY;
  const label = (id: string): string => shown(nodes.find((n) => n.id === id)?.label ?? id);
  const summary = `Diagram with ${nodes.length} ${nodes.length === 1 ? "item" : "items"} and ${edges.length} ${edges.length === 1 ? "link" : "links"}.`;
  const key = (id: string) => (event: KeyboardEvent): void => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); ctx.openRef(id); } };
  return (
    <Frame block={block}>
      <figure className="hb-graph">
        <div className="hb-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={summary} className="hb-svg-fixed">
            <defs>
              <marker id={`hb-arrow-${str(block.id, 64)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="hb-arrowhead" /></marker>
            </defs>
            {edges.map((e, i) => {
              const a = pos.get(e.from)!, b = pos.get(e.to)!;
              const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="hb-edge" markerEnd={`url(#hb-arrow-${str(block.id, 64)})`} />
                  {e.relation !== "" ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3} textAnchor="middle" className="hb-axis">{e.relation}</text> : null}
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = pos.get(n.id)!;
              return (
                <g key={n.id} role="button" tabIndex={0} aria-label={`Open ${shown(n.label)}`} className="hb-node" onClick={() => ctx.openRef(n.id)} onKeyDown={key(n.id)}>
                  <rect x={p.x} y={p.y} width={NW} height={NH} rx={4} />
                  <text x={p.x + 8} y={p.y + NH / 2 + 4}>{shown(clip(n.label, 22))}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <ul className="hb-sr" aria-label="Links in this diagram">
          {edges.map((e, i) => <li key={i}>{label(e.from)} {e.relation !== "" ? e.relation : "links to"} {label(e.to)}</li>)}
          {nodes.map((n) => <li key={n.id}>{shown(n.label)}</li>)}
        </ul>
      </figure>
      {typeof block.source === "string" ? <p className="hb-muted">Read from {shown(sourceWords(block.source))}</p> : null}
    </Frame>
  );
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Only a bound `file:` source can name a picture, and only the desk (through `ctx.mediaUrl`) can turn it into an address. */
export function allowedPicture(src: string): boolean {
  return /^file:(evidence|specs|plans|ui-model|sea|prereg)\//.test(src) && IMAGE.test(src) && !/[\\?#\s]|\.\./.test(src);
}
/** An address is used only when it stays on this site: one leading slash, no scheme. */
export function sameSite(url: string | null): url is string {
  return url !== null && /^\/(?!\/)[^\s\\]*$/.test(url);
}

export function Media({ block }: { readonly block: Raw }): ReactNode {
  const ctx = useCtx();
  const shown = useShown();
  const items = arr(block.items).slice(0, 8).flatMap((i) => (isRec(i) ? [{ label: str(i.label, 160), src: str(i.src, 600) }] : []));
  const pins = arr(block.pins).slice(0, 32).flatMap((p) => (isRec(p) && num(p.x) !== null && num(p.y) !== null ? [{ x: num(p.x)!, y: num(p.y)!, note: str(p.note, 300) }] : []));
  return (
    <Frame block={block}>
      {items.length === 0 ? <p className="hb-muted">No pictures or recordings.</p> : null}
      <ul className="hb-media">
        {items.map((m, i) => {
          const url = allowedPicture(m.src) && ctx.mediaUrl !== undefined ? ctx.mediaUrl(m.src) : null;
          return (
            <li key={i}>
              {sameSite(url) ? <img src={url} alt={shown(m.label)} loading="lazy" /> : <p className="hb-muted">{shown(m.label)} (not shown here; it is kept in {shown(sourceWords(m.src))})</p>}
              <p>{shown(m.label)}</p>
            </li>
          );
        })}
      </ul>
      {pins.length > 0 ? (
        <ul className="hb-pins" aria-label="Notes pinned on the picture">
          {pins.map((p, i) => <li key={i}>At {Math.round(p.x * 100)}% across and {Math.round(p.y * 100)}% down: {shown(p.note)}</li>)}
        </ul>
      ) : null}
    </Frame>
  );
}
