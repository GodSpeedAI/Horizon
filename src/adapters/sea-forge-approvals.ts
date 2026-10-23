/**
 * Answering a SEA-Forge escalation as the human operator (J02 IS3, REQ-UX-007).
 *
 * The approval is a SEA-Forge record under the operator's own identity; Horizon keeps no approval
 * state of its own. On the local_operator profile one OS uid speaks for both the Cognate service and
 * the operator, so the request goes as the service *on behalf of* the operator, which SEA-Forge
 * accepts only for an actor its gateway configuration lists as delegable. SEA-Forge refuses the
 * requester approving its own escalation; the operator must differ from the service actor.
 *
 * Cognate 0.6.3 exports no approval-resolution call, so this mirrors Cognate-Workbench's
 * `seaForgeCall` (one NDJSON request over the Unix socket). Readiness debt: export it from Cognate.
 */
export const ENV_OPERATOR = "COGNATE_SEA_FORGE_OPERATOR";
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const APPROVAL_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

export interface SeaForgeActor {
  readonly actor_id: string;
  readonly role: string;
}

export interface ApprovalAuthority {
  readonly socketPath: string;
  readonly service: SeaForgeActor;
  readonly operator: SeaForgeActor;
  readonly timeoutMs?: number;
}

/**
 * `COGNATE_SEA_FORGE_OPERATOR` names the operator actor bound in SEA-Forge. Unset: no one can answer
 * an escalation from Horizon (allow/deny still work). Set without `COGNATE_GOVERNANCE=sea-forge`, or
 * equal to the service actor, it is a startup error, never a guess.
 */
export function approvalAuthorityFromEnv(env: Readonly<Record<string, string | undefined>>): ApprovalAuthority | undefined {
  const operatorId = env[ENV_OPERATOR]?.trim();
  const governed = env.COGNATE_GOVERNANCE?.trim() === "sea-forge";
  if (!operatorId) return undefined;
  if (!governed) throw new Error(`${ENV_OPERATOR} is set but COGNATE_GOVERNANCE is not 'sea-forge'; refusing to guess`);
  return approvalAuthority({ socketPath: env.COGNATE_SEA_FORGE_SOCKET?.trim() ?? "", operatorId, serviceId: env.COGNATE_SEA_FORGE_ACTOR?.trim() || undefined });
}

export function approvalAuthority(options: { readonly socketPath: string; readonly operatorId: string; readonly serviceId?: string }): ApprovalAuthority {
  const serviceId = options.serviceId ?? "cognate-service";
  if (!options.socketPath) throw new Error("the SEA-Forge socket is required to answer escalations");
  if (!ACTOR_ID.test(options.operatorId)) throw new Error(`${ENV_OPERATOR} must name the operator actor bound in SEA-Forge`);
  if (options.operatorId === serviceId) throw new Error(`${ENV_OPERATOR} must differ from the service actor: a requester cannot approve its own escalation`);
  return {
    socketPath: options.socketPath,
    service: { actor_id: serviceId, role: "service" },
    operator: { actor_id: options.operatorId, role: "operator" },
  };
}

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
