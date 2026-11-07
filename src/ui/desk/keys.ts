/**
 * The key table of design 5.4 as a pure function. The page passes in what it saw; nothing here touches the page.
 * Shortcuts never fire while you are typing (only Ctrl/Cmd combinations and Escape do). No single key completes a
 * decision: A, R and H only open the preview, and only when a decision card is the open item.
 */
import type { ViewId } from "./model.ts";

export interface KeyInfo {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** The lower-case tag of the focused element. */
  readonly targetTag: string;
  readonly editable: boolean;
}

export type KeyAction =
  | { readonly type: "focus-composer" }
  | { readonly type: "quick-menu" }
  | { readonly type: "view"; readonly view: ViewId }
  | { readonly type: "day"; readonly delta: -1 | 1 }
  | { readonly type: "cursor"; readonly delta: -1 | 1 }
  | { readonly type: "open" }
  | { readonly type: "preview"; readonly choice: "accept" | "reject" | "hold" }
  | { readonly type: "escape" }
  | { readonly type: "keys-help" };

export interface KeyContext {
  /** A decision card is the open item (stage 3). */
  readonly decisionCard: boolean;
}

export function isTyping(info: Pick<KeyInfo, "targetTag" | "editable">): boolean {
  return info.editable || info.targetTag === "input" || info.targetTag === "textarea" || info.targetTag === "select";
}

const VIEW_KEYS: Readonly<Record<string, ViewId>> = { "1": "today", "2": "explore", "3": "decide", "4": "work" };

export function resolveKey(info: KeyInfo, context: KeyContext = { decisionCard: false }): KeyAction | null {
  const mod = info.ctrlKey || info.metaKey;
  if (info.key === "Escape") return { type: "escape" };
  if (mod && !info.altKey) {
    const key = info.key.toLowerCase();
    if (key === "k") return { type: "focus-composer" };
    if (key === "p") return { type: "quick-menu" };
    if (key in VIEW_KEYS) return { type: "view", view: VIEW_KEYS[key]! };
    if (key === "[") return { type: "day", delta: -1 };
    if (key === "]") return { type: "day", delta: 1 };
    return null;
  }
  if (isTyping(info) || info.altKey) return null;
  const key = info.key.toLowerCase();
  if (key === "j") return { type: "cursor", delta: 1 };
  if (key === "k") return { type: "cursor", delta: -1 };
  // Enter opens the item only when focus is not on a button or link, which Enter belongs to.
  if (info.key === "Enter" && info.targetTag !== "button" && info.targetTag !== "a") return { type: "open" };
  if (info.key === "?") return { type: "keys-help" };
  if (context.decisionCard) {
    if (key === "a") return { type: "preview", choice: "accept" };
    if (key === "r") return { type: "preview", choice: "reject" };
    if (key === "h") return { type: "preview", choice: "hold" };
  }
  return null;
}

export const KEY_TABLE: readonly { readonly keys: string; readonly does: string }[] = [
  { keys: "Ctrl/Cmd+K", does: "Go to the composer" },
  { keys: "Ctrl/Cmd+P", does: "Quick menu: jump to a day, case or tag, or run any action" },
  { keys: "Ctrl/Cmd+1 / 2 / 3 / 4", does: "Today, Explore, Decide, Work" },
  { keys: "Ctrl/Cmd+[ and ]", does: "Previous / next day" },
  { keys: "J / K", does: "Next / previous item" },
  { keys: "Enter", does: "Open the item in the inspector" },
  { keys: "A / R / H", does: "On a decision card: open the preview to accept, reject or hold. Nothing is decided until you confirm in the preview." },
  { keys: "Esc", does: "Close the top layer, one at a time" },
  { keys: "Tab (in the composer)", does: "Change the mode: Write, Find, Ask. Esc leaves the composer." },
  { keys: "?", does: "Show all keys" },
];
