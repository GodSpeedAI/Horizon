/** @jsxImportSource react */
import type { ReactNode } from "react";
import { DETAILS_MARK } from "./model.ts";

/** A message in plain words; the raw words behind it, when there are any, sit behind a "Details" disclosure. */
export function Words({ text }: { readonly text: string }): ReactNode {
  const at = text.indexOf(DETAILS_MARK);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <details>
        <summary>Details</summary>
        <code>{text.slice(at + DETAILS_MARK.length)}</code>
      </details>
    </>
  );
}
