/**
 * Test support: a fake `gh` executable. `installFakeGh(dir)` writes `<dir>/bin/gh` (put `<dir>/bin` first on PATH)
 * and `<dir>/state.json`. Every call is recorded in the state's `calls`; `failOn` makes any call whose arguments
 * contain one of its substrings exit 1. The tests never reach real GitHub.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A REST-level issue, as `gh api` would return it. */
export interface FakeRestIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  html_url: string;
  updated_at: string;
  comments: { id: number; body: string; user?: { login: string } }[];
  /** A deleted issue answers 404 and drops out of listings. */
  deleted?: boolean;
  parent_issue_url?: string;
}

/** Make a matching call fail. `times` -1 means every time. A `status` answers like GitHub (headers, then exit 1). */
export interface FakeFailure {
  match: string;
  times: number;
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  stderr?: string;
  exit?: number;
  /** Answer with `status` (default 200) and `body`, and exit 0 (GraphQL reports errors this way). */
  ok?: boolean;
}

export interface FakeGhState {
  /** REST and GraphQL emulation used by the GitHub connector (calls made with `--include`). */
  rest?: {
    nextId: number;
    issues: FakeRestIssue[];
    /** Every write, in order: `{method, path, body}`. */
    writes: { method: string; path: string; body: unknown }[];
    projects: { id: string; title: string; fields: { id: string; name: string }[]; items: { id: string; content: string; values: Record<string, string> }[] }[];
    /** Whether `sub_issues` is available. */
    subIssues: boolean;
    /** Page size for comments, issues, sub-issues and GraphQL lists (default 100). */
    pageSize?: number;
    /** The signed-in user's login. */
    login?: string;
  };
  failures?: FakeFailure[];
  calls: string[][];
  failOn: string[];
  scopes: string[];
  issues: { id: string; number: number; title: string }[];
  projects: { id: string; number: number; title: string }[];
  /** Issue creation numbers continue from here. */
  nextNumber: number;
}

export interface FakeGh {
  readonly bin: string;
  readonly statePath: string;
  /** PATH and FAKE_GH_STATE to merge into an environment. */
  env(base?: Record<string, string | undefined>): Record<string, string>;
  state(): FakeGhState;
  update(change: (state: FakeGhState) => void): void;
  calls(): string[][];
}

export function emptyRest(over: { subIssues?: boolean } = {}): NonNullable<FakeGhState["rest"]> {
  return { nextId: 5000, issues: [], writes: [], projects: [], subIssues: over.subIssues ?? true };
}

/** An issue as GitHub would hold it, for seeding `rest.issues`. */
export function restIssue(repo: string, number: number, over: Partial<FakeRestIssue> = {}): FakeRestIssue {
  return { id: 1000 + number, node_id: `I_${number}`, number, title: `Issue ${number}`, body: "", state: "open", labels: [], html_url: `https://github.com/${repo}/issues/${number}`, updated_at: "2026-11-07T00:00:00Z", comments: [], ...over };
}

