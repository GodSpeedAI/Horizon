/** @jsxImportSource react */
import { useId, useState, type ReactNode } from "react";
import { MAX_TEXT_ANSWER, questionOf, type QuestionItem } from "../../surface2/panel-blocks.ts";
import { useCtx, useShown, type AskState } from "./ctx.tsx";
import { Fallback } from "./guard.tsx";
import { Frame, arr, isRec, str, type Raw } from "./shared.tsx";

/** What the person's answer reads as: option names for a pick, Yes or No for a confirm, their own words for text. */
function echoValue(item: QuestionItem, value: unknown): string {
  const label = (id: string): string => item.options.find((o) => o.option_id === id)?.label ?? id;
  if (item.input === "confirm") return value === true || value === "yes" ? "Yes" : value === false || value === "no" ? "No" : String(value ?? "");
  const ids = Array.isArray(value) ? value.map(String) : typeof value === "string" && item.input === "multiselect" ? value.split(",").filter((v) => v !== "") : null;
  if (ids !== null) return ids.map(label).join(", ");
  return typeof value === "string" && item.input === "select" ? label(value) : String(value ?? "");
}

export function Question({ item, state }: { readonly item: QuestionItem; readonly state?: AskState | undefined }): ReactNode {
  const ctx = useCtx();
  const shown = useShown();
  const uid = useId();
  const [choice, setChoice] = useState("");
  const [many, setMany] = useState<readonly string[]>([]);
  const [words, setWords] = useState("");
  const [note, setNote] = useState("");
  const answered = state?.answered ?? item.answered;
  const withdrawn = state?.withdrawn ?? item.withdrawn ?? null;
  const input = item.input ?? "select";
  const title = <p className="hb-question"><strong dir="auto">{shown(item.question)}</strong></p>;
  const resolves = item.resolves ? <p className="hb-muted">This settles: {shown(item.resolves)}</p> : null;

  if (withdrawn !== null) {
    return (
      <div className="hb-ask" data-state="withdrawn">
        {title}
        <p role="status">The agent withdrew this question: {shown(withdrawn.reason)}</p>
      </div>
    );
  }
  if (answered !== null && answered !== undefined) {
    const how = answered.outcome === "answered" ? `You answered: ${shown(echoValue(item, answered.value))}` : answered.outcome === "deferred" ? "You said not yet." : "You skipped this question.";
    const routed = typeof answered.routed_as === "string" && answered.routed_as.trim() !== "" ? answered.routed_as : null;
    return (
      <div className="hb-ask" data-state={routed !== null ? "routed" : "waiting"}>
        {title}
        <p>{how}</p>
        {answered.outcome === "answered" || routed !== null ? <p className="hb-muted" role="status">{routed !== null ? `The agent says it took it to: ${shown(routed)}` : "Waiting for the agent to say where it went"}</p> : null}
      </div>
    );
  }

  const value = input === "multiselect" ? many.join(",") : input === "text" ? words.trim() : choice;
  const ready = value !== "";
  const send = (outcome: "answered" | "deferred" | "cancelled"): void => ctx.onAnswer(item.id, outcome, outcome === "answered" ? value : undefined, note.trim() === "" ? undefined : note.trim());
  const name = `${uid}-${item.id}`;
  return (
    <fieldset className="hb-ask" data-state="open" data-input={input}>
      <legend>{shown(item.question)}</legend>
      {item.why_needed !== "" ? <p className="hb-muted">Why it asks: {shown(item.why_needed)}</p> : null}
      {resolves}
      {input === "select" || input === "multiselect"
        ? item.options.map((o) => (
            <label key={o.option_id} className="hb-option">
              {input === "select" ? (
                <input type="radio" name={name} value={o.option_id} checked={choice === o.option_id} onChange={() => setChoice(o.option_id)} />
              ) : (
                <input type="checkbox" name={name} value={o.option_id} checked={many.includes(o.option_id)} onChange={(e) => setMany(e.target.checked ? [...many, o.option_id] : many.filter((m) => m !== o.option_id))} />
              )}{" "}
              <span>{shown(o.label)}</span>
              {o.consequence ? <span className="hb-muted"> If you pick this: {shown(o.consequence)}</span> : null}
            </label>
          ))
        : null}
      {input === "confirm" ? (
        <div className="hb-options" role="radiogroup" aria-label="Yes or no">
          {["yes", "no"].map((v) => (
            <label key={v} className="hb-option">
              <input type="radio" name={name} value={v} checked={choice === v} onChange={() => setChoice(v)} /> {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      ) : null}
      {input === "text" ? (
        <label className="hb-field">
          Your answer
          <input type="text" value={words} maxLength={MAX_TEXT_ANSWER} onChange={(e) => setWords(e.target.value)} />
        </label>
      ) : null}
      <label className="hb-field">
        A note for the agent (optional)
        <textarea rows={2} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="hb-row">
        <button type="button" className="primary" disabled={!ready} onClick={() => send("answered")} data-answer>Answer</button>
        <button type="button" onClick={() => send("deferred")}>Not yet</button>
        <button type="button" onClick={() => send("cancelled")}>Skip</button>
      </div>
      {!ready ? <p className="hb-muted">{input === "text" ? "Write your answer to send it" : input === "multiselect" ? "Pick at least one to send your answer" : "Pick one to send your answer"}, or choose Not yet or Skip.</p> : null}
    </fieldset>
  );
}

export function Ask({ block }: { readonly block: Raw }): ReactNode {
  const ctx = useCtx();
  const id = str(block.id, 64) || "ask";
  const item = questionOf(block, id);
  if (item === null) return <Fallback />;
  return <Frame block={block}><Question item={item} state={ctx.askState?.(id)} /></Frame>;
}

type Value = string | boolean;

export function Form({ block }: { readonly block: Raw }): ReactNode {
  const ctx = useCtx();
  const shown = useShown();
  const uid = useId();
  const id = str(block.id, 64) || "form";
  const fields = arr(block.fields).slice(0, 32).flatMap((f) => (isRec(f) && /^[a-z][a-z0-9_]{0,31}$/.test(str(f.name)) ? [{ name: str(f.name), label: str(f.label, 160) || str(f.name), kind: str(f.kind), required: f.required === true, choices: arr(f.choices).map((c) => str(c, 200)).filter((c) => c !== "") }] : []));
  const [values, setValues] = useState<Readonly<Record<string, Value>>>({});
  const [done, setDone] = useState(false);
  if (fields.length === 0) return <Fallback />;
  const missing = fields.filter((f) => f.required && (values[f.name] === undefined || values[f.name] === "" || (f.kind === "confirm" && values[f.name] === undefined)));
  const set = (name: string, v: Value): void => { setDone(false); setValues({ ...values, [name]: v }); };
  return (
    <Frame block={block}>
      <form
        className="hb-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (missing.length > 0) return;
          ctx.onSubmit(id, values);
          setDone(true);
        }}
      >
        {fields.map((f) => {
          const fid = `${uid}-${f.name}`;
          const label = <>{shown(f.label)}{f.required ? <span className="hb-muted"> (needed)</span> : <span className="hb-muted"> (optional)</span>}</>;
          return (
            <div key={f.name} className="hb-field">
              {f.kind === "confirm" ? (
                <label><input type="checkbox" checked={values[f.name] === true} onChange={(e) => set(f.name, e.target.checked)} /> {label}</label>
              ) : f.kind === "select" ? (
                <>
                  <label htmlFor={fid}>{label}</label>
                  <select id={fid} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">Choose one</option>
                    {f.choices.map((c) => <option key={c} value={c}>{shown(c)}</option>)}
                  </select>
                </>
              ) : f.kind === "longtext" ? (
                <>
                  <label htmlFor={fid}>{label}</label>
                  <textarea id={fid} rows={3} maxLength={2000} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
                </>
              ) : (
                <>
                  <label htmlFor={fid}>{label}</label>
                  <input id={fid} type="text" maxLength={500} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
                </>
              )}
            </div>
          );
        })}
        <div className="hb-row">
          <button type="submit" className="primary" disabled={missing.length > 0}>Fill in the preview</button>
        </div>
        {missing.length > 0 ? <p className="hb-muted">Still needed: {missing.map((f) => shown(f.label)).join(", ")}.</p> : null}
        {done ? <p role="status" className="hb-muted">Your answers are in the preview. Nothing is sent until you press Confirm there.</p> : null}
      </form>
    </Frame>
  );
}
