import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EXECUTORS_WITHOUT_ASSURANCE,
  GOVERNED_CLASSES,
  IDENTITY_CLASSES,
  OWNERSHIPS,
  classify,
  dispatchAction,
  isDispatcher,
  isDowngrade,
  loadOperationManifest,
  parseOperationManifest,
} from "../src/contracts/identity/manifest.ts";

const ROOT = new URL("..", import.meta.url).pathname;

function readYaml(relative: string): Record<string, any> {
  return Bun.YAML.parse(readFileSync(`${ROOT}${relative}`, "utf8")) as Record<string, any>;
}

const loaded = loadOperationManifest();
const operations = [...loaded.byId.values()];
const policy = readYaml("contracts/identity/v1/policy.yaml");
const params = readYaml("contracts/identity/v1/params.yaml");
const claims = readYaml("contracts/identity/v1/platform-claims.yaml");
const appSource = readFileSync(`${ROOT}src/app.ts`, "utf8");

/** The seven tools the agent door accepts, read from the router's own frozen list. */
function agentToolsFromSource(): string[] {
  const list = /const AGENT_TOOLS = \[([^\]]+)\]/.exec(appSource)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => String(match[1]));
}

/** Every `body.op === "..."` comparison the person's panel route performs. */
function panelOpsFromSource(): string[] {
  const found = new Set<string>();
  for (const match of appSource.matchAll(/body\.op === "([^"]+)"/g)) found.add(String(match[1]));
  for (const match of appSource.matchAll(/: body\.op === "([^"]+)"/g)) found.add(String(match[1]));
  return [...found].sort();
}

describe("closed catalog", () => {
  test("every row resolves with the fields a gate needs", () => {
    for (const operation of operations) {
      expect(operation.id.length).toBeGreaterThan(0);
      expect(IDENTITY_CLASSES).toContain(operation.class);
      expect(typeof operation.offlineAllowed).toBe("boolean");
      expect(typeof operation.writable).toBe("boolean");
      expect(OWNERSHIPS).toContain(operation.ownership);
      expect(["verified", "candidate", "reserved"]).toContain(operation.binding);
    }
  });

  test("operation IDs are unique", () => {
    const ids = operations.map((operation) => operation.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the catalog has the reconciled shape (PE-01)", () => {
    // PE-01 says the catalog resolves in five class groups, each row carrying a class, a binding
    // state and the fields a gate needs. It does not fix a row count: every remediation unit that
    // added or split a row recorded the new census in its own preregistration, and the newest
    // census is asserted there, not here. What this test holds is the shape that survives every
    // wave: five groups, no row outside them, and no row missing a field.
    const counts = Object.fromEntries(
      IDENTITY_CLASSES.map((klass) => [klass, operations.filter((o) => o.class === klass).length] as const),
    ) as Record<(typeof IDENTITY_CLASSES)[number], number>;
    expect(counts.P0).toBeGreaterThan(0);
    expect(counts.P1).toBeGreaterThan(0);
    expect(counts.P2).toBeGreaterThan(0);
    expect(counts.P3).toBeGreaterThan(0);
    expect(counts.PX).toBeGreaterThan(0);
    // The census has exactly the five class groups and no other key, so a row outside them
    // cannot hide behind a key this test does not name.
    expect(Object.keys(counts).sort()).toEqual([...IDENTITY_CLASSES].sort());
    // The group is the class. A row may restate a field to override its class default, but it may
    // not restate the class itself: a row that moved itself into a weaker group would be governed
    // by every check that filters on the class — and by none of the checks that require one.
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    expect(source).not.toMatch(/^ {6}class: /m);
    expect(operations.every((operation) => IDENTITY_CLASSES.includes(operation.class))).toBe(true);
  });

  test("an unlisted operation is Px, not something weaker (NE-01)", () => {
    const unlisted = classify(loaded, "horizon.definitely.not.real");
    if (!("refusal" in unlisted)) throw new Error("an unlisted operation must classify as Px");
    expect(unlisted.class).toBe("PX");
    expect(unlisted.refusal).toBe("unlisted_operation");
    expect("authorityWriter" in unlisted).toBe(false);
    expect("pendingExpiry" in unlisted).toBe(false);
  });

  test("the reconciliation left no catalog gap behind", () => {
    expect(loaded.manifest.catalog_gaps).toEqual([]);
  });

  test("a recorded gap still has to be a real gap, not a guess", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    const withGap = source.replace(
      "catalog_gaps: []",
      [
        "catalog_gaps:",
        '  - route: "POST /invented/route"',
        "    code_ops: [invented.op]",
        '    reason: "A synthetic gap used to prove the register cannot hide a covered op."',
      ].join("\n"),
    );
    const parsed = parseOperationManifest(withGap);
    for (const gap of parsed.manifest.catalog_gaps) {
      const covered = [...parsed.byId.values()].filter((operation) => operation.routes.includes(gap.route));
      for (const codeOp of gap.code_ops ?? []) {
        expect(covered.flatMap((operation) => operation.codeOps)).not.toContain(codeOp);
      }
    }
    // And the register is only as good as the claim it records: a gap may not name a route that is mapped.
    const claimed = parseOperationManifest(source.replace("catalog_gaps: []", withGap.slice(withGap.indexOf("catalog_gaps:"))));
    for (const gap of claimed.manifest.catalog_gaps) {
      expect(parsed.routes.has(gap.route)).toBe(false);
    }
  });
});

