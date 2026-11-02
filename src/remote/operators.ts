/**
 * Durable operators and their SEA-Forge actors.
 *
 * A session resolves to a durable operator (the shared identity service). The SEA-Forge actor that
 * operator acts as comes ONLY from this mapping, loaded from configuration at startup and validated
 * once. It is never read from a request body, header, cookie or phone-supplied string, and there is
 * no fallback to the server operator: an operator with no entry here cannot commit.
 *
 * The literal `operator` is the single-operator development default, and exists in this mapping only.
 */
import type { IdentityService } from "@godspeed/identity";
import type { OperatorsConfig } from "../config/types.ts";

export const DEV_OPERATOR = "operator";
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OPERATOR_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The backward-compatible single-operator development mapping. */
export const DEFAULT_OPERATORS: Required<OperatorsConfig> = {
  desktop_operator: DEV_OPERATOR,
  delegable_actors: [DEV_OPERATOR],
  actors: { [DEV_OPERATOR]: DEV_OPERATOR },
};

export class OperatorMappingError extends Error {
  override readonly name = "OperatorMappingError";
}

/** The validated mapping. Immutable after startup. */
export class OperatorActors {
  constructor(
    private readonly map: ReadonlyMap<string, string>,
    readonly desktopOperator: string,
  ) {}

  /** The SEA-Forge actor for a durable operator, or undefined when none is configured. */
  actorFor(operatorId: string): string | undefined {
    return this.map.get(operatorId);
  }

  operators(): readonly string[] {
    return [...this.map.keys()];
  }
}

export function resolveOperatorsConfig(config: OperatorsConfig | undefined): Required<OperatorsConfig> {
  if (config === undefined) return DEFAULT_OPERATORS;
  return {
    desktop_operator: config.desktop_operator ?? (Object.keys(config.actors).length === 1 ? Object.keys(config.actors)[0]! : ""),
    delegable_actors: config.delegable_actors ?? [...new Set(Object.values(config.actors))],
    actors: config.actors,
  };
}

/**
 * Validate the mapping against the identity store: every operator must exist and be active, every
 * actor must be a delegation target the gateway may present, and no actor may be the gateway's own
 * service identity (the gateway is the service principal, never the human).
 */
export async function validateOperatorActors(
  config: Required<OperatorsConfig>,
  context: { readonly identity: IdentityService; readonly tenant: string; readonly serviceActorId: string },
): Promise<OperatorActors> {
  const map = new Map<string, string>();
  const delegable = new Set(config.delegable_actors);
  for (const [operatorId, actorId] of Object.entries(config.actors)) {
    if (!OPERATOR_ID.test(operatorId)) throw new OperatorMappingError(`OPERATORS: ${JSON.stringify(operatorId)} is not a valid operator id`);
    if (!ACTOR_ID.test(actorId)) throw new OperatorMappingError(`OPERATORS: actor ${JSON.stringify(actorId)} for operator ${operatorId} is not a valid SEA-Forge actor id`);
    const operator = await context.identity.getOperator(context.tenant, operatorId);
    if (operator === undefined) throw new OperatorMappingError(`OPERATORS: operator ${operatorId} is not provisioned`);
    if (operator.status !== "active") throw new OperatorMappingError(`OPERATORS: operator ${operatorId} is ${operator.status}, not active`);
    if (operatorId === context.serviceActorId) throw new OperatorMappingError(`OPERATORS: operator ${operatorId} is the gateway service identity; it cannot be a human operator`);
    if (actorId === context.serviceActorId) throw new OperatorMappingError(`OPERATORS: actor ${actorId} is the gateway service identity; it cannot stand for a human operator`);
    if (!delegable.has(actorId)) throw new OperatorMappingError(`OPERATORS: actor ${actorId} for operator ${operatorId} is not an allowed delegation target`);
    map.set(operatorId, actorId);
  }
  if (!map.has(config.desktop_operator)) throw new OperatorMappingError(`OPERATORS: desktop operator ${JSON.stringify(config.desktop_operator)} has no actor mapping`);
  return new OperatorActors(map, config.desktop_operator);
}