export function installFakeGh(dir: string, seed: Partial<FakeGhState> = {}): FakeGh {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const statePath = join(dir, "gh-state.json");
  const initial: FakeGhState = { calls: [], failOn: [], scopes: ["repo", "project"], issues: [], projects: [], nextNumber: 1, ...seed };
  writeFileSync(statePath, JSON.stringify(initial));
  const script = join(bin, "gh");
  writeFileSync(script, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(import.meta.path)} "$@"\n`);
  chmodSync(script, 0o755);
  const read = () => JSON.parse(readFileSync(statePath, "utf8")) as FakeGhState;
  return {
    bin,
    statePath,
    env: (base = process.env) => ({ ...(base as Record<string, string>), PATH: `${bin}:${base.PATH ?? ""}`, FAKE_GH_STATE: statePath }),
    state: read,
    update(change) {
      const state = read();
      change(state);
      writeFileSync(statePath, JSON.stringify(state));
    },
    calls: () => read().calls,
  };
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const REASON: Record<number, string> = { 200: "OK", 201: "Created", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };

/** GitHub's reply: headers, a blank line, the body. */
function reply(status: number, body: unknown, headers: Record<string, string> = {}): string {
  const head = [`HTTP/2.0 ${status} ${REASON[status] ?? ""}`, "Content-Type: application/json; charset=utf-8", ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
  return `${head.join("\r\n")}\r\n\r\n${typeof body === "string" ? body : JSON.stringify(body)}`;
}

function restMain(state: FakeGhState, args: string[], stdin: string): { out: string; err?: string; code: number } {
  const rest = state.rest!;
  const graphql = args.includes("graphql");
  const method = flag(args, "-X") ?? "GET";
  const path = graphql ? "graphql" : (args.find((a, i) => i > 0 && !a.startsWith("-") && args[i - 1] !== "-X" && a !== "--include") ?? "");
  const body = stdin.trim() === "" ? undefined : (JSON.parse(stdin) as any);
  const now = new Date().toISOString();
  const fail = state.failures?.find((f) => f.times !== 0 && `${args.join(" ")}`.includes(f.match));
  if (fail) {
    if (fail.times > 0) fail.times -= 1;
    if (fail.ok) return { out: reply(fail.status ?? 200, fail.body ?? {}, fail.headers), code: 0 };
    if (fail.status) return { out: reply(fail.status, fail.body ?? { message: REASON[fail.status] ?? "error" }, fail.headers), err: fail.stderr ?? `gh: ${REASON[fail.status] ?? "error"} (HTTP ${fail.status})`, code: 1 };
    return { out: "", err: fail.stderr ?? "error connecting to api.github.com", code: fail.exit ?? 1 };
  }
  if (method !== "GET" || graphql) rest.writes.push({ method, path, body });
  const ok = (value: unknown, status = 200) => ({ out: reply(status, value), code: 0 });
  const notFound = () => ({ out: reply(404, { message: "Not Found" }), err: "gh: Not Found (HTTP 404)", code: 1 });
  const view = (i: FakeRestIssue) => {
    const { comments: _c, deleted: _d, ...rest2 } = i;
    return { ...rest2, labels: i.labels.map((name) => ({ name })) };
  };

  const LOGIN = rest.login ?? "horizon-bot";
  const pageOf = <T>(rows: T[]): T[] => {
    const size = rest.pageSize ?? 100;
    const per = Number(new URLSearchParams(path.split("?")[1] ?? "").get("per_page") ?? "100");
    const page = Number(new URLSearchParams(path.split("?")[1] ?? "").get("page") ?? "1");
    const n = Math.min(size, per);
    return rows.slice((page - 1) * n, page * n);
  };
  if (path === "user") return ok({ login: LOGIN });
  if (graphql) {
    const q: string = body?.query ?? "";
    const v = body?.variables ?? {};
    const size = rest.pageSize ?? 50;
    const start = Number(v.after ?? 0);
    const info = (total: number) => ({ hasNextPage: start + size < total, endCursor: String(start + size) });
    if (/node\(id/.test(q)) {
      const project = rest.projects.find((p) => p.id === v.id)!;
      return ok({ data: { node: { fields: { nodes: project.fields.slice(start, start + size), pageInfo: info(project.fields.length) } } } });
    }
    if (/projectsV2\(/.test(q)) {
      const page = rest.projects.slice(start, start + size);
      return ok({ data: { organization: { id: "O_1", projectsV2: { nodes: page.map((p) => ({ id: p.id, title: p.title, fields: { nodes: p.fields.slice(0, size), pageInfo: { hasNextPage: p.fields.length > size, endCursor: String(size) } } })), pageInfo: info(rest.projects.length) } } } });
    }
    if (/createProjectV2\(/.test(q)) {
      const project = { id: `PVT_${rest.projects.length + 1}`, title: v.title, fields: [], items: [] };
      rest.projects.push(project);
      return ok({ data: { createProjectV2: { projectV2: { id: project.id, title: project.title } } } });
    }
    if (/createProjectV2Field/.test(q)) {
      const project = rest.projects.find((p) => p.id === v.project)!;
      const field = { id: `F_${project.id}_${project.fields.length + 1}`, name: v.name };
      project.fields.push(field);
      return ok({ data: { createProjectV2Field: { projectV2Field: field } } });
    }
    if (/addProjectV2ItemById/.test(q)) {
      const project = rest.projects.find((p) => p.id === v.project)!;
      let item = project.items.find((i) => i.content === v.content);
      if (!item) project.items.push((item = { id: `PVTI_${project.items.length + 1}`, content: v.content, values: {} }));
      return ok({ data: { addProjectV2ItemById: { item: { id: item.id } } } });
    }
    if (/updateProjectV2ItemFieldValue/.test(q)) {
      const project = rest.projects.find((p) => p.id === v.project)!;
      const item = project.items.find((i) => i.id === v.item)!;
      item.values[project.fields.find((f) => f.id === v.field)?.name ?? v.field] = v.text;
      return ok({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: item.id } } } });
    }
    return ok({ data: {} });
  }

  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const m = /^repos\/([^/]+\/[^/]+)(?:\/(.*))?$/.exec(route ?? "");
  if (!m) return notFound();
  const repo = m[1]!;
  const tail = m[2] ?? "";
  if (tail === "issues" && method === "GET") {
    const label = params.get("labels");
    const page = Number(params.get("page") ?? "1");
    const rows = rest.issues.filter((i) => !i.deleted && (!label || i.labels.includes(label)));
    return ok(pageOf(rows).map(view));
  }
  if (tail === "issues" && method === "POST") {
    const number = rest.issues.length + 1;
    const issue: FakeRestIssue = { id: rest.nextId++, node_id: `I_${number}`, number, title: body.title, body: body.body ?? "", state: "open", labels: body.labels ?? [], html_url: `https://github.com/${repo}/issues/${number}`, updated_at: now, comments: [] };
    rest.issues.push(issue);
    return ok(view(issue), 201);
  }
  const one = /^issues\/(\d+)(?:\/(comments|labels|sub_issues)(?:\/(.+))?)?$/.exec(tail);
  if (!one) return notFound();
  const issue = rest.issues.find((i) => i.number === Number(one[1]));
  if (!issue || issue.deleted) return notFound();
  const sub = one[2];
  if (!sub && method === "GET") return ok(view(issue));
  if (!sub && method === "PATCH") {
    for (const key of ["title", "body", "state"] as const) if (body[key] !== undefined) (issue as any)[key] = body[key];
    issue.updated_at = now;
    return ok(view(issue));
  }
  if (sub === "comments" && method === "GET") return ok(pageOf(issue.comments));
  if (sub === "comments" && method === "POST") {
    const comment = { id: rest.nextId++, body: body.body, user: { login: LOGIN } };
    issue.comments.push(comment);
    return ok(comment, 201);
  }
  if (sub === "labels" && method === "PUT") {
    issue.labels = body.labels;
    return ok(body.labels.map((name: string) => ({ name })));
  }
  if (sub === "labels" && method === "POST") {
    for (const name of body.labels as string[]) if (!issue.labels.includes(name)) issue.labels.push(name);
    return ok(issue.labels.map((name) => ({ name })));
  }
  if (sub === "labels" && method === "DELETE") {
    issue.labels = issue.labels.filter((l) => l !== decodeURIComponent(one[3] ?? ""));
    return ok(issue.labels.map((name) => ({ name })));
  }
  if (sub === "sub_issues" && method === "GET") return ok(pageOf(rest.issues.filter((i) => i.parent_issue_url?.endsWith(`/issues/${issue.number}`)).map(view)));
  if (sub === "sub_issues" && method === "POST") {
    if (!rest.subIssues) return notFound();
    const child = rest.issues.find((i) => i.id === body.sub_issue_id);
    if (!child) return { out: reply(422, { message: "Validation Failed" }), err: "gh: Validation Failed (HTTP 422)", code: 1 };
    if (child.parent_issue_url) return { out: reply(422, { message: "Validation Failed", errors: ["Issue may not already have a parent"] }), err: "gh: Validation Failed (HTTP 422)", code: 1 };
    child.parent_issue_url = `https://api.github.com/repos/${repo}/issues/${issue.number}`;
    return ok(view(child), 201);
  }
  return notFound();
}

