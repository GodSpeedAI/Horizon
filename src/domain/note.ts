/**
 * The operator's notes (design 6). A note is written by a person and is never evidence: it can carry
 * tags and links, and neither grants anything. Validation refuses with a plain sentence; it never cuts text.
 */
import { z } from "zod";

/** About 200 KB of text: a 100 KB note is fine, a pasted book is not. */
export const NOTE_BODY_MAX = 200_000;
export const TAG_MAX = 40;
export const TAGS_MAX = 20;
export const LINK_KINDS = ["case", "step", "session", "record", "day", "note"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const NoteLink = z.object({ kind: z.enum(LINK_KINDS), ref: z.string().min(1).max(300) }).strict();
export type NoteLink = z.infer<typeof NoteLink>;

export const NoteInput = z
  .object({
    body: z.string(),
    case_ref: z.string().min(1).max(300).nullable().optional(),
    tags: z.array(z.string()).max(TAGS_MAX).optional(),
    links: z.array(NoteLink).max(100).optional(),
    /** Present when this save edits an existing note. */
    note_id: z.string().min(1).max(100).optional(),
    /** The person lets agents read this note. Only the person sets it; the default is no. */
    shared_with_agents: z.boolean().optional(),
  })
  .strict();
export type NoteInput = z.infer<typeof NoteInput>;

export const EMPTY_NOTE_MESSAGE = "A note needs some words. Type something, then press Enter.";
export const TOO_LONG_MESSAGE = `This note is longer than ${NOTE_BODY_MAX.toLocaleString("en-US")} characters. Split it into two notes.`;

export type NoteCheck =
  | { readonly ok: true; readonly body: string; readonly tags: readonly string[]; readonly links: readonly NoteLink[]; readonly case_ref: string | null; readonly note_id: string | null; readonly shared_with_agents: boolean | null }
  | { readonly ok: false; readonly message: string };

/** A tag is lower-case words joined by dashes; "Approved" and "approved " are the same tag. It is a label and nothing more. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-");
  if (tag === "" || tag.length > TAG_MAX || /[\u0000-\u001f<>"'`\\/]/.test(tag)) return null;
  return tag;
}

const LINK_TOKEN = /\[\[(case|step|session|record|day|note):([^|\]]{1,300})\|([^\]]{0,200})\]\]/g;

/** Links typed with @ are written into the body as `[[kind:ref|label]]`; this reads them back out. */
export function extractLinks(body: string): NoteLink[] {
  const found = new Map<string, NoteLink>();
  for (const match of body.matchAll(LINK_TOKEN)) {
    const link = { kind: match[1] as LinkKind, ref: match[2]!.trim() };
    found.set(`${link.kind}:${link.ref}`, link);
  }
  return [...found.values()];
}

const INLINE_TAG = /(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

/** `#word` typed in a note makes a tag, so the Tags list fills as you write. It is only a label, like any other tag. */
export function extractInlineTags(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(INLINE_TAG)) {
    const tag = normalizeTag(match[1]!);
    if (tag !== null && !found.includes(tag)) found.push(tag);
  }
  return found;
}

export function checkNote(raw: unknown): NoteCheck {
  const shaped = NoteInput.safeParse(raw);
  if (!shaped.success) return { ok: false, message: "That note could not be read. Try typing it again." };
  const input = shaped.data;
  if (input.body.trim() === "") return { ok: false, message: EMPTY_NOTE_MESSAGE };
  if (input.body.length > NOTE_BODY_MAX) return { ok: false, message: TOO_LONG_MESSAGE };
  const tags: string[] = [];
  for (const each of input.tags ?? []) {
    const tag = normalizeTag(each);
    if (tag === null) return { ok: false, message: `"${each.slice(0, 40)}" cannot be used as a tag. Tags are short, with no slashes, quotes or angle brackets.` };
    if (!tags.includes(tag)) tags.push(tag);
  }
  for (const tag of extractInlineTags(input.body)) if (!tags.includes(tag)) tags.push(tag);
  if (tags.length > TAGS_MAX) return { ok: false, message: `A note can carry ${TAGS_MAX} tags at most. This one has ${tags.length}.` };
  const links = new Map<string, NoteLink>();
  for (const link of [...extractLinks(input.body), ...(input.links ?? [])]) links.set(`${link.kind}:${link.ref}`, link);
  return { ok: true, body: input.body, tags, links: [...links.values()], case_ref: input.case_ref ?? null, note_id: input.note_id ?? null, shared_with_agents: input.shared_with_agents ?? null };
}
