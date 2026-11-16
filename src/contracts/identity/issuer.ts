import { readFileSync } from "node:fs";
import { resourcePath } from "../../runtime/resource-root.ts";
import { z } from "zod";
/**
 * The issuer profile and the A3 mechanism contract, frozen at Stage 0A.
 *
 * These two files freeze *contracts*, not results. The issuer profile says who may issue an
 * identity, what custody an issuer must have, and what a platform lane must prove before it may
 * claim identity authority. The A3 mechanism says what a human-reserved confirmation is, which
 * paths may never create one, and what the qualification gate later records.
 *
 * Nothing here grants authority. A host with no qualified issuer is a legitimate state: the
 * loader reports it, and the contract says the host runs without agent authority rather than
 * downgrading to a weaker claim. Every check in this file is a statement about the contract's
 * internal consistency and its agreement with the frozen record and policy contracts — never a
 * claim that a platform has been qualified.
 */

/** The custody profiles, in the preference order the design fixes. */
export const CUSTODY_PROFILES = [
  "existing_protected_host_service",
  "dedicated_cognate_authority_broker",
  "organizational_remote_issuer",
] as const;
export type CustodyProfile = (typeof CUSTODY_PROFILES)[number];

/** The assurance predicates. Evaluated by identity, never by ordinal comparison. */
export const ASSURANCE_PREDICATES = ["A0", "A1", "A2", "A3", "A3-UV", "A3-T"] as const;
export type AssurancePredicate = (typeof ASSURANCE_PREDICATES)[number];

const custodyProfileSchema = z
  .object({
    id: z.enum(CUSTODY_PROFILES),
    preference: z.number().int().min(1),
    use: z.string().min(1),
    examples: z.array(z.string()).optional(),
    custody_requirement: z.string().min(1),
    claim: z.string().min(1),
    new_daemon: z.boolean(),
    when_chosen: z.string().min(1),
  })
  .strict();

const qualificationTestSchema = z
  .object({
    id: z.string().min(1),
    test: z.string().min(1),
    pass: z.string().min(1),
  })
  .strict();

const laneSchema = z
  .object({
    platform: z.string().min(1),
    preferred_mechanism: z.string().min(1),
    additional_tests: z.array(qualificationTestSchema).optional(),
    identity_claim: z.string().optional(),
    agent_authority: z.string().optional(),
    isolation_supported: z.union([z.boolean(), z.literal("conditional")]).optional(),
    isolation_condition: z.string().optional(),
    note: z.string().optional(),
    known_observation: z.string().optional(),
  })
  .strict();

const issuerProfileSchema = z
  .object({
    issuer_profile_version: z.string().min(1),
    contract_id: z.string().min(1),
    contract_version: z.string().min(1),
    frozen_at: z.string().min(1),
    authority: z.record(z.string(), z.unknown()),
    ownership: z
      .object({
        identity_issuer: z.object({ owner: z.string(), scope: z.array(z.string()), not_scope: z.array(z.string()) }),
        delegation_authority: z
          .object({
            owner: z.string(),
            scope: z.array(z.string()),
            not_scope: z.array(z.string()),
            relationship_to_issuer: z.string(),
          })
          .strict(),
        consumers: z.array(z.string()),
        consumer_rule: z.string(),
      })
      .strict(),
    issuer_security_property: z
      .object({
        name: z.string(),
        statement: z.string().min(1),
        disqualifiers: z.array(z.string()).min(1),
        fallback_rule: z.string().min(1),
      })
      .strict(),
    custody_profiles: z.array(custodyProfileSchema).min(1),
    profile_selection_rule: z.string().min(1),
    enrollment: z
      .object({
        principal_enrollment: z
          .object({
            subject: z.string(),
            registered_material: z.record(z.string(), z.string()),
            rule: z.string(),
            enrollment_authority: z.string(),
            replay_rule: z.string(),
            ephemeral_agents: z.string(),
          })
          .strict(),
        human_principals: z
          .object({
            established_by: z.string(),
            issuer_role: z.string(),
            credential_rule: z.string(),
          })
          .strict(),
      })
      .strict(),
    issuance: z
      .object({
        request_carries: z.array(z.string()).min(1),
        issuer_resolves_from: z.array(z.string()).min(1),
        caller_supplied_identity_is_refused: z.string().min(1),
        refusals: z.array(z.string()).min(1),
        credential_properties: z.record(z.string(), z.unknown()),
        renewal: z.record(z.string(), z.unknown()),
        issuance_authorization_rule: z.string().min(1),
      })
      .strict(),
    holder_binding: z.record(z.string(), z.unknown()),
    key_rotation: z.record(z.string(), z.unknown()),
    recovery: z.record(z.string(), z.unknown()),
    revocation: z.record(z.string(), z.unknown()),
    restart_and_liveness: z.record(z.string(), z.unknown()),
    qualification_lanes: z
      .object({
        common_tests: z.array(qualificationTestSchema).min(1),
        lanes: z.array(laneSchema).min(1),
        timebox: z.record(z.string(), z.unknown()),
        failure_rule: z.string().min(1),
      })
      .strict(),
    not_claimed: z.array(z.string()).min(1),
    refusals_are_first_class: z.record(z.string(), z.unknown()),
  })
  .strict();

const assuranceLevelSchema = z
  .object({
    id: z.enum(ASSURANCE_PREDICATES),
    predicate: z.string().min(1),
    valid_use: z.string().min(1),
    limit: z.string().optional(),
    variants: z.array(z.object({ id: z.string(), predicate: z.string(), valid_use: z.string() }).strict()).optional(),
  })
  .strict();

