/**
 * SEA-Forge approval configuration (J02 IS3, REQ-UX-007). Socket-free: it decides who the operator and the
 * service are and where the gateway socket is; the wire protocol lives in the Cognate SDK client
 * (`SeaForgeAuthority` from @godspeedai/cognate-runtime-bun). On the local_operator profile one OS uid speaks
 * for both the Cognate service and the operator, so requests go as the service *on behalf of* the operator,
 * which SEA-Forge accepts only for an actor its gateway configuration lists as delegable. SEA-Forge refuses
 * the requester approving its own escalation; the operator must differ from the service actor.
 */
import type { SeaForgeActor } from "@godspeedai/cognate-runtime-bun";

export type { SeaForgeActor };

export const ENV_OPERATOR = "COGNATE_SEA_FORGE_OPERATOR";
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const PRINCIPAL_PREFIX = "actor:";
const SEA_FORGE_ACTOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The SEA-Forge actor id for a Horizon principal ref (`actor:<id>` becomes `<id>`). This is the one mapping
 * from the runtime's operator ref to the id the gateway's server.yaml binds. The generator uses it too, so
 * the unit, server.yaml and the adapter cannot disagree. A ref the gateway cannot bind is refused here.
 */
export function seaForgeActorOf(principalRef: string): string {
  if (!principalRef.startsWith(PRINCIPAL_PREFIX)) throw new Error(`APPROVAL: operator ref ${JSON.stringify(principalRef)} must be actor:<id>`);
  const id = principalRef.slice(PRINCIPAL_PREFIX.length);
  if (!SEA_FORGE_ACTOR_ID.test(id)) throw new Error(`APPROVAL: SEA-Forge actor id ${JSON.stringify(id)} must match ${SEA_FORGE_ACTOR_ID} (the gateway's rule)`);
  return id;
}

export interface ApprovalAuthority {
  readonly socketPath: string;
  readonly service: SeaForgeActor;
  readonly operator: SeaForgeActor;
  readonly timeoutMs?: number;
}

/**
 * `COGNATE_SEA_FORGE_OPERATOR` enables answering escalations from Horizon. Unset: no one can answer
 * (allow/deny still work). The approver is the configured operator ref (`operatorRef`, from
 * HORIZON_OPERATOR_REF / `identity.operator_ref`): one value for the cockpit's principal and the
 * SEA-Forge actor. If the variable is set to anything else, or without `COGNATE_GOVERNANCE=sea-forge`,
 * it is a startup error, never a guess.
 */
export function approvalAuthorityFromEnv(env: Readonly<Record<string, string | undefined>>, operatorRef: string): ApprovalAuthority | undefined {
  const named = env[ENV_OPERATOR]?.trim();
  const governed = env.COGNATE_GOVERNANCE?.trim() === "sea-forge";
  if (!named) return undefined;
  if (!governed) throw new Error(`${ENV_OPERATOR} is set but COGNATE_GOVERNANCE is not 'sea-forge'; refusing to guess`);
  if (named !== operatorRef) throw new Error(`${ENV_OPERATOR} (${named}) must equal the configured operator ref (${operatorRef}); one identity, not two`);
  return approvalAuthority({ socketPath: env.COGNATE_SEA_FORGE_SOCKET?.trim() ?? "", operatorId: operatorRef, serviceId: env.COGNATE_SEA_FORGE_ACTOR?.trim() || undefined });
}

export function approvalAuthority(options: { readonly socketPath: string; readonly operatorId: string; readonly serviceId?: string }): ApprovalAuthority {
  const serviceId = options.serviceId ?? "cognate-service";
  if (!options.socketPath) throw new Error("the SEA-Forge socket is required to answer escalations");
  if (!ACTOR_ID.test(options.operatorId)) throw new Error(`${ENV_OPERATOR} must name the operator actor bound in SEA-Forge`);
  const operatorActor = seaForgeActorOf(options.operatorId);
  if (operatorActor === serviceId) throw new Error(`${ENV_OPERATOR} must differ from the service actor: a requester cannot approve its own escalation`);
  return {
    socketPath: options.socketPath,
    service: { actor_id: serviceId, role: "service" },
    operator: { actor_id: operatorActor, role: "operator" },
  };
}
