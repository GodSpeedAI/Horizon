/**
 * The agent door's own entry point, called in process.
 *
 * The door's live route refuses the rows the catalog refuses at this freeze (`ask.route`, and
 * `ask.withdraw` from the agent path). A test that proves the machinery behind those rows — how a
 * route finishes an answer, what a withdrawal writes — calls the same function the door calls
 * after its checks, `applyAgentOp`, so the proof still exists without pretending the route runs.
 * The door's refusal is proved on the route itself (test/identity-remediation-4.test.ts).
 *
 * The answer is shaped like the route's: the same body, and the same status the door maps the
 * reply to, so a test written against the door reads the same way.
 */
import type { HorizonApplication } from "../../src/app.ts";
import { withRequestId } from "./request-body.ts";

export const agentInProcess = async (application: HorizonApplication, keyId: string, name: string | undefined, body: unknown): Promise<Response> => {
  const done = await application.applyAgentOp(withRequestId(body) as never, name, keyId);
  const status = done.ok ? 200 : done.code === "NOT_FOUND" ? 404 : done.code === "REUSED" || done.code === "DECISION" ? 409 : done.code === "UNAVAILABLE" ? 503 : 400;
  return Response.json(done, { status });
};
