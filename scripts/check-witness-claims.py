#!/usr/bin/env python3
"""Check that an acceptance contract restates its requirement without adding policy.

The first independent verdict caught four contracts whose *polarity* was inverted. Its
successor defect class is subtler and was found by criticism round 1: a contract can keep
the polarity and still add policy, by

  * negating a permission (a MAY restated as a positive or as an absolute),
  * turning a SHOULD into a MUST,
  * adding a behaviour the requirement does not name (a governed activation sequence, a
    prescribed construction path, a remedy),
  * adding an authority the requirement does not grant (a first responder),
  * adding a quantifier ("exactly", "only after", "every") the requirement does not use,
  * or marking the contract `potentially-ratified`, which reads as a proposed amendment
    while the ruler is frozen.

Ratification (turning a hold into a normative clause) is never automatic: it requires a new
frozen spec version, and this script says so rather than performing it.

Usage:
  check-witness-claims.py [--ledger PATH]... [--ratified PATH]... [--fail-on-ratified]
  Defaults: the active ledger and the candidate ledger, where each exists.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, ".agents", "specs", "horizon.agent.spec.yaml")
CANDIDATE_LEDGER = os.path.join(REPO, ".agents", "candidates", "horizon", "T04-CR-001", "ledger.yaml")

GENERIC_PREFIX = "Observed in the runtime's own terms:"

# Terms a contract may add only if the requirement itself uses them, grouped by the kind of
# policy they would smuggle in so that a finding says what the defect is.
BEHAVIOUR_TERMS = ("activation", "authorized promotion", "exercised through", "construction", "remedy", "granting revision")
AUTHORITY_TERMS = ("first available", "first responder", "first that addresses")
QUANTIFIER_TERMS = ("exactly", "only after", "every", "any other")


def spec_requirements() -> dict[str, str]:
    found: dict[str, str] = {}

    def walk(node) -> None:
        if isinstance(node, dict):
            value = node.get("id")
            if isinstance(value, str) and value.startswith("REQ-") and isinstance(node.get("text"), str):
                found.setdefault(value, " ".join(node["text"].split()))
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(yaml.safe_load(open(SPEC, encoding="utf-8")))
    return found


# Terms that distinguish one actor from another that shares its head noun ("active world"
# vs "candidate-versus-active diff" are already distinct heads; "hosted surface" vs
# "SEA-Forge approvals" are not, so each actor's own name is kept).
DISTINGUISHING = {"checkpoint", "world", "operation", "focus", "product", "surface", "hosted", "diff", "controller", "controller's"}


def shares_subject(contract_clause: str, requirement_clause: str) -> bool:
    """Whether two clauses are about the same subject.

    The clause's subject is the words before its first normative modal, normalised the way
    the generator normalises it (lower case, parentheticals dropped, articles ignored).
    Restating "X MUST NOT Y" as "X is never observed to Y" keeps X, so X still identifies
    the clause; a contract that names a different actor does not.
    """
    def subject(text: str) -> set[str]:
        """The head word and the distinguishing terms of a clause's subject.

        A restatement adds its own words to the same subject ("A product with its own UI"
        -> "A product ..."), and drops others, so identity is judged on the subject's head
        word ("world", "product", "diff", "controller") rather than on every modifier
        (acronyms and proper nouns included).
        """
        head = re.split(r"\b(MUST|SHOULD|MAY)\b| is observed to | are observed to ", text, maxsplit=1)[0]
        head = re.sub(r"\([^)]*\)", " ", head.lower())
        terms = {w for w in re.findall(r"[a-z][a-z0-9_-]+", head)} - {"the", "a", "an", "its", "their", "every", "only"}
        if not terms:
            return set()
        return {max(terms, key=len)} | {t for t in terms if t in DISTINGUISHING}

    left, right = subject(contract_clause), subject(requirement_clause)
    if not left or not right:
        return False
    shared = left & right
    return bool(shared) and len(shared) / len(right) >= 0.5


def check_contract(rid: str, statement: str, expected: str) -> list[str]:
    """Findings for one contract, judged against its requirement's own words."""
    problems: list[str] = []
    lowered = expected.lower()
    # Clauses: a permission or a SHOULD in one clause says nothing about a prohibition in
    # another ("a diff MAY be a view but MUST NOT mint identity" is correctly stated).
    clauses = [c.strip() for c in re.split(r";\s+|(?<=[.])\s+", expected) if c.strip()]
    requirement_clauses = [c.strip() for c in re.split(r";\s+", statement) if c.strip()]

    if expected.startswith(GENERIC_PREFIX):
        body_words = expected[len(GENERIC_PREFIX) :].strip().lower()
        for clause in requirement_clauses:
            if re.search(r"\bMAY\b", clause) and re.search(r"\b(is|are) observed to\b", body_words):
                problems.append(f"{rid}: the requirement grants a permission (MAY); the contract states it as a positive observation")
                break
            if re.search(r"\bshould\b", clause) and not re.search(r"\bshould\b", body_words):
                problems.append(f"{rid}: the requirement uses SHOULD; the contract drops or strengthens it")
                break
        return problems

    for clause in requirement_clauses:
        matched = [c for c in clauses if shares_subject(c, clause)]
        # A contract that restates the requirement clause by clause is judged against the
        # sentence carrying the same subject; a single restatement sentence (or one that
        # names no subject, e.g. "is observed to be reachable") cannot be separated, so it
        # is judged against the whole contract.
        scope = " ".join(matched).lower() if matched else lowered
        if re.search(r"\bMAY\b", clause) and not re.search(r"\bshould\b", clause):
            # "Only X MAY ..." is preserved by a conditional phrase ("only this ... may");
            # an unrestricted permission ("MAY inform ... only after ...") must keep its
            # permission ("may inform ..."). Both are negated by restating the permission
            # as a positive absolute ("is observed to be reachable", "is observed to
            # inform"), so the permission must survive somewhere in the contract.
            restricted = bool(re.match(r"^(only|only eligible)\b", clause.strip(), re.I))
            phrase = "only|permitted|allowed" if restricted else "may|might|can|only eligible"
            if not re.search(rf"\b({phrase})\b", scope):
                kind = "restricts a permission ('Only X MAY')" if restricted else "grants a permission (MAY)"
                problems.append(f"{rid}: the requirement {kind}; the contract states it as an absolute")
        if re.search(r"\bshould (?!settle now\b)[a-z]+", clause):
            if not re.search(r"\b(should|observed to respond|observed to settle)\b", scope):
                problems.append(f"{rid}: the requirement states SHOULD; the contract drops or strengthens it")
        if re.search(r"\b\w+ must not\b", clause, re.I):
            if not re.search(r"never observed to|must not|should not|is rejected|are rejected|no |refus", lowered):
                problems.append(f"{rid}: the requirement is a prohibition; the contract states none")

    # Terms a contract may add only when the requirement itself carries them. "bounded" is
    # compared on its stem: the ruler's verb "require" is not the adjective "required".
    for term in BEHAVIOUR_TERMS:
        if term in lowered and term not in statement.lower():
            problems.append(f"{rid}: adds behaviour the requirement does not name ('{term}')")
    for term in AUTHORITY_TERMS:
        if term in lowered and term not in statement.lower():
            problems.append(f"{rid}: adds an authority the requirement does not grant ('{term}')")
    for term in QUANTIFIER_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", lowered) and not re.search(rf"\b{re.escape(term)}[a-z]*\b", statement.lower()):
            problems.append(f"{rid}: adds the quantifier '{term}'")
        if re.search(rf"\b{re.escape(term)}[a-z]*\b", statement.lower()) and not re.search(rf"\b{re.escape(term)}[a-z]*\b", lowered):
            problems.append(f"{rid}: drops the requirement's '{term}'")
    return problems