async function fakeMain(args: string[]): Promise<number> {
  const statePath = process.env.FAKE_GH_STATE;
  if (!statePath) {
    console.error("fake gh: FAKE_GH_STATE is not set");
    return 3;
  }
  const state = JSON.parse(readFileSync(statePath, "utf8")) as FakeGhState;
  state.calls.push(args);
  const save = () => writeFileSync(statePath, JSON.stringify(state));
  const joined = args.join(" ");
  if (state.rest && args[0] === "api" && args.includes("--include")) {
    const stdin = args.includes("--input") ? await Bun.stdin.text() : "";
    const result = restMain(state, args, stdin);
    save();
    await new Promise<void>((resolve) => process.stdout.write(result.out, () => resolve()));
    if (result.err) console.error(result.err);
    return result.code;
  }
  if (state.failOn.some((needle) => joined.includes(needle))) {
    save();
    console.error(`fake gh: failing on demand: ${joined}`);
    return 1;
  }
  const [a, b] = args;
  let out = "";
  if (a === "auth" && b === "status") {
    out = `github.com\n  - Token scopes: ${state.scopes.map((s) => `'${s}'`).join(", ")}\n`;
  } else if (a === "repo" && b === "view") {
    out = JSON.stringify({ name: "horizon-sandbox" });
  } else if (a === "project" && b === "list") {
    out = JSON.stringify({ projects: state.projects, totalCount: state.projects.length });
  } else if (a === "project" && b === "create") {
    const number = state.projects.length + 1;
    const project = { id: `PVT_${number}`, number, title: flag(args, "--title") ?? "" };
    state.projects.push(project);
    out = JSON.stringify(project);
  } else if (a === "project" && b === "item-list") {
    out = JSON.stringify({ items: [] });
  } else if (a === "issue" && b === "list") {
    out = JSON.stringify(state.issues);
  } else if (a === "issue" && b === "create") {
    const number = state.nextNumber++;
    state.issues.push({ id: `I_${number}`, number, title: flag(args, "--title") ?? "" });
    out = `https://github.com/${flag(args, "-R")}/issues/${number}\n`;
  } else if (a === "api" && args.includes("graphql")) {
    const query = flag(args, "-f") ?? "";
    const issue = /issueId: "([^"]+)"/.exec(query)?.[1];
    const project = /projectId: "([^"]+)"/.exec(query)?.[1];
    if (issue) state.issues = state.issues.filter((i) => i.id !== issue);
    if (project) state.projects = state.projects.filter((p) => p.id !== project);
    out = "{}";
  } else if (a === "api" && /\/issues\/\d+$/.test(args[1] ?? "")) {
    out = `${9000 + Number(args[1]!.split("/").pop())}\n`;
  } else if (a === "api" && args.some((x) => x.endsWith("/sub_issues"))) {
    out = "{}";
  } else {
    save();
    console.error(`fake gh: unsupported call: ${joined}`);
    return 2;
  }
  save();
  process.stdout.write(out);
  return 0;
}

if (import.meta.main) process.exit(await fakeMain(process.argv.slice(2)));
