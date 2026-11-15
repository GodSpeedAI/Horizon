import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ASSURANCE_PREDICATES,
  CUSTODY_PROFILES,
  custodyPreference,
  evidenceSatisfies,
  issuerCustodyVerdict,
  loadA3Mechanism,
  loadIssuerProfile,
  parseA3Mechanism,
  parseIssuerProfile,
} from "../src/contracts/identity/issuer.ts";
const ROOT = new URL("..", import.meta.url).pathname;
const profile = loadIssuerProfile();
const mechanism = loadA3Mechanism();
const policy = Bun.YAML.parse(readFileSync(`${ROOT}contracts/identity/v1/policy.yaml`, "utf8")) as Record<string, any>;
const records = JSON.parse(readFileSync(`${ROOT}contracts/identity/v1/records.json`, "utf8")) as Record<string, any>;

describe("issuer profile contract", () => {
  test("the contract parses and names its authority", () => {
    expect(profile.contract_id).toBe("horizon.identity.issuer-profile");
    expect(profile.contract_version).toBe("1.0.0");
    expect(profile.authority).toBeDefined();
  });

  test("Cognate owns identity issuance and SEA-Forge owns delegated authority (IP-01)", () => {
    expect(profile.ownership.identity_issuer.owner).toBe("Cognate");
    expect(profile.ownership.delegation_authority.owner).toBe("SEA-Forge");
    // Neither owner may take the other's function.
    const issuerScope = profile.ownership.identity_issuer.scope.join(" ");
    const authorityScope = profile.ownership.delegation_authority.scope.join(" ");
    expect(issuerScope.toLowerCase()).not.toContain("grant");
    expect(authorityScope.toLowerCase()).not.toContain("issuing credentials");
  });

  test("every custody profile is present exactly once and ordered by preference (IP-02)", () => {
    const ids = profile.custody_profiles.map((entry) => entry.id);
    expect(ids).toEqual([...CUSTODY_PROFILES]);
    expect(new Set(ids).size).toBe(ids.length);
    const preferences = profile.custody_profiles.map((entry) => entry.preference);
    expect(preferences).toEqual([...preferences].sort((a, b) => a - b));
    expect(custodyPreference(profile)).toEqual([...CUSTODY_PROFILES]);
  });

  test("the existing protected host service is the first choice and a daemon is not the default (IP-03)", () => {
    const first = profile.custody_profiles.find((entry) => entry.preference === 1)!;
    expect(first.id).toBe("existing_protected_host_service");
    expect(first.new_daemon).toBe(false);
    const broker = profile.custody_profiles.find((entry) => entry.id === "dedicated_cognate_authority_broker")!;
    expect(broker.preference).toBe(2);
    expect(broker.new_daemon).toBe(true);
    expect(broker.when_chosen.toLowerCase()).toContain("no existing service");
  });

  test("custody is exclusive and its disqualifiers are explicit (IP-04)", () => {
    expect(profile.issuer_security_property.name).toBe("exclusive_custody");
    const disqualifiers = profile.issuer_security_property.disqualifiers.join(" ").toLowerCase();
    expect(disqualifiers).toContain("readable by the agent");
    expect(disqualifiers).toContain("dpapi");
    expect(disqualifiers).toContain("issuance oracle");
    expect(profile.issuer_security_property.fallback_rule.toLowerCase()).toContain("without agent authority");
  });

  test("enrollment fixes the key, principal, agent instance and an independent sponsor (IP-05)", () => {
    const enrollment = profile.enrollment.principal_enrollment;
    expect(enrollment.registered_material["key"]).toContain("P-256");
    expect(enrollment.registered_material["principal"]).toBeTruthy();
    expect(enrollment.registered_material["agent_instance"]).toBeTruthy();
    expect((enrollment.registered_material["sponsor_proof"] ?? "").toLowerCase()).toContain("independent");
    expect(enrollment.replay_rule.toLowerCase()).toContain("refused");
    expect(profile.enrollment.human_principals.credential_rule.toLowerCase()).toContain("never issued");
  });

  test("issuance resolves the principal from the enrollment, never from the request (IP-06)", () => {
    expect(profile.issuance.caller_supplied_identity_is_refused.toLowerCase()).toContain("never accepts a caller-supplied principal");
    const refusals = profile.issuance.refusals.join(" ").toLowerCase();
    expect(refusals).toContain("human credential");
    expect(refusals).toContain("unregistered agent");
    expect(refusals).toContain("holder key");
  });

  test("a credential is audience-specific, holder-bound and time-limited (IP-07)", () => {
    const credential = profile.issuance.credential_properties as Record<string, any>;
    expect(credential.audience_specific).toBe(true);
    expect(credential.holder_bound.toLowerCase()).toContain("possession of the bytes alone is insufficient");
    expect(credential.max_ttl_seconds).toBe(policy.durations_seconds.credential_max_ttl);
    expect(credential.carries).toContain("holder_jwk");
    expect(credential.carries).toContain("authority_epoch");
    expect(credential.carries).toContain("issuer_generation");
  });

  test("renewal preserves identity and may only narrow (IP-08)", () => {
    const renewal = profile.issuance.renewal as Record<string, any>;
    expect(renewal.preserves.toLowerCase()).toContain("execution identity");
    expect(renewal.limits.join(" ").toLowerCase()).toContain("cannot widen scope");
    expect(renewal.limits.join(" ").toLowerCase()).toContain("cannot widen scope");
  });

  test("rotation, recovery and revocation are each specified (IP-09)", () => {
    const rotation = profile.key_rotation as Record<string, any>;
    expect(rotation.trust_root_rotation.invalidation.toLowerCase()).toContain("explicit policy");
    expect(rotation.holder_key_rotation.requires.toLowerCase()).toContain("enrollment");
    const recovery = profile.recovery as Record<string, any>;
    expect(recovery.enrollment_recovery_is_not_authority.toLowerCase()).toContain("never approves an operation");
    expect(recovery.enrollment_recovery_is_not_authority.toLowerCase()).toContain("creates a grant");
    const revocation = profile.revocation as Record<string, any>;
    expect(revocation.three_guarantees).toHaveLength(3);
    const guarantees = revocation.three_guarantees.map((entry: any) => entry.guarantee);
    expect(guarantees).toEqual(["Stop admission", "Prevent dispatch", "Prevent external commitment"]);
    // The issuer's generation and SEA-Forge's authority epoch are distinct and neither substitutes.
    expect(revocation.three_guarantees[0].required_participation.toLowerCase()).toContain("authority_epoch");
    expect(revocation.three_guarantees[0].required_participation.toLowerCase()).toContain("issuer generation");
    expect(revocation.three_guarantees[0].honest_statement.toLowerCase()).toContain("not interchangeable");
  });

  test("a restart creates no authority (IP-10)", () => {
    const restart = profile.restart_and_liveness as Record<string, any>;
    expect(restart.restart_creates_no_authority.toLowerCase()).toContain("does not resume authority");
    expect(restart.issuer_unavailable.toLowerCase()).toContain("no new agent attempt starts");
    expect(restart.clock_rollback.toLowerCase()).toContain("never refreshes authority");
  });

  test("the four platform lanes plus the no-issuer lane are each qualified (IP-11)", () => {
    const lanes = profile.qualification_lanes.lanes;
    const platforms = lanes.map((lane) => lane.platform);
    expect(platforms).toContain("windows_x64");
    expect(platforms).toContain("macos_x64_arm64");
    expect(platforms).toContain("linux_x86_64");
    expect(platforms).toContain("linux_arm64_jetson");
    expect(platforms).toContain("browser_only_no_issuer");
    for (const lane of lanes) expect(lane.preferred_mechanism.length).toBeGreaterThan(0);
    const jetson = lanes.find((lane) => lane.platform === "linux_arm64_jetson")!;
    expect(jetson.isolation_supported).toBe(false);
    expect(jetson.known_observation).toContain("Landlock");
  });

  test("the common lane tests cover custody, issuance, restart and rotation (IP-12)", () => {
    const ids = profile.qualification_lanes.common_tests.map((entry) => entry.id);
    expect(ids).toContain("Q-CUSTODY-01");
    expect(ids).toContain("Q-CUSTODY-04");
    expect(ids).toContain("Q-ISSUE-01");
    expect(ids).toContain("Q-ISSUE-04");
    expect(ids).toContain("Q-RESTART-01");
    expect(ids).toContain("Q-ROTATE-01");
    for (const entry of profile.qualification_lanes.common_tests) {
      expect(entry.test.length).toBeGreaterThan(0);
      expect(entry.pass.length).toBeGreaterThan(0);
    }
  });

  test("a host without qualified custody refuses agent identity rather than downgrading (IP-13)", () => {
    const noCustody = issuerCustodyVerdict(profile, { custodyEstablished: false });
    expect(noCustody.agentIdentityIssuance).toBe("refused");
    expect(noCustody.reason).toContain("custody_not_established");
    const unqualified = issuerCustodyVerdict(profile, { custodyEstablished: true, qualifiedProfile: null });
    expect(unqualified.agentIdentityIssuance).toBe("refused");
    const qualified = issuerCustodyVerdict(profile, {
      custodyEstablished: true,
      qualifiedProfile: "existing_protected_host_service",
    });
    expect(qualified.agentIdentityIssuance).toBe("permitted");
  });

  test("the contract claims no qualification result and no S2 (IP-14)", () => {
    const notClaimed = profile.not_claimed.join(" ").toLowerCase();
    expect(notClaimed).toContain("s2");
    expect(notClaimed).toContain("isolation");
    expect(profile.qualification_lanes.failure_rule.toLowerCase()).toContain("withholds agent authority");
  });

  test("a malformed contract fails to parse rather than loading as permissive (IP-15)", () => {
    expect(() => parseIssuerProfile("contract_id: x\n")).toThrow();
    const broken = { ...profile, custody_profiles: [{ id: "not_a_profile" }] };
    expect(() => parseIssuerProfile(JSON.stringify(broken))).toThrow();
  });
});

