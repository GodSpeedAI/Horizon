import type { DeskIo } from "../../src/ui/desk/Desk.tsx";

/** A desk io that does nothing, for tests that only draw. Pass overrides for the calls a test cares about. */
export function quietIo(over: Partial<DeskIo> = {}): DeskIo {
  return {
    saveNote: async () => ({ ok: false, message: "not used" }),
    setPresenting: () => undefined,
    decide: async () => ({ ok: false, message: "not used" }),
    saveLabel: async () => ({ ok: false, message: "not used" }),
    remote: null,
    ...over,
  };
}
