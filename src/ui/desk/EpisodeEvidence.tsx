/** @jsxImportSource react */
/**
 * One FDE episode as plain text with ids and digests (WP-19, AT-14): case and frozen reference,
 * residuals with their classes, settlement, world. Read-only; there is no control on this panel.
 * Every `data-field` element holds exactly the source value so a test can compare the DOM with the
 * ledger; glosses and warnings are separate elements. An absent source says "not connected"; a
 * source that fails its schema says "invalid source" and shows no partial data.
 */
import type { ReactNode } from "react";
import { NOT_CONNECTED, type SourceRead } from "../../adapters/fde-read.ts";
import { RESULT_GLOSS, selectEpisode, toneOf, type FdeSources } from "../../adapters/fde-view.ts";

function Row({ field, label, value, gloss, tone }: { readonly field: string; readonly label: string; readonly value: string; readonly gloss?: string; readonly tone?: string }): ReactNode {
  return (
    <tr data-tone={tone}>
      <th scope="row">{label}</th>
      <td><code data-field={field}>{value}</code></td>
      <td data-gloss>{gloss ?? ""}</td>
    </tr>
  );
}

function Gone({ source, read }: { readonly source: string; readonly read: SourceRead<unknown> }): ReactNode {
  if (read.state === "invalid") {
    return (
      <div data-source={source} data-state="invalid" role="alert">
        <p data-field={`${source}.state`}>invalid source</p>
        <p>{read.detail}</p>
        <ul>{read.violations.slice(0, 8).map((v) => <li key={v}>{v}</li>)}</ul>
      </div>
    );
  }
  return <p data-source={source} data-state="not_connected" data-field={`${source}.state`}>{NOT_CONNECTED}</p>;
}

export function EpisodeEvidence({ sources, episodeRef }: { readonly sources: FdeSources; readonly episodeRef?: string }): ReactNode {
  const episode = selectEpisode(sources, episodeRef);
  const rt = sources.realitytrace;
  const pin = sources.pin;
  return (
    <section id="episode-evidence" aria-label="Episode evidence" data-readonly>
      <h3>Episode evidence (read only)</h3>
      <section data-source="case" data-state={sources.case.state}>
        <h4>Case and frozen reference</h4>
        {sources.case.state !== "ok" ? <Gone source="case" read={sources.case} /> : episode === null ? <p data-field="case.state">no episode record matches</p> : (
          <table><tbody>
            <Row field="case.id" label="Case" value={episode.case_id} />
            <Row field="case.plan_item" label="Plan item" value={episode.plan_item_id} />
            <Row field="case.episode_n" label="Episode n" value={String(episode.n)} />
            <Row field="case.episode_ref" label="Episode ref" value={episode.episode_ref} />
            <Row field="case.frozen_digest" label="Frozen reference digest" value={episode.frozen_digest} />
            <Row field="case.frozen_record" label="Freeze record" value={episode.frozen_record_id} />
            <Row field="case.anchor_state" label="Anchor" value={episode.anchor.state} gloss={episode.anchor.state === "published" ? "published to an external anchor" : "NOT anchored externally yet"} tone={episode.anchor.state === "published" ? "affirmed" : "undecided"} />
            <Row field="case.anchor_tag" label="Anchor ref" value={episode.anchor.tag ?? ""} />
            <Row field="case.world_ref" label="World of this record" value={episode.world_ref} />
          </tbody></table>
        )}
      </section>
      <section data-source="realitytrace" data-state={rt.state}>
        <h4>Residuals</h4>
        {rt.state !== "ok" ? <Gone source="realitytrace" read={rt} /> : (
          <>
            <table><tbody>
              <Row field="rt.comparison_id" label="Comparison" value={rt.data.comparison_id} />
              <Row field="rt.representation_id" label="Observed representation" value={rt.data.representation_id} />
              {rt.data.representation_hash === null ? null : <Row field="rt.representation_hash" label="Representation hash" value={rt.data.representation_hash} />}
              <Row field="rt.input_set" label="Input set" value={rt.data.input_set_sha256} />
              <Row field="rt.world_ref" label="World stamp" value={rt.data.world_ref} />
              <Row field="rt.settleable" label="Settleable" value={String(rt.data.settleable)} />
              <Row field="rt.tail_status" label="Ledger tail" value={rt.data.tail_verification.status}
                gloss={rt.data.tail_verification.status === "verified_against_expected_head" ? "tail verified against an expected head" : "tail NOT verified: removal of the last records would not be detected"}
                tone={rt.data.tail_verification.status === "verified_against_expected_head" ? "affirmed" : "undecided"} />
              <Row field="rt.proposed_result" label="Proposed result (not a settlement)" value={rt.data.proposed_result.result ?? "none"} gloss={RESULT_GLOSS[rt.data.proposed_result.result ?? ""] ?? ""} />
            </tbody></table>
            {rt.data.residuals.length === 0 ? <p data-field="residuals.count">0</p> : (
              <ol data-residuals>
                {rt.data.residuals.map((r, i) => {
                  const display = toneOf(r.class);
                  return (
                    <li key={r.residual_id} data-tone={display.tone} data-list={r.list}>
                      <table><tbody>
                        <Row field={`residual.${i}.id`} label="Residual" value={r.residual_id} />
                        <Row field={`residual.${i}.class`} label="Class" value={r.class} gloss={display.gloss} tone={display.tone} />
                        <Row field={`residual.${i}.basis`} label="Basis" value={r.basis} />
                        <Row field={`residual.${i}.rule`} label="Rule" value={`${r.rule.kind}:${r.rule.ref}`} />
                        <Row field={`residual.${i}.occurrences`} label="Occurrences" value={r.occurrence_ids.join(",")} />
                        <Row field={`residual.${i}.world`} label="World stamp" value={r.world_ref} />
                      </tbody></table>
                      {display.tone === "undecided" ? <p data-undecided>Not decided. This is not a pass.</p> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </section>
      <section data-source="settlement" data-state={sources.case.state}>
        <h4>Settlement</h4>
        {sources.case.state !== "ok" ? <Gone source="settlement" read={sources.case} /> : episode === null ? <p data-field="settlement.state">no episode record matches</p> : episode.settlement === null ? (
          <p data-field="settlement.state">not settled</p>
        ) : (
          <table><tbody>
            <Row field="settlement.result" label="Result" value={episode.settlement.result} gloss={RESULT_GLOSS[episode.settlement.result] ?? "unrecognised result"} tone={episode.settlement.result === "U" ? "undecided" : "decided"} />
            <Row field="settlement.actor" label="Settled by" value={episode.settlement.settling_actor} />
            <Row field="settlement.ref" label="Settlement ref" value={episode.settlement.settlement_ref} />
            <Row field="settlement.record" label="Settlement record" value={episode.settlement.record_id} />
            <Row field="settlement.world" label="World of this record" value={episode.settlement.world_ref} />
          </tbody></table>
        )}
      </section>
      <section data-source="world" data-state={pin.state}>
        <h4>World</h4>
        {pin.state !== "ok" ? <Gone source="world" read={pin} /> : (
          <table><tbody>
            <Row field="world.current" label="Pinned world" value={pin.data.current ?? "none"} />
            <Row field="world.baseline" label="Baseline" value={pin.data.baseline ?? "none"} />
            {pin.data.history.map((h, i) => <Row key={h.pin_id} field={`world.history.${i}`} label={`Pin ${h.kind}`} value={`${h.pin_id} ${h.from_world_ref} -> ${h.to_world_ref} approval ${h.approval_id} transition ${h.transition_ref}`} />)}
          </tbody></table>
        )}
      </section>
    </section>
  );
}
