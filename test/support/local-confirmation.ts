/**
 * Test preload: a test client confirms a Stage 0B reserved operation the way a person would on the
 * terminal, without a terminal. The server hands each one-time code to this sink; the gate then
 * confirms it through the same compare-and-swap. Production never installs a sink, so a reserved
 * operation there always waits for the terminal. Tests that prove the waiting state take the sink
 * away for their run (see test/pending-confirmations.test.ts).
 */
import { setConfirmationCodeSink } from "../../src/capabilities/pending-confirmations.ts";

setConfirmationCodeSink(() => undefined);
