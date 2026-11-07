/** @jsxImportSource react */
import { Component, type ReactNode } from "react";

export const COULD_NOT_SHOW = "This part could not be shown.";
export const CANNOT_SHOW = "This part cannot be shown here";

export function Fallback({ words = COULD_NOT_SHOW }: { readonly words?: string }): ReactNode {
  return (
    <p className="hb-fallback" role="note">
      {words}
    </p>
  );
}

/** Each part sits in its own guard, so one broken part never takes the rest of the page with it. */
export class BlockGuard extends Component<{ readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
