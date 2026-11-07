import type { NoteView } from "../../src/capabilities/notes.ts";
import type { DeskState } from "../../src/ui/desk/model.ts";
import { partsOf, sourcesOf } from "../../src/ui/desk/model.ts";

export const note = (n: number, over: Partial<NoteView> = {}): NoteView => ({
  note_id: `note:n${n}`,
  day: "2026-11-06",
  created_at: `2026-11-06T09:${String(n % 60).padStart(2, "0")}:00Z`,
  updated_at: `2026-11-06T09:${String(n % 60).padStart(2, "0")}:00Z`,
  author: "op-1",
  body: `note number ${n}`,
  rev: 1,
  case_ref: null,
  cases: [],
  tags: [],
  links: [],
  ...over,
});

export function deskState(over: Partial<DeskState> = {}, notes: readonly NoteView[] = [note(1), note(2), note(3)]): DeskState {
  const health = partsOf({ rules: true, cases: true, records: false, workshop: { state: "missing", days_left: null } });
  return {
    rev: "r1",
    today: "2026-11-06",
    day: "2026-11-06",
    timezone: "UTC",
    status: { org: "local:h:testing", setup: "testing", rules: "horizon@0a10c20d", openCase: null, waiting: 0, parts: health.parts, keyWarning: health.keyWarning, presenting: false },
    days: [{ day: "2026-11-06", count: notes.length }],
    cases: [],
    tags: [],
    notes,
    caseNotes: [],
    activity: [],
    sources: sourcesOf({ cases: true, agentWork: false, records: false }),
    selected: null,
    ...over,
  };
}
