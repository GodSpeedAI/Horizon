/**
 * Every panel change carries a request id (finding R2-11). A test body that does not care about retries gets a fresh id here; a test
 * that retries names its own id and passes it through unchanged.
 */
export function withRequestId<T>(body: T): T {
  if (typeof body !== "object" || body === null || Array.isArray(body) || "request_id" in body) return body;
  return { ...body, request_id: crypto.randomUUID() };
}
