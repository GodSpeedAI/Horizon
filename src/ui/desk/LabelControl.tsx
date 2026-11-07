/** @jsxImportSource react */
/** Your pass or fail label for one run, and the first thing that went wrong (design 5.7, 8.2). A label is yours; it decides nothing. */
import { useState, type ReactNode } from "react";
import type { RunLabel } from "../../capabilities/labels.ts";
import type { CompareView } from "../workspace/compare-model.ts";

export interface LabelFields {
  readonly session: string;
  readonly event: string;
  readonly record_seq: string;
  readonly verdict: string;
  readonly first_failure: string;
}
export type SaveLabel = (fields: LabelFields) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;

export function LabelControl({ view, label, onSave }: { readonly view: CompareView; readonly label: RunLabel | null; readonly onSave: SaveLabel }): ReactNode {
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section aria-labelledby="label-h" className="label-control">
      <h2 id="label-h">Your label for this run</h2>
      {label ? (
        <p data-current-label={label.verdict}>
          Currently <strong>{label.verdict}</strong>
          {label.first_failure ? `: ${label.first_failure}` : ""} (by {label.operator}, {label.created_at}).
        </p>
      ) : (
        <p className="muted">Not labelled yet.</p>
      )}
      {problem !== null ? (
        <p role="alert" className="error" data-label-error>
          {problem}
        </p>
      ) : null}
      {saved && problem === null ? <p role="status">Label saved.</p> : null}
      <form
        className="label-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setSaved(false);
          void onSave({
            session: view.session.session_id,
            event: view.session.event_id,
            record_seq: view.session.record_seq === null ? "" : String(view.session.record_seq),
            verdict: String(form.get("verdict") ?? ""),
            first_failure: String(form.get("first_failure") ?? ""),
          }).then((result) => {
            setProblem(result.ok ? null : result.message);
            setSaved(result.ok);
          });
        }}
      >
        <fieldset>
          <legend>Verdict</legend>
          <label>
            <input type="radio" name="verdict" value="pass" defaultChecked={label?.verdict === "pass"} required /> pass
          </label>{" "}
          <label>
            <input type="radio" name="verdict" value="fail" defaultChecked={label?.verdict === "fail"} /> fail
          </label>
        </fieldset>
        <label>
          The first thing that went wrong (at most 600 characters)
          <textarea name="first_failure" maxLength={600} defaultValue={label?.first_failure ?? ""} />
        </label>
        <button type="submit" className="primary">
          Save label
        </button>
      </form>
    </section>
  );
}
