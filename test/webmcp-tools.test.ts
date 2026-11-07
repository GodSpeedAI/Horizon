import { describe, expect, test } from "bun:test";
import { startDeskTools } from "../src/ui/desk/webmcp.ts";
import { NEVER_OFFERED, deskTools, type DeskAgentInvoker, type ToolDescriptor } from "../src/ui/desk/webmcp-tools.ts";

type Call = { method: string; args: unknown[] };

function fakeInvoker(overrides: Partial<DeskAgentInvoker> = {}): { invoker: DeskAgentInvoker; calls: Call[] } {
  const calls: Call[] = [];
  const record = (method: string, value: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return value;
  };
  const invoker: DeskAgentInvoker = {
    state: record("state", { notes: 1 }),
    find: record("find", { hits: [] }),
    inspect: record("inspect", { row: "r1" }),
    proposeHandoff: record("proposeHandoff", { preview: true }),
    proposeNote: record("proposeNote", { composer: true }),
    ...overrides,
  } as DeskAgentInvoker;
  return { invoker, calls };
}

function toolNamed(tools: ToolDescriptor[], name: string): ToolDescriptor {
  const found = tools.find((tool) => tool.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

async function textOf(tool: ToolDescriptor, input: unknown): Promise<string> {
  const result = await tool.invoke(input);
  expect(result.content.length).toBe(1);
  expect(result.content[0]?.type).toBe("text");
  return result.content[0]?.text ?? "";
}

const longText = (n: number) => "x".repeat(n);

describe("deskTools: the offered set", () => {
  test("exactly five tools, with the names the desk promises", () => {
    const { invoker } = fakeInvoker();
    const names = deskTools(invoker).map((tool) => tool.name);
    expect(names).toEqual(["desk_state", "desk_find", "desk_inspect", "desk_propose_handoff", "desk_propose_note"]);
  });

  test("every input schema is an object schema", () => {
    const { invoker } = fakeInvoker();
    for (const tool of deskTools(invoker)) {
      expect((tool.inputSchema as { type?: string }).type).toBe("object");
    }
  });

  test("no tool name contains a never-offered word", () => {
    const { invoker } = fakeInvoker();
    for (const tool of deskTools(invoker)) {
      for (const word of NEVER_OFFERED) {
        expect(tool.name.includes(word), `${tool.name} contains ${word}`).toBe(false);
      }
    }
  });

  test("the two propose tools say nothing is sent until the person confirms", () => {
    const { invoker } = fakeInvoker();
    for (const name of ["desk_propose_handoff", "desk_propose_note"]) {
      expect(toolNamed(deskTools(invoker), name).description).toContain("Nothing is sent until the person confirms it.");
    }
  });
});

describe("desk_state", () => {
  test("reads state with no input", async () => {
    const { invoker, calls } = fakeInvoker();
    const text = await textOf(toolNamed(deskTools(invoker), "desk_state"), undefined);
    expect(JSON.parse(text)).toEqual({ notes: 1 });
    expect(calls).toEqual([{ method: "state", args: [] }]);
  });

  test("an input that is not an object is an error and the invoker is not called", async () => {
    const { invoker, calls } = fakeInvoker();
    const text = await textOf(toolNamed(deskTools(invoker), "desk_state"), "please");
    expect(text.startsWith("Error:")).toBe(true);
    expect(calls.length).toBe(0);
  });
});

describe("desk_find", () => {
  const bad: [string, unknown][] = [
    ["missing q", {}],
    ["q not text", { q: 5 }],
    ["q empty", { q: "" }],
    ["q too long", { q: longText(201) }],
    ["input is not an object", "find things"],
    ["input is null", null],
    ["input is an array", ["q"]],
  ];
  for (const [label, input] of bad) {
    test(`rejects ${label} without calling the invoker`, async () => {
      const { invoker, calls } = fakeInvoker();
      const text = await textOf(toolNamed(deskTools(invoker), "desk_find"), input);
      expect(text.startsWith("Error:")).toBe(true);
      expect(calls.length).toBe(0);
    });
  }

  test("a 200 character query is accepted", async () => {
    const { invoker, calls } = fakeInvoker();
    await textOf(toolNamed(deskTools(invoker), "desk_find"), { q: longText(200) });
    expect(calls).toEqual([{ method: "find", args: [longText(200)] }]);
  });

  test("a valid query reaches find with the right argument", async () => {
    const { invoker, calls } = fakeInvoker();
    const text = await textOf(toolNamed(deskTools(invoker), "desk_find"), { q: "Acme invoice" });
    expect(JSON.parse(text)).toEqual({ hits: [] });
    expect(calls).toEqual([{ method: "find", args: ["Acme invoice"] }]);
  });
});

describe("desk_inspect", () => {
  const bad: [string, unknown][] = [
    ["missing row_id", {}],
    ["row_id not text", { row_id: 7 }],
    ["row_id empty", { row_id: "" }],
    ["row_id too long", { row_id: longText(201) }],
    ["input is not an object", "r1"],
  ];
  for (const [label, input] of bad) {
    test(`rejects ${label} without calling the invoker`, async () => {
      const { invoker, calls } = fakeInvoker();
      const text = await textOf(toolNamed(deskTools(invoker), "desk_inspect"), input);
      expect(text.startsWith("Error:")).toBe(true);
      expect(calls.length).toBe(0);
    });
  }

  test("a valid row id reaches inspect with the right argument", async () => {
    const { invoker, calls } = fakeInvoker();
    await textOf(toolNamed(deskTools(invoker), "desk_inspect"), { row_id: "row-42" });
    expect(calls).toEqual([{ method: "inspect", args: ["row-42"] }]);
  });
});

describe("desk_propose_handoff", () => {
  const bad: [string, unknown][] = [
    ["missing words", {}],
    ["words not text", { words: ["a"] }],
    ["words empty", { words: "" }],
    ["words too long", { words: longText(2001) }],
    ["case_id not text", { words: "hand over", case_id: 3 }],
    ["case_id empty", { words: "hand over", case_id: "" }],
    ["input is not an object", "hand over"],
  ];
  for (const [label, input] of bad) {
    test(`rejects ${label} without calling the invoker`, async () => {
      const { invoker, calls } = fakeInvoker();
      const text = await textOf(toolNamed(deskTools(invoker), "desk_propose_handoff"), input);
      expect(text.startsWith("Error:")).toBe(true);
      expect(calls.length).toBe(0);
    });
  }

  test("words alone reach proposeHandoff with no case", async () => {
    const { invoker, calls } = fakeInvoker();
    await textOf(toolNamed(deskTools(invoker), "desk_propose_handoff"), { words: "hand over to Ana" });
    expect(calls).toEqual([{ method: "proposeHandoff", args: ["hand over to Ana"] }]);
  });

  test("words and case_id reach proposeHandoff with both", async () => {
    const { invoker, calls } = fakeInvoker();
    await textOf(toolNamed(deskTools(invoker), "desk_propose_handoff"), { words: "hand over", case_id: "case-9" });
    expect(calls).toEqual([{ method: "proposeHandoff", args: ["hand over", "case-9"] }]);
  });
});

describe("desk_propose_note", () => {
  const bad: [string, unknown][] = [
    ["missing words", {}],
    ["words not text", { words: 1 }],
    ["words empty", { words: "" }],
    ["words too long", { words: longText(8001) }],
    ["input is not an object", "a note"],
  ];
  for (const [label, input] of bad) {
    test(`rejects ${label} without calling the invoker`, async () => {
      const { invoker, calls } = fakeInvoker();
      const text = await textOf(toolNamed(deskTools(invoker), "desk_propose_note"), input);
      expect(text.startsWith("Error:")).toBe(true);
      expect(calls.length).toBe(0);
    });
  }

  test("a valid note reaches proposeNote with the right argument", async () => {
    const { invoker, calls } = fakeInvoker();
    await textOf(toolNamed(deskTools(invoker), "desk_propose_note"), { words: "Called Ana about the invoice" });
    expect(calls).toEqual([{ method: "proposeNote", args: ["Called Ana about the invoice"] }]);
  });
});

describe("errors from the invoker", () => {
  test("a thrown error becomes a plain error text with no detail or stack", async () => {
    const { invoker } = fakeInvoker({
      find: async () => {
        throw new Error("secret-token-leak\n    at internal (/srv/desk.ts:10:3)");
      },
    });
    const text = await textOf(toolNamed(deskTools(invoker), "desk_find"), { q: "anything" });
    expect(text.startsWith("Error:")).toBe(true);
    expect(text.includes("secret")).toBe(false);
    expect(text.includes(" at ")).toBe(false);
  });
});

describe("startDeskTools", () => {
  function fakeDocument(behaviour: (name: string) => "ok" | "refuse") {
    const registrations: { name: string; signal: AbortSignal; execute: (args: unknown) => Promise<unknown> }[] = [];
    const modelContext = {
      registerTool: async (tool: { name: string; execute: (args: unknown) => Promise<unknown> }, options: { signal: AbortSignal }) => {
        if (behaviour(tool.name) === "refuse") throw new Error("refused");
        registrations.push({ name: tool.name, signal: options.signal, execute: tool.execute });
      },
    };
    return { doc: { modelContext } as unknown as Document, registrations };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("initializes the polyfill once and registers all five tools", async () => {
    const { doc, registrations } = fakeDocument(() => "ok");
    const { invoker } = fakeInvoker();
    let inits = 0;
    const handle = startDeskTools(doc, invoker, () => {
      inits += 1;
    });
    await settle();
    expect(inits).toBe(1);
    expect(registrations.map((r) => r.name)).toEqual(["desk_state", "desk_find", "desk_inspect", "desk_propose_handoff", "desk_propose_note"]);
    expect(handle.registered.length).toBe(5);
    expect(handle.failed).toEqual([]);
  });

  test("a registered execute runs the descriptor with the parsed input", async () => {
    const { doc, registrations } = fakeDocument(() => "ok");
    const { invoker, calls } = fakeInvoker();
    startDeskTools(doc, invoker, () => {});
    await settle();
    const find = registrations.find((r) => r.name === "desk_find");
    expect(find).toBeDefined();
    await find?.execute({ q: "Acme" });
    expect(calls).toEqual([{ method: "find", args: ["Acme"] }]);
  });

  test("a refused tool is reported in failed and the others still register", async () => {
    const { doc } = fakeDocument((name) => (name === "desk_inspect" ? "refuse" : "ok"));
    const { invoker } = fakeInvoker();
    const handle = startDeskTools(doc, invoker, () => {});
    await settle();
    expect(handle.failed).toEqual(["desk_inspect"]);
    expect(handle.registered).toEqual(["desk_state", "desk_find", "desk_propose_handoff", "desk_propose_note"]);
  });

  test("a missing surface reports every tool as failed and does not throw", async () => {
    const { invoker } = fakeInvoker();
    const handle = startDeskTools({} as unknown as Document, invoker, () => {});
    expect(handle.registered).toEqual([]);
    expect(handle.failed.length).toBe(5);
  });

  test("a polyfill init that throws does not throw out of startDeskTools", () => {
    const { doc } = fakeDocument(() => "ok");
    const { invoker } = fakeInvoker();
    const handle = startDeskTools(doc, invoker, () => {
      throw new Error("no window");
    });
    expect(handle.failed.length).toBe(5);
  });

  test("stop() aborts the signal every registration was given", async () => {
    const { doc, registrations } = fakeDocument(() => "ok");
    const { invoker } = fakeInvoker();
    const handle = startDeskTools(doc, invoker, () => {});
    await settle();
    expect(registrations.length).toBe(5);
    expect(registrations.every((r) => r.signal.aborted === false)).toBe(true);
    handle.stop();
    expect(registrations.every((r) => r.signal.aborted === true)).toBe(true);
  });
});