describe("no downgrade path", () => {
  test("a governed operation is never satisfied by a local-policy writer or A0/A1 evidence (NE-02)", () => {
    const downgrades = operations.filter((operation) => isDowngrade(operation)).map((operation) => operation.id);
    expect(downgrades).toEqual([]);
  });

  test("every governed operation names a writer that can decide it (PE-03)", () => {
    const writers = Object.keys(loaded.manifest.authority_writers);
    for (const operation of operations.filter((o) => GOVERNED_CLASSES.includes(o.class))) {
      expect(operation.authorityWriter).not.toBeNull();
      expect(writers).toContain(operation.authorityWriter as string);
    }
  });

  test("every governed operation either demands evidence stronger than a session label or names a caller that can prove no person", () => {
    for (const operation of operations.filter((o) => GOVERNED_CLASSES.includes(o.class))) {
      // A public probe, an unauthenticated challenge or a one-time code identifies nobody, so a
      // row on such a path may not inherit the class default's predicate: it says so in the open
      // (`human_evidence: null`), and the manifest refuses the same field on any other executor
      // (R5-07). Every other governed row still demands A2 or better.
      if (EXECUTORS_WITHOUT_ASSURANCE.includes(operation.executor as never)) {
        expect(operation.humanEvidence).toBeNull();
        continue;
      }
      expect(operation.humanEvidence).not.toBeNull();
      expect(["A0", "A0_OR_A1", "A1"]).not.toContain((operation.humanEvidence ?? "").toUpperCase());
    }
    // The rows that state it are exactly the caller paths that cannot produce it.
    const without = operations.filter((o) => o.humanEvidence === null && GOVERNED_CLASSES.includes(o.class));
    expect(without.map((o) => o.id)).toEqual(["device.pair"]);
  });

  test("a human caller is never given a grant or a credential", () => {
    expect(policy.required.humans_have_no_grant).toBe(true);
    expect(policy.required.humans_have_no_credential).toBe(true);
  });

  test("a human-session row never expires by a grant alone", () => {
    for (const operation of operations.filter((o) => (o.executor ?? "").includes("human_session"))) {
      const expiry = operation.pendingExpiry ?? "";
      if (expiry.includes("grant")) expect(expiry).toContain("10m");
    }
    expect(operations.some((o) => o.id === "grant.redelegate" && (o.pendingExpiry ?? "").includes("10m"))).toBe(true);
  });
});

describe("dispatchers", () => {
  test("a dispatcher carries no authority of its own", () => {
    const dispatchers = operations.filter((operation) => isDispatcher(operation));
    expect(dispatchers.map((operation) => operation.id).sort()).toEqual(["capability.invoke", "run.start"]);
    for (const dispatcher of dispatchers) {
      expect(dispatcher.class).toBe("PX");
      expect(dispatcher.authorityWriter).toBeNull();
      expect(dispatcher.pendingExpiry).toBeNull();
    }
  });

  test("a dispatcher declares what it inherits", () => {
    for (const dispatcher of operations.filter((operation) => isDispatcher(operation))) {
      const raw = loaded.rows.find((row) => row.id === dispatcher.id);
      expect(raw?.inherits).toEqual(["class", "executor", "authority_writer", "human_evidence", "pending_expiry"]);
    }
  });
});

