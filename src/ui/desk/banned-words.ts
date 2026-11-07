/**
 * Words that must never reach the screen (design sections 1 and 2). The word scan in test/desk-words.test.tsx and the case title
 * check in `readableTitle` read this one list.
 */
export const BANNED: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "SEA-Forge", pattern: /SEA-Forge/i },
  { name: "RealityTrace", pattern: /RealityTrace/i },
  { name: "Cognate", pattern: /Cognate/i },
  { name: "SFWP", pattern: /\bSFWP\b/i },
  { name: "ledger", pattern: /\bledgers?\b/i },
  { name: "digest", pattern: /\bdigests?\b/i },
  { name: "subsystem", pattern: /\bsubsystems?\b/i },
  { name: "structural world", pattern: /structural world/i },
  { name: "tenant", pattern: /\btenants?\b/i },
  { name: "witness", pattern: /\bwitness(es)?\b/i },
  { name: "governed", pattern: /\bgoverned\b/i },
  { name: "commit (as a noun)", pattern: /\bcommits?\b/i },
  { name: "environment variable", pattern: /[A-Z_]{6,}=?/ },
  { name: "a path under /tmp", pattern: /\/tmp\b/ },
];

/** True when the text has a banned word or looks like code: a CamelCase name or an underscore. */
export function hasBannedWords(text: string): boolean {
  return BANNED.some((b) => b.pattern.test(text)) || /[A-Za-z]+_[A-Za-z]/.test(text) || /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/.test(text) || /[A-Za-z]_(\s|$)/.test(text);
}

const MAX_TITLE = 90;

/**
 * A case title from its template: the description when it is a short plain sentence, otherwise the template name made readable
 * (`signoff_gate@0.1.0` becomes "Signoff gate"). Returns null when neither is usable.
 */
export function readableTitle(description: string | null | undefined, templateRef: string): string | null {
  const name = templateRef.split("@")[0]!.replace(/[-_.]+/g, " ").trim();
  const readableName = name === "" ? null : name[0]!.toUpperCase() + name.slice(1);
  let text = (description ?? "").replace(/\s+/g, " ").trim();
  if (text.length > MAX_TITLE) {
    // Too long to show whole: keep the first sentence when it fits, else the description is cut off and is not used.
    const first = /^(.+?[.!?])(\s|$)/.exec(text)?.[1];
    text = first !== undefined && first.length <= MAX_TITLE ? first : "";
  }
  if (text === "" || hasBannedWords(text)) return readableName;
  return text;
}
