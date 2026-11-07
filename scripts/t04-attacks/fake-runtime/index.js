// T04 attack: a memory-only substitute for @godspeedai/cognate-runtime-bun.
//
// It models the *reviewer's* F1 fake (verdict `codex-root-20261019-7b4d110`): the real
// Horizon agents/components/projections run, but runs and projection rows live in Maps,
// emitted events are discarded, and a plain-text file stands where the SQLite database
// would be. `scripts/teeth.ts` installs it into an isolated dependency tree and requires
// the structural E2E to fail.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const runs = new Map();
const rows = new Map();
const agents = new Map();
const components = [];
const projections = new Map();
let seq = 0;

// The real package's governance parser, reduced to "off": the fake must load wherever the real
// runtime does, so the structural E2E fails on the fake's behaviour, not on a missing export.
export function governanceFromEnv() {
  return { mode: "off" };
}

// The real package's authority helpers, reduced to a request that carries the operation and a decision that refuses.
// They exist only so modules that import them load; the fake governs nothing.
export function buildAuthorityRequest(operation, worldRef, at, approval) {
  return { operation, worldRef, at: at instanceof Date ? at.toISOString() : String(at), approval };
}
export function interpretDecision() {
  return { decision: "deny", reason: "memory-only fake runtime" };
}

export async function createRuntime(options) {
  const storePath = typeof options.store === "string" ? options.store : options.store?.sqlite?.path ?? "/tmp/fake.sqlite";
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, "FAKE: memory-only runtime\n");
  for (const agent of options.agents ?? []) agents.set(agent.id, agent);
  for (const component of options.components ?? []) components.push(component);
  for (const entry of options.projections ?? []) projections.set(entry.projection.name, entry.projection);

  const handlerFor = (capability) => {
    for (const component of components) {
      if ((component.provides ?? []).some((contract) => contract.id === capability)) return { component, capability };
    }
    return undefined;
  };

  const invoke = async (capability, input) => {
    const found = handlerFor(capability);
    if (!found) throw new Error(`FAKE: capability ${capability} is unavailable`);
    const fiber = { provide: (contract, handler) => { found.handler = handler; } };
    found.component.activate(fiber);
    return found.handler(input, { correlationId: randomUUID(), tenant: "t", scopeId: "fake" });
  };

  const view = (run) => ({ ...run });

  const service = {
    async invoke(_caller, request) {
      return invoke(request.capability, request.input);
    },
    async startRun(_caller, request) {
      if (!options.actions.authorize({ caller: { actor: { id: "os", kind: "user" }, tenant: "t" }, action: "run.start", resource: request.agent }).allow) {
        throw new Error("FAKE: run.start denied");
      }
      const runId = `run-fake-${++seq}`;
      const correlationId = randomUUID();
      const run = { runId, agent: request.agent, tenant: "t", status: "running", input: request.input, output: null, error: null, correlationId, startedBy: "os" };
      runs.set(runId, run);
      for (const projection of projections.values()) {
        const writes = projection.apply({ eventType: "run.started", runId, tenant: "t", correlationId, payload: { input: request.input }, metadata: { agent: request.agent, startedBy: "os" }, position: seq, recordedAt: new Date().toISOString() }) ?? [];
        rows.set(projection.name, [...(rows.get(projection.name) ?? []), ...writes.map((write) => ({ key: String(write.key).split("/").pop(), value: write.value }))]);
      }
      const agent = agents.get(request.agent);
      try {
        const output = await agent.run(request.input, {
          runId,
          agent: request.agent,
          tenant: "t",
          scopeId: "fake",
          correlationId,
          actor: { id: "os", kind: "user" },
          invoke: async (capability, input) => invoke(capability, input),
          emit: async () => {},
          step: async (_id, fn) => fn(),
        });
        runs.set(runId, { ...run, status: "completed", output });
      } catch (error) {
        runs.set(runId, { ...run, status: "failed", error: error.message });
      }
      return run;
    },
    async getRun(_caller, request) {
      const run = runs.get(request.runId);
      if (!run) throw new Error("FAKE: run not found");
      return view(run);
    },
    async listRuns() {
      return [...runs.values()].map(view);
    },
    async readProjection(_caller, request) {
      return { rows: rows.get(request.name) ?? [], checkpoint: null };
    },
    async *events() {},
  };

  return {
    service,
    kernel: { scopeId: "fake" },
    store: {},
    async inspect() { return { correlationId: "", runs: [], events: [], invocations: [], artifacts: [], observations: [] }; },
    async rebuildCognition() {},
    async erase() {},
    async pollApprovals() { return 0; },
    async idle() {},
    async close() {},
  };
}