describe("handler-level semantic dispatch", () => {
  test("every agent-door tool the code accepts has a reviewed row (PE-02)", () => {
    const tools = agentToolsFromSource();
    expect(tools.length).toBe(7);
    for (const tool of tools) {
      const resolved = dispatchAction(loaded, "POST /agent/panels", tool);
      expect(resolved.class).not.toBe("PX");
    }
  });

  test("every person's panel operation the code accepts has a reviewed row", () => {
    const ops = panelOpsFromSource();
    expect(ops.length).toBeGreaterThanOrEqual(5);
    for (const op of ops) {
      const resolved = dispatchAction(loaded, "POST /desk/panels/op", op);
      expect(resolved.class).not.toBe("PX");
    }
  });

  test("an agent-door tool maps to the row the catalog names, and the class is the row's", () => {
    const expected: Record<string, [string, (typeof IDENTITY_CLASSES)[number]]> = {
      show_surface: ["agent.surface.publish", "P1"],
      ask_human: ["agent.question.ask", "P1"],
      arrange: ["agent.surface.arrange", "P1"],
      annotate: ["agent.surface.annotate", "P1"],
      read_responses: ["agent.response.read", "P0"],
      "ask.withdraw": ["ask.withdraw", "P2"],
      "answer.route": ["ask.route", "P2"],
    };
    for (const [tool, [id, klass]] of Object.entries(expected)) {
      const resolved = dispatchAction(loaded, "POST /agent/panels", tool);
      expect(resolved.id).toBe(id);
      expect(resolved.class).toBe(klass);
    }
  });

  test("a person's reserved operation cannot be reached from the agent door (NE-04)", () => {
    for (const op of ["human.answer", "human.pin", "human.close", "human.open", "human.reassign_owner"]) {
      const resolved = dispatchAction(loaded, "POST /agent/panels", op);
      if (!("refusal" in resolved)) throw new Error(`${op} must be refused at the agent door`);
      expect(resolved.class).toBe("PX");
      expect(resolved.refusal).toBe("reserved_for_person");
    }
  });

  test("an unrecognized action is Px on every dispatching route (NE-03)", () => {
    for (const entry of loaded.manifest.dispatch) {
      const resolved = dispatchAction(loaded, entry.route, "not_a_listed_action");
      if (!("refusal" in resolved)) throw new Error(`${entry.route} accepted an unlisted action`);
      expect(resolved.class).toBe("PX");
      expect(resolved.refusal).toBe("unknown_action");
    }
    const unlistedRoute = dispatchAction(loaded, "POST /nope", "show_surface");
    expect(unlistedRoute.class).toBe("PX");
  });

  test("a dispatch entry may only name rows that are bound to its own route", () => {
    for (const entry of loaded.manifest.dispatch) {
      for (const operationId of Object.values(entry.actions)) {
        const operation = loaded.byId.get(operationId);
        expect(operation).toBeDefined();
        expect(operation?.routes).toContain(entry.route);
      }
    }
  });

  test("every row bound to a dispatching route appears in that route's dispatch table", () => {
    for (const entry of loaded.manifest.dispatch) {
      const bound = (loaded.routes.get(entry.route) ?? []).map((operation) => operation.id).sort();
      const dispatched = [
        ...new Set([...Object.values(entry.actions), ...(entry.combinations ?? []).map((combination) => combination.operation)]),
      ].sort();
      expect(dispatched).toEqual(bound);
    }
  });

  test("the effect-selected search route keeps its read at P0 and its write at P1", () => {
    const entry = loaded.dispatch.get("POST /desk/search");
    expect(entry?.selector ?? "declared_effect").toBe("declared_effect");
    const read = loaded.byId.get("horizon.search.read");
    const record = loaded.byId.get("horizon.search.record");
    expect(read?.class).toBe("P0");
    expect(read?.writable).toBe(false);
    expect(record?.class).toBe("P1");
    expect(record?.writable).toBe(true);
    expect(record?.paramsSchema).toBe("params.horizon_search_record");
  });
});

