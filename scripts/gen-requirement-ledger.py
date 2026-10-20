#!/usr/bin/env python3
"""Generate Horizon's candidate requirement ledger from authoritative sources.

Deterministic: reads the frozen spec (requirement text, source path, digest) and
the plan (requirement -> settling tasks). Never invents requirement text or
sources; placeholder semantic bindings are explicitly marked candidate and are
refined when the canonical .sea model exists (T01) and frozen at T04 (P5).

Output: requirements/ledger.yaml (ledger v1, freeze_hash: candidate).
"""
import datetime
import hashlib
import json
import os
import re
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, ".agents", "specs", "horizon.agent.spec.yaml")
PLAN = os.path.join(REPO, ".agents", "plans", "horizon.plan.yaml")
POLICY = os.path.join(REPO, "scripts", "ledger-policy.yaml")
OUT = os.path.join(REPO, "requirements", "ledger.yaml")

CRITIC_PREDICATES = (
    "source-fidelity",
    "semantic-fidelity",
    "contradiction",
    "evasion",
    "verification-quality",
)

# Fallback binding entity per requirement family. Used only when no canonical
# `.sea` invariant instance names the requirement; the generator fails when the
# fallback itself is not a canonical entity.
ENTITY_BY_PREFIX = {
    "CASE": "CaseRecord",
    "GOAL": "NavigationContext",
    "NAV": "AffordanceAssessment",
    "OUT": "OperationRecord",
    "WORLD": "WorldRevision",
    "CONFIG": "NavigationContext",
    "INT": "NavigationIntentRecord",
    "UI": "SurfaceSpecRecord",
    "UX": "NavigationFrame",
    "VERIFY": "InteractionInvariant",
    "SAFE": "NavigationIntentRecord",
    "SEC": "ObserverActor",
    "STACK": "CognateHost",
    "DEV": "ExperimentRun",
    "RES": "ExperimentRun",
    "CMP": "CandidateRevision",
}

# What the fallback binds when no invariant instance names the requirement.
INVARIANT_BY_PREFIX = {
    "CASE": "a Case stays a derived view: it references world_ref and does not mint identity",
    "GOAL": "purpose is carried by context, not inferred from presentation",
    "NAV": "an affordance is assessed on its gates before any commitment, never on possibility",
    "OUT": "an operation's outcome is recorded with its settlement reference, not inferred from intent",
    "WORLD": "world_ref identity is immutable and owned by DomainForge",
    "CONFIG": "startup configuration is pinned (world_ref, observer, capabilities) before use",
    "INT": "an intent is a typed choice committed against a frame revision, not an API call",
    "UI": "presentation is declarative and sourced from behavioural availability",
    "UX": "a frame is a versioned snapshot a reader can reason over, never live mutable state",
    "VERIFY": "every claim carries a proof level and its evidence reference",
    "SAFE": "safety limits act on the committed intent record and its reversibility class",
    "SEC": "trust decisions resolve to the actor reference, not to payload fields",
    "STACK": "ownership is one-way: Horizon consumes each owner's public surface",
    "DEV": "a developmental claim is scored separately from the operational outcome",
    "RES": "a run's claim is scoped to its preregistered hypothesis and dataset",
    "CMP": "a comparison is hypothetical and never writes world state",
}

