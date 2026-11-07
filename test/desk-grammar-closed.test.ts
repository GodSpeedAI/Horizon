import { describe, expect, test } from "bun:test";
import { BLOCK_TYPES, SURFACE_INTENTS } from "../src/ui/surface2/grammar.ts";

// Ruling CF10: the pre-registration fixes fifteen block types. Notes are written by people and never shown by agents,
// so the desk draws them itself (src/ui/desk/NoteEditor.tsx); the agent vocabulary gains no note part and no write intent.
describe("the page-part vocabulary stays closed", () => {
  test("grammar is still 15 blocks and has no note type", () => {
    expect(BLOCK_TYPES.length).toBe(15);
    expect((BLOCK_TYPES as readonly string[]).includes("note")).toBe(false);
    expect((SURFACE_INTENTS as readonly string[]).includes("write")).toBe(false);
  });
});