describe("route bindings", () => {
  test("every POST route in the app is mapped, a dispatch route, a declared alias, or a declared non-operation route (PE-08)", () => {
    const found = new Set<string>();
    for (const match of appSource.matchAll(/pathname === "([^"]+)" && request\.method === "POST"/g)) {
      found.add(`POST ${match[1]}`);
    }
    expect(found.size).toBeGreaterThan(20);
    const gaps = new Set(loaded.manifest.catalog_gaps.map((gap) => gap.route));
    const nonOperations = new Set(loaded.manifest.non_operation_routes.map((route) => route.route));
    const unaccounted = [...found].filter(
      (route) => !loaded.routes.has(route) && !loaded.dispatch.has(route) && !loaded.aliases.has(route) && !gaps.has(route) && !nonOperations.has(route),
    );
    expect(unaccounted).toEqual([]);
  });

  test("every route bound to a row is also reachable through the dispatch table when the route dispatches", () => {
    for (const [route, owners] of loaded.routes) {
      if (!loaded.dispatch.has(route)) continue;
      expect(owners.length).toBeGreaterThan(0);
    }
  });

  test("a verified row names a route or a code operation", () => {
    for (const operation of operations.filter((o) => o.binding === "verified")) {
      expect(operation.routes.length + operation.codeOps.length).toBeGreaterThan(0);
    }
  });

  test("a code operation the router performs is claimed by exactly one row", () => {
    for (const operation of operations) {
      for (const codeOp of operation.codeOps) {
        const owners = operations.filter((other) => other.codeOps.includes(codeOp));
        expect(owners).toHaveLength(1);
      }
    }
  });
});

describe("route aliases", () => {
  test("the third intent route is an alias of the listed operation, not a new class", () => {
    const alias = loaded.aliases.get("POST /workspace/intent");
    expect(alias?.operation).toBe("horizon.surface.intent.commit");
    expect(loaded.byId.get(alias?.operation ?? "")?.class).toBe("P1");
    expect(loaded.byId.get(alias?.operation ?? "")?.routes).toContain("POST /workspace/intent");
  });

  test("an alias may only narrow, and it says how", () => {
    for (const alias of loaded.manifest.route_aliases) {
      expect(alias.narrowing.length).toBeGreaterThan(20);
      expect(alias.added_requirements?.length ?? 0).toBeGreaterThan(0);
      const target = loaded.byId.get(alias.operation);
      expect(target?.class).not.toBe("PX");
      // An alias never reaches a different class than the row it names.
      expect(loaded.routes.get(alias.route)?.every((operation) => operation.class === target?.class)).toBe(true);
    }
  });

  test("no alias points at a governed operation with a weaker class than the route's own rows", () => {
    for (const alias of loaded.manifest.route_aliases) {
      const target = loaded.byId.get(alias.operation);
      if (target === undefined) continue;
      const owners = loaded.routes.get(alias.route) ?? [];
      for (const owner of owners) expect(owner.class).toBe(target.class);
    }
  });
});

describe("recorded binding defects", () => {
  test("a defect names a real route, a real operation, and a declared status", () => {
    expect(loaded.manifest.binding_defects.length).toBeGreaterThan(0);
    for (const defect of loaded.manifest.binding_defects) {
      expect(loaded.routes.has(defect.route) || loaded.dispatch.has(defect.route)).toBe(true);
      expect(loaded.byId.has(defect.operation)).toBe(true);
      expect(["recorded_not_fixed", "recorded_for_owner", "fixed"]).toContain(defect.status);
      expect(defect.required.length).toBeGreaterThan(20);
      // A closed defect says how it was closed and what proves it; an open one must not pretend.
      if (defect.status === "fixed") {
        expect((defect.resolution ?? "").length).toBeGreaterThan(40);
        expect((defect.evidence ?? "").length).toBeGreaterThan(20);
      } else {
        expect(defect.resolution).toBeUndefined();
        expect(defect.evidence).toBeUndefined();
      }
    }
  });

  test("the role-from-request defect is closed, and the source no longer reads a role from a request", () => {
    const defect = loaded.manifest.binding_defects.find((entry) => entry.id === "DEF-ROLE-FROM-REQUEST");
    expect(defect?.route).toBe("POST /surface/intent");
    expect(defect?.status).toBe("fixed");
    // The handler no longer reads a role from the submission, and the route no longer forwards one.
    expect(appSource).not.toContain("submission.role");
    expect(appSource).not.toContain("role: record.role");
    // The role is an argument each caller supplies from its own authenticated context.
    expect(appSource).toContain("role: SurfaceRole,");
  });

  test("the ask-route executor defect is closed: the row names the agent executor and its key", () => {
    const defect = loaded.manifest.binding_defects.find((entry) => entry.id === "DEF-ASK-ROUTE-EXECUTOR");
    expect(defect?.status).toBe("fixed");
    const row = loaded.byId.get("ask.route")!;
    // R5-04: the executor is the registered agent, not an "agent execution": an execution is what
    // the issuer grants, and the caller here is the key that made the claim.
    expect(row.executor).toBe("registered_agent");
    expect(row.callerAuthentication).toBe("registered_agent_key");
    // The class and the human evidence are unchanged: the agent proposes, the human authorises.
    expect(row.class).toBe("P2");
    expect(row.humanEvidence).toBe("A3-UV");
    expect(row.stage0bEvidence).toBe("A3-T");
    expect(row.pendingExpiry).toBe("10m");
    // The runtime record carries the authenticated executor.
    expect(appSource).toContain("executor_key: keyId");
    expect(appSource).toContain("ACTOR_NAMING_FIELDS");
  });
});