def _baseline_key(finding: str) -> str:
    """Stable identity of a finding: `<ledger file name>: <symbol>: <REQ id>: <finding>`.

    The ledger path is reduced to its file name so the same finding does not become "new"
    because a ledger was regenerated into a different directory.
    """
    path, _, rest = finding.partition(": ")
    symbol, _, rest = rest.partition(": ")
    rid, _, message = rest.partition(": ")
    return f"{os.path.basename(path)}: {symbol.strip()}: {rid.strip()}: {message.strip()}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", action="append")
    parser.add_argument("--ratified", action="append", default=[])
    parser.add_argument("--fail-on-ratified", action="store_true")
    parser.add_argument(
        "--baseline",
        default=os.path.join(REPO, "scripts", "witness-claims-baseline.txt"),
        help="findings already observed in the frozen ledger (reported, not fatal); new ones fail",
    )
    args = parser.parse_args(argv)

    ledgers = args.ledger or [
        path
        for path in (os.path.join(REPO, "requirements", "ledger.yaml"), CANDIDATE_LEDGER)
        if os.path.isfile(path)
    ]
    spec = spec_requirements()
    findings: list[str] = []
    held: list[str] = []
    counts = {"checked": 0, "generic": 0, "authored": 0}
    for path in ledgers:
        ledger = yaml.safe_load(open(path, encoding="utf-8"))
        label = os.path.relpath(os.path.abspath(path), REPO)
        for contract in ledger.get("acceptance_contracts") or []:
            rid = contract["requirement"]
            statement = spec.get(rid)
            if statement is None:
                findings.append(f"{label}: top-level: {rid}: not declared in the frozen spec")
                continue
            expected = contract["expected"]
            counts["checked"] += 1
            counts["generic" if expected.startswith(GENERIC_PREFIX) else "authored"] += 1
            if "potentially-ratified" in expected.lower():
                held.append(f"{label}: {rid}")
            for problem in check_contract(rid, statement, expected):
                findings.append(f"{label}: check-contract: {problem}")

    for item in args.ratified:
        held.append(item)

    # A finding already present in the active ledger is pre-existing debt (DEBT D-020); it is
    # reported but does not fail, so a *new* finding cannot hide behind old ones.
    baseline = set()
    if args.baseline and os.path.isfile(args.baseline):
        baseline = {
            line.strip()
            for line in open(args.baseline, encoding="utf-8")
            if line.strip() and not line.startswith("#")
        }
    new_findings = [f for f in findings if _baseline_key(f) not in baseline]
    known_findings = [f for f in findings if _baseline_key(f) in baseline]

    if known_findings:
        print(f"check-witness-claims: {len(known_findings)} known pre-existing finding(s) (DEBT D-020), not fatal:")
        for finding in known_findings:
            print(f"  ~ {finding}")
    if new_findings:
        print(f"check-witness-claims: FAILED ({len(new_findings)} new finding(s) over {counts['checked']} contracts)")
        for finding in new_findings:
            print(f"- {finding}")
        return 1
    print(
        f"check-witness-claims: OK ({counts['checked']} contracts: {counts['generic']} generic, "
        f"{counts['authored']} authored; no new policy)"
    )
    if held:
        print(f"check-witness-claims: HELD, not ratified ({len(held)}):")
        for item in held:
            print(f"- {item}")
        print("  A hold is a proposal. It becomes normative only in a new frozen spec version;")
        print("  no freeze may treat it as a clause, and this script never promotes it.")
        if args.fail_on_ratified:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
