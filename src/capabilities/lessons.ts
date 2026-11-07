/**
 * Lessons (design 8.4). A lesson is proposed from a review's findings and is inactive until a person accepts it.
 * One record per lesson in `horizon-lessons`: `status` is "proposed", "active" or "rejected", and an active or rejected lesson
 * keeps who decided and when. Nothing here lets a proposal make itself active: `decideLesson` needs the person's name.
 */
import { createHash } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const LESSONS_COLLECTION = "horizon-lessons";
export type LessonStatus = "proposed" | "active" | "rejected";

export interface Lesson {
  readonly tenant: string;
  readonly lesson_id: string;
  readonly text: string;
  /** Where the finding came from, for example the review step ("case_1/step_9"). */
  readonly source: string | null;
  /** Who or what proposed it (an agent or the review step). Never the person who accepts it. */
  readonly proposed_by: string;
  readonly proposed_at: string;
  readonly status: LessonStatus;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
}

export const LESSON_TEXT_MAX = 600;
export const lessonIdOf = (text: string, source: string | null): string => `lesson:${createHash("sha256").update(`${source ?? ""}\n${text.trim()}`).digest("hex").slice(0, 16)}`;

export async function listLessons(store: DurableStore, tenant: string, status?: LessonStatus): Promise<Lesson[]> {
  const rows = await store.listRecords(LESSONS_COLLECTION, { tenant });
  return rows.map((r) => r.value as unknown as Lesson).filter((l) => status === undefined || l.status === status).sort((a, b) => (a.proposed_at < b.proposed_at ? -1 : a.proposed_at > b.proposed_at ? 1 : a.lesson_id < b.lesson_id ? -1 : 1));
}

/** Proposing the same finding twice keeps the first record. A proposal is always "proposed". */
export async function proposeLesson(
  store: DurableStore,
  input: { readonly tenant: string; readonly text: string; readonly source?: string | null; readonly proposed_by: string; readonly now: Date },
): Promise<{ readonly ok: true; readonly lesson: Lesson } | { readonly ok: false; readonly message: string }> {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text === "") return { ok: false, message: "A lesson needs some words." };
  if (text.length > LESSON_TEXT_MAX) return { ok: false, message: `That lesson is too long (limit ${LESSON_TEXT_MAX} characters).` };
  const source = input.source ?? null;
  const id = lessonIdOf(text, source);
  const existing = await store.getRecord(LESSONS_COLLECTION, id);
  if (existing) return { ok: true, lesson: existing.value as unknown as Lesson };
  const lesson: Lesson = { tenant: input.tenant, lesson_id: id, text, source, proposed_by: input.proposed_by, proposed_at: input.now.toISOString(), status: "proposed", decided_by: null, decided_at: null };
  await store.commit({ appends: [], records: [{ collection: LESSONS_COLLECTION, id, expectedVersion: 0, value: lesson as unknown as { readonly [key: string]: Json } }] });
  return { ok: true, lesson };
}

/** A person's accept or reject. Only a proposed lesson can be decided, and the person must be named. */
export async function decideLesson(
  store: DurableStore,
  input: { readonly lesson_id: string; readonly choice: "accept" | "reject"; readonly person: string; readonly now: Date },
): Promise<{ readonly ok: true; readonly lesson: Lesson } | { readonly ok: false; readonly message: string }> {
  if (input.person.trim() === "") return { ok: false, message: "Only a person can decide a lesson, and no person is named." };
  const current = await store.getRecord(LESSONS_COLLECTION, input.lesson_id);
  if (!current) return { ok: false, message: "That lesson is not recorded." };
  const lesson = current.value as unknown as Lesson;
  if (lesson.status !== "proposed") return { ok: false, message: `That lesson was already decided (${lesson.status}).` };
  const next: Lesson = { ...lesson, status: input.choice === "accept" ? "active" : "rejected", decided_by: input.person, decided_at: input.now.toISOString() };
  await store.commit({ appends: [], records: [{ collection: LESSONS_COLLECTION, id: input.lesson_id, expectedVersion: current.version, value: next as unknown as { readonly [key: string]: Json } }] });
  return { ok: true, lesson: next };
}