FROZEN_SURFACES = [
    ".agents/specs/**",
    ".agents/plans/**",
    ".agents/prereg/**",
    "requirements/ledger.yaml",
    ".wayfinder/**",
    "scripts/ledger-policy.yaml",
]
MUTABLE_SURFACES = ["src/**", "test/**", "scripts/**", "justfile", "config/**"]


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def matching_close(text, start):
    """Index of the `}` closing the instance body that starts at `start`."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return -1


def sea_invariant_by_requirement():
    """REQ id -> (invariant_id, statement) for `.sea` InteractionInvariant instances."""
    text = "\n".join(
        open(os.path.join(REPO, rel), encoding="utf-8").read() for rel in SEA_FILES
    )
    bindings = {}
    for m in re.finditer(r'instance\s+\w+\s+of\s+"InteractionInvariant"\s*\{', text):
        body = text[m.end():]
        body = body[: matching_close("{" + body, 0)]
        iid = re.search(r'invariant_id:\s*"([^"]+)"', body)
        stmt = re.search(r'statement:\s*"([^"]+)"', body)
        req = re.search(r'requirement_ref:\s*"([^"]+)"', body)
        if not (iid and stmt and req):
            raise SystemExit(f"malformed InteractionInvariant instance near {m.group(0)!r}")
        if req.group(1) in bindings:
            raise SystemExit(
                f"{req.group(1)} is bound to two invariants: "
                f"{bindings[req.group(1)][0]} and {iid.group(1)}"
            )
        bindings[req.group(1)] = (iid.group(1), stmt.group(1))
    return bindings


def restate(rid, text):
    """Observable statement of a requirement, preserving its normative polarity.

    The default contract states the obligation as the *required* observation:
      - "X MUST Y"      -> "X is observed to Y"        (positive obligation)
      - "X MUST NOT Y"  -> "X is never observed to Y"  (prohibition kept as a prohibition)
      - "A ...; B MUST NOT ..." -> each clause is restated on its own, with its own subject.

    Restatement strips terminal punctuation so the result reads as one clause, so clause
    boundaries are derived from the normative modals rather than from punctuation.
    Curated overrides (scripts/ledger-policy.yaml) replace it where the requirement names
    a conjunction one observable cannot settle. It is never "the gate passes".
    """
    clauses = _split_clauses(text)
    return " ".join(_restate_clause(c, first=(i == 0)) for i, c in enumerate(clauses))


# Subject = everything before the first normative modal. Kept verbatim so actors survive.
MODAL = re.compile(r"(?P<subject>.*?)\b(?P<modal>MUST NOT|MUST|SHOULD NOT|SHOULD|MAY NOT|MAY)\b\s*(?P<body>.*)$", re.S)


def _split_clauses(text):
    """Split on `;` and on `. ` boundaries — never on a decimal point or an abbreviation
    inside a word — then merge any piece that has no modal into the previous clause."""
    pieces = [p.strip() for p in re.split(r"(?<=[;])\s+|(?<=\.)\s+(?=[A-Z(])", text.strip()) if p.strip()]
    clauses = []
    for piece in pieces:
        if clauses and MODAL.match(piece) is None:
            clauses[-1] = f"{clauses[-1]} {piece}".strip()
        else:
            clauses.append(piece)
    return clauses


def _restate_clause(text, first=False):
    clause = text.strip().rstrip(".;").strip()
    match = MODAL.match(clause)
    if match is None:
        body = clause[0].lower() + clause[1:] if clause else clause
        return f"Observed: {body}."
    subject = " ".join(match.group("subject").split())
    if not first and re.match(r"[a-z]", subject):
        subject = subject[0].upper() + subject[1:]
    # Agreement is judged on the subject's head word, not on the requirement as a whole.
    head = re.sub(r"[()\[\]“”\"'.,:;*_`]", "", subject).split()[-1] if subject.split() else ""
    plural = (
        bool(re.search(PLURAL_HEADS, head))
        or (head.endswith("s") and not head.endswith(("ss", "us", "is", "ics", "sis")))
    )
    be = "are" if plural and not subject.endswith(("'s", "s'")) else "is"
    modal = match.group("modal")
    body = match.group("body").strip().rstrip(".;").strip()
    if modal in ("MUST NOT", "SHOULD NOT", "MAY NOT"):
        # "MUST NOT" and "MUST never" are prohibitions, not positive obligations.
        body = re.sub(r"^(never|not)\s+", "", body)
        return f"{subject} {be} never observed to {body}."
    if re.match(r"(never|always)\s+", body):
        body = re.sub(r"^(never|always)\s+", "", body)
        return f"{subject} {be} never observed to {body}."
    return f"{subject} {be} observed to {body}."


PLURAL_HEADS = r"(data|people|children|criteria|receipts|records|results|choices|surfaces|operations|requirements|contracts|artifacts|estimators|endpoints|connectors|actions|roles|gates|claims|paths|adapters|deployments|products|renderers|tools|approvals|estimates|objects|links|artifacts|views|fixtures|thresholds|capabilities)$"


_SELF_TEST = (
    # (requirement text, expected contract)
    ("RealityTrace delivery receipts MUST NOT be treated as evidence derivation or settlement.",
     "RealityTrace delivery receipts are never observed to be treated as evidence derivation or settlement."),
    ("An answer MUST NOT be misrepresented as independent approval.",
     "An answer is never observed to be misrepresented as independent approval."),
    ("DomainForge alone MUST own canonical semantic compilation.",
     "DomainForge alone is observed to own canonical semantic compilation."),
    ("A product MAY be reachable as a hosted surface; a hosted surface MUST NOT run inside Horizon's trust boundary.",
     "A product is observed to be reachable as a hosted surface. A hosted surface is never observed to run inside Horizon's trust boundary."),
)


def self_test():
    """Fail generation if restatement ever inverts a prohibition (F2 regression)."""
    for text, expected in _SELF_TEST:
        actual = restate("REQ-TEST", text)
        if actual != expected:
            raise SystemExit(f"restate() self-test failed for {text!r}: got {actual!r}, want {expected!r}")
    # The defect itself: a restated prohibition must never read as a positive observation.
    inverted = restate("REQ-TEST", "X MUST NOT be treated as approval")
    if "never observed" not in inverted or inverted.startswith("Observed in the runtime's own terms"):
        raise SystemExit(f"restate() dropped a prohibition: {inverted!r}")



def collect_requirements(node, path="$"):
    out = {}
    if isinstance(node, dict):
        rid = node.get("id")
        if isinstance(rid, str) and rid.startswith("REQ-"):
            text = node.get("text", "").strip()
            if rid in out and out[rid]["text"] != text:
                raise SystemExit(
                    f"{rid} is declared twice with different text: "
                    f"{out[rid]['section']} vs {path}"
                )
            out[rid] = {"text": text, "section": path}
        for k, v in node.items():
            if path.startswith("$.requirements") and isinstance(v, list) and k.endswith("signals"):
                # Per-requirement acceptance signals relabel the requirement id for
                # evidence. They must never shadow the frozen declaration (which lives
                # in the requirement sets or outcome contract).
                continue
            out.update(collect_requirements(v, f"{path}.{k}"))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.update(collect_requirements(v, f"{path}[{i}]"))
    return out


# ---------------------------------------------------------------------------
# Canonical semantic entities, parsed from the canonical `.sea` files so that an
# entity reference which does not exist cannot survive generation.
# ---------------------------------------------------------------------------

SEA_FILES = (
    ".sea/interaction/interaction-model.sea",
    ".sea/interaction/research-artifacts.sea",
    ".sea/interaction/product-integration-contract.sea",
)

ENTITY_RE = re.compile(r'^(?:export )?entity\s+"([^"]+)"')
ATTR_RE = re.compile(r"^\s*(?:key\s+)?([a-z][a-z0-9_]*)\s*:")


def sea_entities():
    entities = {}
    for rel in SEA_FILES:
        with open(os.path.join(REPO, rel), encoding="utf-8") as fh:
            for line in fh:
                m = ENTITY_RE.match(line.strip())
                if m:
                    entities[m.group(1)] = rel
    if not entities:
        raise SystemExit("no canonical .sea entities found; refusing to bind")
    return entities


def sea_entity_fields():
    """entity -> attribute names declared in its `.sea` block."""
    fields = {}
    current = None
    for rel in SEA_FILES:
        current = None
        with open(os.path.join(REPO, rel), encoding="utf-8") as fh:
            for line in fh:
                m = ENTITY_RE.match(line.strip())
                if m:
                    current = m.group(1)
                    fields[current] = []
                    continue
                if current is None:
                    continue
                if line.strip().startswith("}"):
                    current = None
                    continue
                am = ATTR_RE.match(line)
                if am:
                    fields[current].append(am.group(1))
    return fields



def load_policy():
    policy = yaml.safe_load(open(POLICY, encoding="utf-8")) or {}
    if policy.get("version") != 1:
        raise SystemExit(f"{POLICY}: unsupported version {policy.get('version')!r}")
    overrides = policy.get("overrides") or {}
    by_predicate = {}
    for predicate in CRITIC_PREDICATES:
        for rid in policy.get(predicate.replace("-", "_")) or []:
            if rid in by_predicate:
                raise SystemExit(f"policy binds {rid} to two critic predicates")
            by_predicate[rid] = predicate
    for rid in overrides:
        by_predicate.setdefault(rid, "source-fidelity")
    return policy, overrides, by_predicate


def task_gates(tasks):
    """Settlement commands: one gate per settling task, never a silent `just verify`."""
    if not tasks:
        return ["just verify"]
    return [f"just gate-{t.lower()}" for t in tasks]


def check_entity(entity, entities, rid):
    if entity not in entities:
        raise SystemExit(
            f"{rid}: semantic binding names {entity!r}, which is not a canonical .sea entity "
            f"(known: {', '.join(sorted(entities))})"
        )


def requirement_dependencies(reqs, mapping, edges):
    """REQ id -> REQ ids it depends on, via the plan DAG's reverse edges.

    A requirement settled by task T depends on every requirement settled by a
    direct predecessor of T. Transitive closure is deliberately NOT taken: it
    would make every requirement depend on everything, which is not an ordering
    constraint anyone can act on.
    """
    preds = {}
    for src, dst in edges:
        preds.setdefault(dst, set()).add(src)
    depends = {}
    for rid in sorted(reqs):
        tasks = set(mapping.get(rid) or [])
        upstream = set()
        for task in tasks:
            upstream |= preds.get(task, set())
        needs = set()
        for other in sorted(reqs):
            if other == rid:
                continue
            if tasks & set(mapping.get(other) or []):
                continue
            if set(mapping.get(other) or []) & upstream:
                needs.add(other)
        depends[rid] = sorted(needs)
    return depends


def main():
    self_test()
    spec_digest = sha256_of(SPEC)
    spec = yaml.safe_load(open(SPEC, encoding="utf-8"))
    plan = yaml.safe_load(open(PLAN, encoding="utf-8"))
    policy, overrides, predicates = load_policy()
    entities = sea_entities()
    invariant_bindings = sea_invariant_by_requirement()

    reqs = collect_requirements(spec)
    unknown_override = set(overrides) - set(reqs)
    if unknown_override:
        raise SystemExit(f"policy overrides unknown requirements: {sorted(unknown_override)}")

    mapping = (plan.get("traceability") or {}).get("requirement_to_tasks") or {}
    depends = requirement_dependencies(reqs, mapping, plan["dependency_graph"]["edges"])

    requirements = []
    contracts = []
    for rid in sorted(reqs):
        info = reqs[rid]
        prefix = rid.split("-")[1]
        tasks = mapping.get(rid) or []

        bound = invariant_bindings.get(rid)
        if prefix in ENTITY_BY_PREFIX:
            entity = ENTITY_BY_PREFIX[prefix]
        elif bound is not None:
            entity = "InteractionInvariant"
        else:
            raise SystemExit(
                f"{rid}: no semantic entity policy for prefix {prefix!r}; "
                "add it to ENTITY_BY_PREFIX rather than guessing a binding"
            )
        if bound is None:
            invariant = INVARIANT_BY_PREFIX.get(
                prefix, f"the requirement {rid} holds for {entity}"
            )
            invariant_source = "family"
        else:
            invariant_id, invariant = bound
            invariant_source = f"sea:{invariant_id}"
        check_entity(entity, entities, rid)

        gate = task_gates(tasks)
        ac = f"AC-{rid[4:]}-01"
        expected = overrides.get(rid) or restate(rid, info["text"])
        predicate = predicates.get(rid, "source-fidelity")
        requirements.append({
            "id": rid,
            "title": rid,
            "statement": info["text"],
            "source": {
                "file": ".agents/specs/horizon.agent.spec.yaml",
                "section": info["section"],
                "digest": f"sha256:{spec_digest}",
            },
            "semantic_binding": {
                "entity": entity,
                "entity_source": entities[entity],
                "invariant": invariant,
                "invariant_source": invariant_source,
            },
            "acceptance": [ac],
            "proof": gate,
            "settling_tasks": tasks,
            "mutable_surfaces": MUTABLE_SURFACES,
            "frozen_surfaces": FROZEN_SURFACES,
            "dependencies": depends[rid],
            "critic_predicate": predicate,
            "status": "candidate",
        })
        contracts.append({
            "id": ac,
            "requirement": rid,
            "expected": expected,
            "gate_command": gate,
            "status": "candidate",
        })

    unmapped = sorted(rid for rid in reqs if not (mapping.get(rid) or []))
    # Fidelity: the ledger must never assert a requirement the frozen spec does not
    # declare (this is how a shadowed signal once replaced REQ-VERIFY-* text).
    for rid, info in reqs.items():
        if not info["text"]:
            raise SystemExit(f"{rid}: requirement text is empty in the frozen spec")
    doc = {
        "ledger_version": 1,
        "project": "Horizon",
        "freeze_hash": "candidate",
        "generated_from": {
            "spec": ".agents/specs/horizon.agent.spec.yaml",
            "spec_sha256": spec_digest,
            "plan": ".agents/plans/horizon.plan.yaml",
            "plan_sha256": sha256_of(PLAN),
            "semantic_sources": list(SEA_FILES),
            "policy": os.path.relpath(POLICY, REPO),
            "policy_sha256": sha256_of(POLICY),
            "generator": "scripts/gen-requirement-ledger.py",
        },
        "population": (
            "candidate at T04. At freeze, scripts/freeze-formation.sh replaces freeze_hash "
            "with the sha256 of this document with the marker normalised to 'candidate' "
            "(fragment digest: a document cannot contain its own whole-file sha256). The "
            "Wayfinder freeze header's hashes block is authoritative: it records the "
            "whole-file sha256 of this ledger as written. scripts/check-ledger-freeze.sh "
            "verifies both and their agreement."
        ),
        "unmapped_requirements": unmapped,
        "requirements": requirements,
        "acceptance_contracts": contracts,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(
            "# Horizon requirement ledger (generated) — see scripts/gen-requirement-ledger.py\n"
        )
        yaml.safe_dump(doc, fh, sort_keys=False, allow_unicode=True, width=1000)
    print(
        f"wrote {os.path.relpath(OUT, REPO)}: {len(requirements)} requirements, "
        f"{len(contracts)} acceptance contracts, {len(invariant_bindings)} .sea-bound, "
        f"{len(unmapped)} unmapped, spec sha256 {spec_digest}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