/**
 * One assurance requirement the catalog may name. The requirement says what it requires and
 * which separate claims accompany it, so an operation's evidence requirement is a checkable
 * statement rather than a label. A requirement may name no predicate at all — a presence claim
 * or a row that inherits its target's requirement — so `requires` may be empty, and a
 * caller-conditioned requirement names its predicates per caller kind instead.
 *
 * A compound requirement names its alternatives in `any_of`, and the OR is in the data: either
 * listed predicate satisfies it, and a predicate outside the list satisfies nothing. `requires` is
 * the conjunction; `any_of` is the disjunction.
 */
const assuranceRequirementSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    requires: z.array(z.string().min(1)).optional(),
    any_of: z.array(z.string().min(1)).min(1).optional(),
    requires_by_caller: z.record(z.string(), z.array(z.string().min(1))).optional(),
    claims: z.array(z.string().min(1)),
    note: z.string().optional(),
  })
  .strict()
  .refine((entry) => entry.requires !== undefined || entry.any_of !== undefined || entry.requires_by_caller !== undefined, {
    message: "A requirement names what it requires, either outright, as alternatives, or per caller kind",
  });
const a3MechanismSchema = z
  .object({
    a3_mechanism_version: z.string().min(1),
    contract_id: z.string().min(1),
    contract_version: z.string().min(1),
    frozen_at: z.string().min(1),
    authority: z.record(z.string(), z.unknown()),
    assurance_levels: z
      .object({
        evaluation_rule: z.string().min(1),
        levels: z.array(assuranceLevelSchema).min(1),
        separated_claims: z.record(z.string(), z.unknown()),
      })
      .strict(),
    mechanisms: z
      .array(
        z
          .object({
            id: z.string().min(1),
            role: z.string().min(1),
            stage: z.union([z.string(), z.number()]),
            path: z.array(z.string()).min(1),
            predicate: z.string().optional(),
            scope: z.string().optional(),
            limits: z.array(z.string()).optional(),
            verifier: z.record(z.string(), z.unknown()).optional(),
            record: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    challenge_binding: z.record(z.string(), z.unknown()),
    refused_paths: z.array(z.string()).min(1),
    unknown_predicate_rule: z.string().min(1),
    /**
     * The closed vocabulary of evidence requirements the operation catalog may name. The catalog
     * resolves its rows against this list, so the two contracts cannot drift into two
     * vocabularies, and a requirement id outside it is refused rather than rounded to the nearest
     * known one.
     */
    assurance_requirements: z.array(assuranceRequirementSchema).min(1),
    pairing: z.record(z.string(), z.unknown()),
    profile_limits: z.record(z.string(), z.unknown()),
    no_qualified_channel: z.record(z.string(), z.unknown()),
    qualification: z.record(z.string(), z.unknown()),
  })
  .strict();

export type IssuerProfile = z.infer<typeof issuerProfileSchema>;
export type A3Mechanism = z.infer<typeof a3MechanismSchema>;

function root(): string {
  return `${resourcePath()}/`;
}
export function parseIssuerProfile(source: string): IssuerProfile {
  return issuerProfileSchema.parse(Bun.YAML.parse(source));
}
export function parseA3Mechanism(source: string): A3Mechanism {
  return a3MechanismSchema.parse(Bun.YAML.parse(source));
}
export function loadIssuerProfile(path = `${root()}contracts/identity/v1/issuer-profile.yaml`): IssuerProfile {
  return parseIssuerProfile(readFileSync(path, "utf8"));
}
export function loadA3Mechanism(path = `${root()}contracts/identity/v1/a3-mechanism.yaml`): A3Mechanism {
  return parseA3Mechanism(readFileSync(path, "utf8"));
}

/** The custody profile a deployment selects first, and the one it falls back to. */
export function custodyPreference(profile: IssuerProfile): readonly CustodyProfile[] {
  return [...profile.custody_profiles]
    .sort((a, b) => a.preference - b.preference)
    .map((entry) => entry.id);
}

/**
 * Whether an issuer on this platform may mint agent identity at all.
 *
 * The answer is a claim about the *contract*, not about a measured host: a host without a
 * qualified custody profile runs without agent authority. There is deliberately no path that
 * downgrades to a weaker identity, because a silent downgrade is the failure this contract
 * exists to prevent.
 */
export function issuerCustodyVerdict(
  profile: IssuerProfile,
  options: { readonly qualifiedProfile?: CustodyProfile | null; readonly custodyEstablished?: boolean },
): { readonly agentIdentityIssuance: "permitted" | "refused"; readonly reason: string } {
  if (options.custodyEstablished !== true) {
    return {
      agentIdentityIssuance: "refused",
      reason: "custody_not_established: the host runs without agent authority rather than downgrading to a weaker identity claim",
    };
  }
  if (options.qualifiedProfile === undefined || options.qualifiedProfile === null) {
    return {
      agentIdentityIssuance: "refused",
      reason: "custody_not_established: no custody profile has been qualified on this platform",
    };
  }
  return { agentIdentityIssuance: "permitted", reason: `custody qualified by ${options.qualifiedProfile}` };
}

/** The assurance predicate an operation demands, compared by identity and never by ordinal. */
export function evidenceSatisfies(required: string, offered: string): boolean {
  const wanted = required.trim().toUpperCase();
  const given = offered.trim().toUpperCase();
  if (wanted === given) return true;
  // A3-UV and A3-T are distinct evidence classes. Neither is a substitute for the other, and a
  // terminal presence never satisfies a UV requirement.
  if (given === "PROTECTED_TERMINAL_PRESENCE") return false;
  if (wanted === "A3" && (given === "A3-UV" || given === "A3-T")) return true;
  return false;
}
