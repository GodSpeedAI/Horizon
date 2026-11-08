/**
 * Test preload: a test client acts like a paired browser. The server prints each pairing code through a test-only sink
 * (receivePairingCodesForTests); this preload takes the code for an origin and pairs with it, through pairTestClient, the
 * first time that origin sees a request. Later requests send the session cookie back. A request that sets `x-test-no-session`
 * is sent as it is (it tests the refusal). Nothing here reads the terminal log.
 */
import { receivePairingCodesForTests } from "../../src/desk/pairing.ts";

const nativeFetch = globalThis.fetch.bind(globalThis);
const codes = new Map<string, string>();
const cookies = new Map<string, string>();

receivePairingCodesForTests((origin, code) => {
  codes.set(origin, code);
});

/** The pairing code printed for this origin, if a server has started there. Tests that pair by hand read it here. */
export function testCodeFor(origin: string): string | undefined {
  return codes.get(origin);
}

/** Pairs a test client with the code for this origin and remembers the session cookie. Null when the code is refused. */
export async function pairTestClient(origin: string, code: string | undefined = codes.get(origin)): Promise<string | null> {
  if (code === undefined) return null;
  const response = await nativeFetch(`${origin}/desk/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-no-session": "1" },
    body: JSON.stringify({ code }),
  });
  const cookie = /horizon_desk=([^;]+)/.exec(response.headers.get("set-cookie") ?? "");
  if (!response.ok || cookie === null) return null;
  const session = `horizon_desk=${cookie[1]}`;
  cookies.set(origin, session);
  return session;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input instanceof URL ? input.href : input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const exempt = url.pathname.startsWith("/agent/panels") || url.pathname === "/desk/pair" || headers.has("x-test-no-session");
    if (!exempt && !headers.has("cookie")) {
      const session = cookies.get(url.origin) ?? (await pairTestClient(url.origin));
      if (session !== null && session !== undefined) {
        headers.set("cookie", session);
        return nativeFetch(request && init === undefined ? new Request(request, { headers }) : input, { ...init, headers });
      }
    }
  } catch {
    // Not a URL we can pair with: send it as it is.
  }
  return nativeFetch(input, init);
}) as typeof fetch;