describe("the freeze states what the running code enforces", () => {
  const enforcement = loaded.manifest.live_enforcement;
  test("every live-bound row has an enforcement entry, and every entry names a live-bound row", () => {
    const live = operations.filter((operation) => operation.binding === "verified").map((operation) => operation.id).sort();
    const entries = enforcement.rows.map((entry) => entry.id).sort();
    expect(entries).toEqual(live);
  });
  test("an enforcement entry names a caller path the block declares", () => {
    const paths = new Set(Object.keys(enforcement.paths));
    for (const entry of enforcement.rows) {
      const named = [entry.caller_path, ...(entry.variants ?? []).map((variant) => variant.caller_path)].filter(
        (path): path is string => path !== undefined,
      );
      expect(named.length).toBeGreaterThan(0);
      for (const path of named) expect(paths.has(path)).toBe(true);
    }
  });
  test("a governed row does not claim the runtime enforces it today", () => {
    for (const entry of enforcement.rows) {
      const row = loaded.byId.get(entry.id)!;
      if (row.class === "P2" || row.class === "P3") expect(entry.enforced_today).toBe(false);
    }
  });
  test("a row that is not enforced says what is missing and which stage closes it", () => {
    for (const entry of enforcement.rows) {
      if (entry.enforced_today) {
        expect(entry.missing).toEqual([]);
        expect((entry.enforced_by ?? "").length).toBeGreaterThan(10);
        continue;
      }
      expect(entry.missing.length).toBeGreaterThan(0);
      expect((entry.required_stage ?? "").length).toBeGreaterThan(0);
    }
  });
  test("the manifest refuses a governed row that claims enforcement it does not have", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    // `human.answer` is P2 and is not enforced today; claiming otherwise is refused.
    const mutated = source.replace(
      "    - id: human.answer\n      caller_path: human_session\n      enforced_today: false",
      "    - id: human.answer\n      caller_path: human_session\n      enforced_today: true",
    );
    expect(mutated).not.toBe(source);
    expect(() => parseOperationManifest(mutated)).toThrow();
  });
  test("the manifest refuses a live-bound row with no enforcement entry", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    const withoutEntry = source.replace(
      /    - id: session\.logout\n      caller_path: human_session\n      enforced_today: true\n      enforced_by: "[^"]*"\n      missing: \[\]\n/,
      "",
    );
    expect(withoutEntry).not.toBe(source);
    expect(() => parseOperationManifest(withoutEntry)).toThrow();
  });
});

describe("the alias narrowing is data, not prose", () => {
  test("an alias declares the fixed parameters and the checks that narrow it", () => {
    for (const alias of loaded.manifest.route_aliases) {
      const checks = alias.narrowing_checks ?? [];
      expect(checks.length).toBeGreaterThan(0);
      const fixed = alias.fixed_parameters ?? {};
      for (const check of checks) {
        if (check.kind === "fixed_parameter") {
          expect(check.name).toBeDefined();
          expect(Object.prototype.hasOwnProperty.call(fixed, check.name as string)).toBe(true);
          expect(fixed[check.name as string]).toBe(check.equals);
        }
      }
      expect(alias.target_class).toBe(loaded.byId.get(alias.operation)?.class);
    }
  });
  test("the workspace intent alias fixes the transport and the role the desk hard-codes", () => {
    const alias = loaded.aliases.get("POST /workspace/intent");
    expect(alias?.fixed_parameters).toEqual({ transport: "gui", role: "human" });
  });
  test("the manifest refuses an alias whose check and fixed parameter disagree", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    const mutated = source.replace(
      "      transport: gui\n      role: human\n",
      "      transport: cli\n      role: human\n",
    );
    expect(mutated).not.toBe(source);
    expect(() => parseOperationManifest(mutated)).toThrow();
  });
  test("the manifest refuses an alias with no narrowing check at all", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    const mutated = source.replace(
      /    narrowing_checks:\n(?:      - \{[^\n]*\}\n)+/,
      "    narrowing_checks: []\n",
    );
    expect(mutated).not.toBe(source);
    expect(() => parseOperationManifest(mutated)).toThrow();
  });
});

