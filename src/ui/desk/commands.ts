/**
 * The box is also a command line. A line that starts with `/` runs a desk command; any other line is plain words and is never touched.
 * Pure: parsing and the plain-words hints only. The composer decides what each command does.
 */

export const COMMANDS = ["find", "handoff", "note", "done", "hold"] as const;
export type CommandName = (typeof COMMANDS)[number];

export const COMMAND_HINTS: readonly { readonly name: CommandName; readonly usage: string; readonly does: string }[] = [
  { name: "find", usage: "/find <words>", does: "Look through your notes, days, tags and cases" },
  { name: "handoff", usage: "/handoff <words>", does: "Turn your words into a step in a case, after a preview" },
  { name: "note", usage: "/note <words>", does: "Save a note on today" },
  { name: "done", usage: "/done <step>", does: "Open the preview for marking a waiting step done" },
  { name: "hold", usage: "/hold <step>", does: "Open the preview for holding a waiting step" },
];

export type ParsedLine =
  | { readonly kind: "plain" }
  | { readonly kind: "command"; readonly name: CommandName; readonly arg: string }
  | { readonly kind: "unknown"; readonly name: string };

/** Plain text stays plain. `/name rest` is a command when the name is known, otherwise it is unknown. */
export function parseLine(text: string): ParsedLine {
  const match = /^\/([^\s/]*)\s*([\s\S]*)$/.exec(text.trimStart());
  if (match === null) return { kind: "plain" };
  const name = match[1]!.toLowerCase();
  const known = COMMANDS.find((c) => c === name);
  return known === undefined ? { kind: "unknown", name: match[1]! } : { kind: "command", name: known, arg: match[2]!.trim() };
}

export const unknownCommandWords = (name: string): string => `No command called /${name}. Try /find, /handoff, /note, /done or /hold.`;

/** The hints to show while a line starts with `/` and no space has been typed yet. */
export function hintsFor(text: string): readonly (typeof COMMAND_HINTS)[number][] {
  const match = /^\/([^\s/]*)$/.exec(text.trimStart());
  if (match === null) return [];
  const typed = match[1]!.toLowerCase();
  return COMMAND_HINTS.filter((h) => h.name.startsWith(typed));
}
