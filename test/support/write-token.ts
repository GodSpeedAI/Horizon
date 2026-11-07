/**
 * Test preload: a test client acts like the desk page. Before a person's write it loads /desk, reads the write
 * token the page carries and sends it back. A request that sets `x-test-no-token` is left alone (it tests the refusal),
 * and so is any call marked as an agent's.
 */
const WRITES = new Set(["/desk/handoff", "/desk/handoff/preview", "/desk/decide", "/desk/note", "/desk/draft", "/desk/panels/op", "/desk/conversation/discard", "/desk/start", "/desk/lesson", "/intent", "/surface/intent"]);
const nativeFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input instanceof URL ? input.href : input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    if (method === "POST" && WRITES.has(url.pathname) && !headers.has("x-horizon-write") && !headers.has("x-horizon-source") && !headers.has("x-test-no-token")) {
      const page = await nativeFetch(`${url.origin}/desk`);
      const token = /name="horizon-write-token" content="([0-9a-f]+)"/.exec(await page.text())?.[1];
      if (token !== undefined) {
        headers.set("x-horizon-write", token);
        return nativeFetch(request && init === undefined ? new Request(request, { headers }) : input, { ...init, headers });
      }
    }
  } catch {
    // Not a URL we can read: send it as it is.
  }
  return nativeFetch(input, init);
}) as typeof fetch;
