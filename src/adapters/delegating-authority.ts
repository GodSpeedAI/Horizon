/**
 * Governed commits for a signed-in human operator go to SEA-Forge as the gateway (the service
 * principal) acting `on_behalf_of` the operator's mapped actor.
 *
 * The actor comes only from the validated operator-to-actor mapping, keyed by the durable operator id
 * that the session resolved to (the Caller). An operator with no mapping is refused here: there is no
 * fallback to the server operator, and the gateway identity is never sent as the human. Callers that
 * are not session operators (agents, the runtime's own system principal, the cockpit's launch-secret
 * operator) are left to the wrapped authority unchanged.
 */
import type { GovernanceAuthority, GovernanceDecision, GovernedOperation, SeaForgeAuthority } from "@godspeedai/cognate-runtime-bun";
import type { OperatorActors } from "../remote/operators.ts";
import type { SeaForgeActor } from "./sea-forge-config.ts";

export interface DelegationOptions {
  readonly service: SeaForgeActor;
  /** Set once the operators have been validated at startup; until then every session operator is refused. */
  readonly actors: () => OperatorActors | null;
  /** The cockpit's launch-secret operator principal: not a session operator. */
  readonly serverPrincipalId: string;
  /** The gateway client; only `decide` is used. Tests inject a fake. */
  readonly client: Pick<SeaForgeAuthority, "decide">;
}

/** The human a governed operation is run for, when it is a session operator; otherwise null. */
function sessionOperator(operation: GovernedOperation, serverPrincipalId: string): { readonly id: string } | null {
  const principal = operation.kind === "action" ? operation.caller.actor : operation.request.actor;
  if (principal.kind !== "user" || principal.id === serverPrincipalId) return null;
  return { id: principal.id };
}

export function delegatingAuthority(inner: GovernanceAuthority, options: DelegationOptions): GovernanceAuthority {
  const decide = async (operation: GovernedOperation, worldRef: string, approval?: Parameters<GovernanceAuthority["decide"]>[2]): Promise<GovernanceDecision> => {
    const operator = sessionOperator(operation, options.serverPrincipalId);
    if (operator === null) return inner.decide(operation, worldRef, approval);
    const actorId = options.actors()?.actorFor(operator.id);
    if (actorId === undefined) return { disposition: "unknown", reason: `no SEA-Forge actor is configured for operator ${operator.id}; refusing rather than falling back to another identity` };
    if (actorId === options.service.actor_id) return { disposition: "unknown", reason: "the gateway service identity cannot act as the human operator" };
    return options.client.decide(operation, worldRef, approval, undefined, { onBehalfOf: { actor_id: actorId, role: "operator" } });
  };
  return new Proxy(inner, {
    get(target, property) {
      if (property === "decide") return decide;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}
