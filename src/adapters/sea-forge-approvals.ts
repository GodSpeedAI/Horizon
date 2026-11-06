/**
 * Answering a SEA-Forge escalation as the human operator (J02 IS3, REQ-UX-007). Interim socket client,
 * replaced by the Cognate SDK client in the adoption commit. Configuration lives in `sea-forge-config.ts`.
 */
import type { ApprovalAuthority } from "./sea-forge-config.ts";

const APPROVAL_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

/** Record the operator's decision at SEA-Forge. Throws when SEA-Forge refuses it. */
export async function resolveApproval(
  authority: ApprovalAuthority,
  request: { readonly approvalId: string; readonly resolution: "approved" | "rejected" },
): Promise<void> {
  if (!APPROVAL_ID.test(request.approvalId)) throw new Error("APPROVAL: a SEA-Forge approval id is required");
  if (request.resolution !== "approved" && request.resolution !== "rejected") throw new Error("APPROVAL: resolution must be approved or rejected");
  const response = await seaForgeCall(
    authority.socketPath,
    {
      verb: "authority_approval",
      approval_id: request.approvalId,
      resolution: request.resolution,
      request_id: `horizon:${request.approvalId}:${request.resolution}`,
      actor: authority.service,
      on_behalf_of: authority.operator,
    },
    authority.timeoutMs,
  );
  if (response.ok !== true) {
    throw new Error(`APPROVAL: SEA-Forge refused the resolution: ${String(response.error ?? response.error_class ?? JSON.stringify(response).slice(0, 300))}`);
  }
}

/**
 * The approvals SEA-Forge lists (`authority_approvals`, read-only). Returns the rows as SEA-Forge sent
 * them; the domain validates each row before it is shown (`src/domain/approval-inbox.ts`).
 */
export async function listApprovals(authority: ApprovalAuthority): Promise<unknown[]> {
  const response = await seaForgeCall(authority.socketPath, { verb: "authority_approvals", actor: authority.service }, authority.timeoutMs ?? 15_000);
  if (response.ok !== true || !Array.isArray(response.approvals)) {
    throw new Error(`APPROVAL: SEA-Forge did not list approvals: ${String(response.error ?? response.error_class ?? "no approvals array")}`);
  }
  return response.approvals;
}

/** One NDJSON request/response over the SEA-Forge Unix socket. The socket is closed however it ends. */
export async function seaForgeCall(socketPath: string, request: Record<string, unknown>, timeoutMs = 5_000): Promise<Record<string, unknown>> {
  let buffered = "";
  const decoder = new TextDecoder();
  let open: { end(): void } | undefined;
  return await new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: Error | null, value?: Record<string, unknown>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Settle before closing: in Bun, end() fires close() synchronously.
      if (error) reject(error);
      else resolve(value!);
      open?.end();
    };
    const timer = setTimeout(() => finish(new Error("SEA-Forge did not answer in time")), timeoutMs);
    Bun.connect({
      unix: socketPath,
      socket: {
        open(socket) {
          open = socket;
          socket.write(`${JSON.stringify(request)}\n`);
        },
        data(_socket, chunk) {
          // Stream mode: a multibyte character split across chunks is decoded whole.
          buffered += decoder.decode(chunk, { stream: true });
          const newline = buffered.indexOf("\n");
          if (newline < 0) return;
          try {
            finish(null, JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>);
          } catch {
            finish(new Error("SEA-Forge answered with invalid JSON"));
          }
        },
        close() {
          finish(new Error("SEA-Forge closed the connection without an answer"));
        },
        error(_socket, error) {
          finish(error);
        },
      },
    })
      .then((socket) => {
        open = socket;
        if (done) socket.end();
      })
      .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}
