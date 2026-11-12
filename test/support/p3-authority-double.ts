/**
 * A TEST DOUBLE for the SEA-Forge P3 authority that decides device enrolment. It approves every operation it is
 * asked about, so the enrolment rigs can exercise the controller path. It is not SEA-Forge, it is not evidence of
 * any policy decision, and no production code path may import it. Production wires no P3 authority at all.
 */
import type { P3Authority } from "../../src/remote/enrollment.ts";

export function p3AuthorityDouble(): P3Authority {
  let counter = 0;
  return {
    decide: async () => {
      counter += 1;
      return { decision: "approved", decisionId: `test-double-decision-${counter}` };
    },
  };
}