describe("A3 mechanism contract", () => {
  test("the contract parses and names its authority", () => {
    expect(mechanism.contract_id).toBe("horizon.identity.a3-mechanism");
    expect(mechanism.contract_version).toBe("1.0.0");
  });

  test("assurance is evaluated by predicate identity, not by ordinal (A3-01)", () => {
    expect(mechanism.assurance_levels.evaluation_rule.toLowerCase()).toContain("not by ordinal comparison");
    // The levels are A0, A1, A2, A3; A3-UV and A3-T are variants of A3, not levels of their own.
    // They are still distinct evidence classes, so both appear in the predicate vocabulary.
    const ids = mechanism.assurance_levels.levels.map((level) => level.id);
    expect(ids).toEqual(["A0", "A1", "A2", "A3"]);
    const variants = mechanism.assurance_levels.levels
      .flatMap((level) => level.variants ?? [])
      .map((variant) => variant.id);
    expect(variants.sort()).toEqual(["A3-T", "A3-UV"]);
    for (const predicate of ASSURANCE_PREDICATES) {
      const known = ids.includes(predicate) || variants.includes(predicate);
      expect(known).toBe(true);
    }
  });

  test("A3-UV and A3-T are distinct evidence classes (A3-02)", () => {
    const a3 = mechanism.assurance_levels.levels.find((level) => level.id === "A3")!;
    const variants = a3.variants!.map((variant) => variant.id).sort();
    expect(variants).toEqual(["A3-T", "A3-UV"]);
    // A terminal presence never satisfies a UV requirement, and neither substitutes for the other.
    expect(evidenceSatisfies("A3-UV", "A3-T")).toBe(false);
    expect(evidenceSatisfies("A3-UV", "protected_terminal_presence")).toBe(false);
    expect(evidenceSatisfies("A3-T", "A3-UV")).toBe(false);
    expect(evidenceSatisfies("A3", "A3-UV")).toBe(true);
    expect(evidenceSatisfies("A3-UV", "A3-UV")).toBe(true);
    expect(evidenceSatisfies("A3-UV", "A2")).toBe(false);
    expect(evidenceSatisfies("A3-UV", "A1")).toBe(false);
  });

  test("the v1 mechanism is the paired phone and Stage 0B is the local terminal (A3-03)", () => {
    const ids = mechanism.mechanisms.map((entry) => entry.id);
    expect(ids).toContain("a3_uv_paired_phone");
    expect(ids).toContain("a3_t_local_terminal");
    const phone = mechanism.mechanisms.find((entry) => entry.id === "a3_uv_paired_phone")!;
    expect(phone.stage).toBe(3);
    const terminal = mechanism.mechanisms.find((entry) => entry.id === "a3_t_local_terminal")!;
    expect(terminal.stage).toBe("0B");
    expect(terminal.predicate).toBe("A3-T");
    expect(terminal.limits!.join(" ").toLowerCase()).toContain("not a substitute");
  });

  test("the phone path renders in the phone client, never in agent-authored HTML (A3-04)", () => {
    const phone = mechanism.mechanisms.find((entry) => entry.id === "a3_uv_paired_phone")!;
    const path = phone.path.join(" ").toLowerCase();
    expect(path).toContain("not in agent-authored html");
    const verifier = phone.verifier as Record<string, string>;
    expect((verifier["runs_in"] ?? "").toLowerCase()).toContain("trust domain");
    expect((verifier["stores"] ?? "").toLowerCase()).toContain("never the raw assertion");
  });

  test("the challenge binds every field the design names (A3-05)", () => {
    const binding = mechanism.challenge_binding as Record<string, any>;
    const text = binding.rule.toLowerCase();
    for (const field of [
      "tenant",
      "trust domain",
      "device",
      "requesting execution",
      "operation id",
      "exact parameters",
      "targets",
      "resource revisions",
      "world/frame",
      "delegation head",
      "policy digest",
      "nonce",
      "expiry",
    ]) {
      expect(text).toContain(field);
    }
    expect(binding.constants.a3_challenge_ttl_seconds).toBe(policy.durations_seconds.a3_challenge_ttl);
    expect(binding.constants.pending_approval_ttl_seconds).toBe(policy.durations_seconds.pending_approval_ttl);
  });

  test("a page, a relay, a recovery code and an unknown predicate cannot approve (A3-06)", () => {
    const refused = mechanism.refused_paths.join(" ").toLowerCase();
    expect(refused).toContain("page session");
    expect(refused).toContain("relayed challenge");
    expect(refused).toContain("recovery code");
    expect(refused).toContain("caller-supplied operation");
    expect(mechanism.unknown_predicate_rule.toLowerCase()).toContain("fails closed");
  });

  test("recovery only enrolls and can never approve or authenticate (A3-07)", () => {
    const pairing = mechanism.pairing as Record<string, any>;
    expect(pairing.initial_pairing).toContain("local-console");
    expect(pairing.recovery_codes.replay.toLowerCase()).toContain("refused");
    const limits = pairing.recovery_limits.join(" ").toLowerCase();
    expect(limits).toContain("never approve an operation");
    expect(limits).toContain("never create a grant");
    expect(limits).toContain("never authenticate a browser session");
  });

  test("an unknown or wrong assurance level is refused, not rounded up (A3-08)", () => {
    expect(evidenceSatisfies("A3-UV", "A3-UNKNOWN")).toBe(false);
    expect(evidenceSatisfies("A3-UV", "")).toBe(false);
    expect(evidenceSatisfies("A3", "A0")).toBe(false);
  });

  test("S1 and S2 state their honest limits (A3-09)", () => {
    const limits = mechanism.profile_limits as Record<string, any>;
    expect(limits.S1.statement.toLowerCase()).toContain("agent-controlled");
    expect(limits.S1.consequence.toLowerCase()).toContain("at most a2");
    expect(limits.S2.statement.toLowerCase()).toContain("separate from the hostile desktop");
    expect(limits.S2.deployment_claim.toLowerCase()).toContain("never s2");
  });

  test("the A3 receipt record carries exactly the predicates the mechanism names (A3-10)", () => {
    const receipt = records.records.A3Receipt as Record<string, any>;
    const predicateField = receipt.fields.find((field: any) => field.name === "assurance_predicate");
    // Two predicates, no more: the protected-terminal presence is a claim beside the predicate,
    // never a third predicate string (R2-01).
    expect(predicateField.enum).toEqual(["A3-UV", "A3-T"]);
    const presenceField = receipt.fields.find((field: any) => field.name === "protected_terminal_presence");
    expect(presenceField).toBeDefined();
    expect(presenceField.type).toBe("boolean");
    const constraint = records.constraints.a3_uv_requires_uv;
    expect(constraint.rule.toLowerCase()).toContain("uv false is refused");
    // A3-T rests on the claim, and the two claims never stand in for each other.
    expect(records.constraints.a3_t_requires_protected_terminal_presence.rule.toLowerCase()).toContain("refused");
    expect(records.constraints.a3_uv_is_not_terminal_presence.rule.toLowerCase()).toContain("refused");
  });

  test("without a qualified channel the reserved action refuses with a repair path (A3-11)", () => {
    const none = mechanism.no_qualified_channel as Record<string, any>;
    expect(none.rule.toLowerCase()).toContain("refused with a truthful repair path");
    expect(none.rule.toLowerCase()).toContain("ordinary collaboration");
    expect(none.not_a_mutation_ban).toBeTruthy();
  });

  test("a malformed contract fails to parse rather than loading as permissive (A3-12)", () => {
    expect(() => parseA3Mechanism("contract_id: x\n")).toThrow();
    const broken = { ...mechanism, refused_paths: [] };
    expect(() => parseA3Mechanism(JSON.stringify(broken))).toThrow();
  });
});