describe("the browser's pairing route is a session, not a device enrollment", () => {
  test("the pairing route is session.pair, and it enrolls nothing", () => {
    const row = loaded.byId.get("session.pair")!;
    expect(row.class).toBe("P1");
    // The route proves possession of a one-time code and cannot prove who presented it, so the
    // row never claims local-console presence (R2-09).
    expect(row.executor).toBe("code_holder");
    expect(row.callerAuthentication).toBe("one_time_pairing_code");
    expect(row.routes).toContain("POST /desk/pair");
    expect(row.paramsSchema).toBe("params.session_pair");
  });
  test("device.pair is the phone's enrollment, and the browser's pairing is not it", () => {
    const row = loaded.byId.get("device.pair")!;
    expect(row.class).toBe("P2");
    // The phone's enrollment is live-bound: it enrols a credential and revokes the previous one
    // (R3-01). It is still not the browser's pairing route.
    expect(row.binding).toBe("verified");
    expect(row.routes).toContain("POST /m/api/pair/finish");
    expect(row.executor).toBe("code_holder");
    expect(row.callerAuthentication).toBe("one_time_pairing_code");
    // A one-time code proves possession of the code, not the presence of a person, so the row
    // states that no assurance predicate applies rather than borrowing one (R5-07).
    expect(row.humanEvidence).toBeNull();
    expect(loaded.byId.get("session.pair")!.routes).not.toContain("POST /m/api/pair/finish");
  });
  test("the pairing schema carries the one-time code and nothing else", () => {
    const schema = params.schemas["params.session_pair"];
    expect(schema.fields?.map((field: { name: string }) => field.name)).toEqual(["code"]);
  });
});

describe("the shared execution route is a dispatcher", () => {
  test("POST /desk/start is bound to the run.start dispatcher, not to a P1 row", () => {
    const rows = loaded.routes.get("POST /desk/start") ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.id).toBe("run.start");
    const dispatcher = loaded.byId.get("run.start")!;
    expect(dispatcher.class).toBe("PX");
    expect(dispatcher.binding).toBe("verified");
  });
  test("there is no shared-execution row that would start governed work at P1", () => {
    expect(loaded.byId.has("cognate.execution.start")).toBe(false);
    for (const row of loaded.byId.values()) {
      if (row.binding !== "verified") continue;
      if (row.routes.includes("POST /desk/start")) expect(row.class).toBe("PX");
    }
  });
  test("the dispatcher inherits the resolved target's class and never its own authority", () => {
    const dispatcher = loaded.byId.get("run.start")!;
    expect(dispatcher.authorityWriter).toBeNull();
    expect(dispatcher.humanEvidence).toBeNull();
  });
});

describe("the evidence vocabulary is the A3 mechanism's own", () => {
  test("every evidence requirement the catalog names is declared by the A3 mechanism", () => {
    const mechanism = readYaml("contracts/identity/v1/a3-mechanism.yaml");
    const declared = new Set((mechanism.assurance_requirements as { id: string }[]).map((entry) => entry.id));
    expect(declared.size).toBeGreaterThan(0);
    for (const operation of operations) {
      for (const evidence of [operation.humanEvidence, operation.stage0bEvidence]) {
        if (evidence === null) continue;
        expect(declared.has(evidence)).toBe(true);
      }
    }
  });
  test("the manifest refuses a row that names an evidence requirement the mechanism does not declare", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    const mutated = source.replace("human_evidence: A3-UV", "human_evidence: A3_UV");
    expect(mutated).not.toBe(source);
    expect(() => parseOperationManifest(mutated)).toThrow();
  });
  test("the mechanism's own requirement list says what each requirement requires", () => {
    const mechanism = readYaml("contracts/identity/v1/a3-mechanism.yaml");
    for (const entry of mechanism.assurance_requirements as { id: string; kind: string; claims: string[] }[]) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.kind.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.claims)).toBe(true);
    }
  });
});

