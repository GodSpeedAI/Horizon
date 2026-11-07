/** @jsxImportSource react */
/** Decide and Work arrive in the next stage; until then each says what it will hold and where to go meanwhile. */
import type { ReactNode } from "react";
import type { ViewProps } from "./Today.tsx";

export function Decide({ data }: ViewProps): ReactNode {
  const waiting = data?.status.waiting ?? 0;
  return (
    <section aria-labelledby="decide-h" className="view" data-view-id="decide">
      <h1 id="decide-h">Decide</h1>
      {waiting > 0 ? (
        <p>
          {waiting} {waiting === 1 ? "decision is" : "decisions are"} waiting for you. Decisions are made on the <a href="/workspace/approvals">Decisions page</a> for now; they will move here soon.
        </p>
      ) : (
        <p className="empty">Nothing needs you right now. When an agent asks for a decision, it waits here. Next step: write down what you are working on in the box below.</p>
      )}
    </section>
  );
}

export function Work(_props: ViewProps): ReactNode {
  return (
    <section aria-labelledby="work-h" className="view" data-view-id="work">
      <h1 id="work-h">Work</h1>
      <p className="empty">
        Running work and how it went will appear here soon. Meanwhile, <a href="/workspace/compare">compare what an agent said with the independent record</a>, or see <a href="/workspace/economics">what each accepted outcome cost</a>.
      </p>
    </section>
  );
}