describe("parameter schemas", () => {
  const schemas = new Set(Object.keys(params.schemas));
  const aliases = params.aliases as Record<string, string>;
  const specific = params.operation_specific as Record<string, string>;

  test("every governed operation resolves to a frozen parameter schema", () => {
    for (const operation of operations.filter((o) => GOVERNED_CLASSES.includes(o.class))) {
      expect(operation.paramsSchema).not.toBeNull();
      expect(schemas).toContain(operation.paramsSchema as string);
    }
  });

  test("every row's parameter schema exists and is declared where it is not the row's default name", () => {
    for (const operation of operations.filter((o) => o.paramsSchema !== null)) {
      expect(schemas).toContain(operation.paramsSchema as string);
      const byName = `params.${operation.id.replaceAll(".", "_")}`;
      const named = GOVERNED_CLASSES.includes(operation.class) || operation.class === "PX";
      const defaults = named ? [byName] : ["params.read", "params.local_write"];
      if (!defaults.includes(operation.paramsSchema as string) && aliases[operation.id] === undefined) {
        expect(specific[operation.id]).toBe(operation.paramsSchema ?? undefined);
      }
    }
  });

  test("every operation-specific ref names a real operation and an existing schema", () => {
    for (const [operationId, schema] of Object.entries(specific)) {
      expect(loaded.byId.has(operationId)).toBe(true);
      expect(schemas).toContain(schema);
    }
  });

  test("every alias names an existing schema and a real operation", () => {
    for (const [operationId, schema] of Object.entries(aliases)) {
      expect(loaded.byId.has(operationId)).toBe(true);
      expect(schemas).toContain(schema);
    }
  });

  test("no frozen schema is unreachable", () => {
    const used = new Set(operations.map((operation) => operation.paramsSchema).filter((value): value is string => value !== null));
    const unreachable = [...schemas].filter((schema) => !used.has(schema) && !Object.values(aliases).includes(schema));
    expect(unreachable).toEqual([]);
  });

  test("the reconciled rows carry the parameters their effect needs", () => {
    const required: Record<string, string[]> = {
      "params.agent_surface_publish": ["surface"],
      "params.agent_surface_arrange": ["action"],
      "params.agent_surface_annotate": ["panel", "text"],
      "params.agent_question_ask": ["panel", "ask"],
      "params.human_panel_open": ["template"],
      "params.human_panel_close": ["panel_id"],
      "params.horizon_search_record": ["q", "record"],
    };
    for (const [schema, fields] of Object.entries(required)) {
      const listed = (params.schemas[schema].fields ?? []).map((field: any) => field.name);
      for (const field of fields) expect(listed).toContain(field);
    }
    expect(params.schemas["params.session_logout"].fields).toEqual([]);
    expect(params.schemas["params.agent_response_read"].fields).toEqual([]);
  });
});

describe("ownership", () => {
  test("every bound agent-executed write declares who must own the target", () => {
    const agentWrites = operations.filter((o) => o.executor === "registered_agent" && o.writable && o.binding === "verified");
    expect(agentWrites.length).toBeGreaterThanOrEqual(4);
    for (const operation of agentWrites) expect(operation.ownership).not.toBe("none_required");
  });

  test("the agent's content operations are owned by the caller's key", () => {
    for (const id of ["agent.surface.publish", "agent.surface.arrange", "agent.surface.annotate", "agent.question.ask"]) {
      expect(loaded.byId.get(id)?.ownership).toBe("caller_owns_panel");
      expect(loaded.byId.get(id)?.class).toBe("P1");
      expect(loaded.byId.get(id)?.callerAuthentication).toBe("registered_agent_key");
    }
    expect(loaded.byId.get("agent.response.read")?.ownership).toBe("caller_owns_question");
  });

  test("session logout reaches only the caller's own session", () => {
    const logout = loaded.byId.get("session.logout");
    expect(logout?.ownership).toBe("caller_own_session");
    expect(logout?.class).toBe("P1");
    expect(logout?.id).not.toBe("device.remove");
    const remove = loaded.byId.get("device.remove");
    expect(remove?.class).toBe("P2");
    expect(remove?.humanEvidence).toContain("A3");
  });

  test("a person-owned board operation cannot be performed by an agent", () => {
    for (const id of ["human.panel.open", "human.panel.close", "ask.reassign", "owner.pin"]) {
      expect(loaded.byId.get(id)?.ownership).toBe("person_owns_board");
      const resolved = dispatchAction(loaded, "POST /agent/panels", id);
      expect(resolved.class).toBe("PX");
    }
  });
});

describe("policy constants", () => {
  test("the frozen durations match the owner decision (PE-09)", () => {
    expect(policy.durations_seconds).toMatchObject({
      credential_max_ttl: 900,
      offline_window: 300,
      a3_challenge_ttl: 120,
      pairing_ttl: 300,
      pending_approval_ttl: 600,
      p2p1_grant_max_ttl: 28800,
      p3_grant_max_ttl: 3600,
      clock_tolerance: 60,
    });
    expect(policy.limits.delegation_depth_max).toBe(2);
  });

  test("offline work is confined to P0/P1 and never extends a grant (NE-08)", () => {
    expect(policy.required.p2_p3_offline_allowed).toBe(false);
    expect(policy.limits.offline_window_applies_to_classes).toEqual(["P0", "P1"]);
    for (const operation of operations.filter((o) => GOVERNED_CLASSES.includes(o.class))) {
      expect(operation.offlineAllowed).toBe(false);
    }
    for (const operation of operations.filter((o) => !GOVERNED_CLASSES.includes(o.class) && o.class !== "PX")) {
      expect(operation.offlineAllowed).toBe(true);
    }
  });

  test("a P3 grant without an explicit numeric budget is refused", () => {
    expect(policy.required.p3_grant_requires_numeric_budget).toBe(true);
    expect(loaded.manifest.refusal_codes.budget_required).toBeDefined();
  });

  test("an absent child grant field grants nothing", () => {
    expect(policy.absent_child_grant_field_means).toMatchObject({
      operations: "empty",
      budget: "zero",
      depth_remaining: "zero",
      redelegate: false,
      offline: false,
    });
  });

  test("the refusal vocabulary covers the actions reconciliation added", () => {
    for (const code of ["unknown_action", "not_owner", "caller_substituted", "alias_action_mismatch"]) {
      expect(loaded.manifest.refusal_codes[code]).toBeDefined();
    }
  });
});

describe("platform claims", () => {
  test("the matrix carries the measured limits rather than an aspiration (PE-13)", () => {
    const byPlatform = new Map(claims.platforms.map((row: any) => [row.platform, row]));
    expect([...byPlatform.keys()]).toEqual([
      "windows_x64",
      "macos_x64_arm64",
      "linux_x86_64",
      "linux_arm64_jetson",
      "browser_only_no_issuer",
    ]);
    expect((byPlatform.get("linux_arm64_jetson") as any).unsupported).toContain("Isolated");
    expect((byPlatform.get("browser_only_no_issuer") as any).unsupported).toContain("agent identity");
    for (const row of claims.platforms) {
      expect((row as any).s1_claim.length).toBeGreaterThan(0);
      expect((row as any).unsupported.length).toBeGreaterThan(0);
    }
  });

  test("S2 is never claimed by a single-host desktop", () => {
    expect(claims.profiles.S2.rule).toContain("never S2");
  });
});

describe("manifest is loadable from source, not only from disk", () => {
  test("parsing the committed file twice yields the same census", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    const again = parseOperationManifest(source);
    expect([...again.byId.keys()].sort()).toEqual([...loaded.byId.keys()].sort());
  });

  test("a stale or malformed manifest fails loudly (NE-09)", () => {
    const source = readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");
    expect(() => parseOperationManifest(source.replace("- id: horizon.health\n", "- id: horizon.health\n      unexpected_key: 1\n"))).toThrow();
    expect(() => parseOperationManifest(source.replace("show_surface: agent.surface.publish", "show_surface: agent.not_a_row"))).toThrow();
    expect(() => parseOperationManifest(source.replace("- { id: horizon.note.save,", "- { id: horizon.health,"))).toThrow();
    // A row that names an evidence requirement the A3 mechanism does not declare is refused.
    expect(() => parseOperationManifest(source.replace("human_evidence: A3-UV", "human_evidence: A3_UV"))).toThrow();
    // A writable row with no scope rule is refused: the class alone does not say whose it is.
    expect(() =>
      parseOperationManifest(
        source.replace(
          "    scope_rule: >-\n      A P2 effect is reserved: it changes shared state or another principal's holding, so it needs\n      a named owner of the target (a panel, a question, the board, a session) or an explicit\n      statement that the effect is local and self-owned. A row that names no owner because it\n      changes only the caller's own local state says so here.\n",
          '    scope_rule: ""\n',
        ),
      ),
    ).toThrow();
  });
});
