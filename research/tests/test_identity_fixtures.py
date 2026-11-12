"""The independent half of the Stage 0A-2 record fixtures.

`identity_records.py` is a second implementation of `contracts/identity/v1/records.json`, written
from the rule text without reading the TypeScript validator. It lives here because
`research/tests` is this repository's Python test root (`bun run test` runs it), not because the
research subsystem owns identity: the module is a test helper and is not part of the
`horizon_research` package.

The TypeScript test (`test/identity-records.test.ts`) checks the two things Python cannot do
without a YAML dependency: that each case's `catalog` facts match the live operation manifest, and
that each catalog-fixed action is the one the parameter schema fixes. Everything else is checked
twice, in two languages, over the same bytes.
"""

from __future__ import annotations

import inspect
import json

import pytest

from identity_records import (
    FIXTURES_PATH,
    RECORDS_PATH,
    check_constraints,
    effective_child_grant,
    load_contract,
    load_fixtures,
    validate,
)

CONTRACT = load_contract()
FIXTURES = load_fixtures()
CASES = FIXTURES["cases"]


def test_the_fixtures_belong_to_this_contract() -> None:
    assert FIXTURES["contract_id"] == CONTRACT["contract_id"]
    assert FIXTURES["contract_version"] == CONTRACT["contract_version"]


def test_every_case_names_a_declared_record() -> None:
    declared = set(CONTRACT["records"])
    assert {case["kind"] for case in CASES} == declared


def test_case_ids_are_unique() -> None:
    ids = [case["id"] for case in CASES]
    assert len(ids) == len(set(ids))


def test_every_case_states_its_expectation_consistently() -> None:
    for case in CASES:
        assert case["expect"] in ("valid", "invalid")
        assert (case["expect"] == "valid") == (case["violations"] == [])


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_the_python_checker_agrees_with_the_fixture(case: dict) -> None:
    got = validate(CONTRACT, case["kind"], case["record"], case.get("catalog"), case.get("context"))
    assert got == sorted(set(case["violations"])), case["id"]


def test_every_declared_constraint_is_implemented_here() -> None:
    source = inspect.getsource(check_constraints)
    for rule_id in CONTRACT["constraints"]:
        assert f'fail("{rule_id}")' in source, rule_id


def test_every_declared_constraint_is_exercised_by_a_case() -> None:
    exercised = {
        violation.split(":", 1)[1]
        for case in CASES
        for violation in case["violations"]
        if violation.startswith("constraint:")
    }
    assert exercised == set(CONTRACT["constraints"])


def test_no_case_names_an_undefined_constraint() -> None:
    for case in CASES:
        for violation in case["violations"]:
            prefix, _, name = violation.partition(":")
            if prefix == "constraint":
                assert name in CONTRACT["constraints"], case["id"]


def test_each_proof_has_a_positive_and_a_negative_case() -> None:
    for proof in ("no_fabricated_grant", "caller_not_substitutable", "no_classification_downgrade"):
        assert FIXTURES["proofs"][proof].strip()
        tagged = [case for case in CASES if case.get("proof") == proof]
        assert any(case["expect"] == "valid" for case in tagged), proof
        assert any(case["expect"] == "invalid" for case in tagged), proof


def _catalog(case_id: str) -> dict:
    """The catalog facts the fixture carries for one case.

    The fixture carries the parameter schema beside the record, so this implementation checks the
    same bytes the TypeScript one does. A hand-built catalog block would carry no schema at all,
    and the parameter rule would then refuse every record for the wrong reason.
    """
    case = next(case for case in CASES if case["id"] == case_id)
    assert case.get("catalog") is not None, case_id
    return json.loads(json.dumps(case["catalog"]))


def _descriptor(**over: object) -> dict:
    """A well-formed human-session descriptor, with named fields overridden."""
    base = next(case for case in CASES if case["id"] == "OD-HUMAN-OK")
    record = json.loads(json.dumps(base["record"]))
    record.update(over)
    return record


def test_a_human_session_is_never_handed_a_grant() -> None:
    catalog = _catalog("OD-HUMAN-OK")
    clean = _descriptor()
    assert validate(CONTRACT, "OperationDescriptor", clean, catalog) == []
    # The same request, now carrying a grant to satisfy a shared schema.
    borrowed = _descriptor(delegation_ref="grant-0001")
    assert validate(CONTRACT, "OperationDescriptor", borrowed, catalog) == ["constraint:human_has_no_grant"]
    # Or a grant hidden inside the parameters, which is refused rather than ignored. The parameter
    # schema refuses it too: a grant is not one of the fields the effect has.
    smuggled = _descriptor(parameters={"body": "hi", "grant_ref": "grant-0001"})
    assert validate(CONTRACT, "OperationDescriptor", smuggled, catalog) == [
        "constraint:human_has_no_grant",
        "constraint:parameters_match_schema",
    ]
    # Or a credential, which a human never has.
    with_credential = _descriptor(execution_ref="exec-0001")
    assert validate(CONTRACT, "OperationDescriptor", with_credential, catalog) == [
        "constraint:human_has_no_credential"
    ]


def test_the_caller_kind_cannot_be_substituted() -> None:
    catalog = _catalog("OD-AGENT-GOVERNED-OK")
    body = {
        "operation_id": "workspace.label",
        "params_schema_ref": "params.workspace_label",
        "parameters": {
            "session": "sess-0001",
            "event": "evt-0001",
            "record_seq": "2",
            "verdict": "urgent",
            "first_failure": "none",
        },
    }
    agent = _descriptor(caller_kind="agent_execution", caller_ref="agent:researcher", execution_ref="exec-0001", **body)
    assert validate(CONTRACT, "OperationDescriptor", agent, catalog) == ["constraint:governed_agent_needs_delegation"]
    assert validate(CONTRACT, "OperationDescriptor", {**agent, "delegation_ref": "grant-0001"}, catalog) == []
    console = _descriptor(caller_kind="local_console", caller_ref="console:local", execution_ref="exec-0001", **body)
    assert validate(CONTRACT, "OperationDescriptor", console) == ["constraint:console_has_no_execution"]


def test_an_operation_class_cannot_be_lowered_by_parameters() -> None:
    governed = _catalog("OD-AGENT-GOVERNED-OK")
    weak = _descriptor(
        operation_id="workspace.label",
        params_schema_ref="params.local_write",
        parameters={
            "session": "sess-0001",
            "event": "evt-0001",
            "record_seq": "2",
            "verdict": "urgent",
            "first_failure": "none",
        },
    )
    assert validate(CONTRACT, "OperationDescriptor", weak, governed) == ["constraint:params_schema_mismatch"]
    dispatching = {
        "operation_id": "capability.invoke",
        "class": "PX",
        "params_schema": "params.capability_invoke",
        "listed_targets": ["horizon.note.save"],
    }
    hidden = _descriptor(
        operation_id="capability.invoke",
        params_schema_ref="params.capability_invoke",
        parameters={
            "target_operation": "agent.surface.publish.hidden",
            "parameters": {},
            "resource_refs": ["note:desk"],
            "amount": None,
            "idempotency_key": "idem-0001",
        },
    )
    # The dispatcher refuses the target it cannot list, and the parameters refuse the shape the
    # schema does not declare.
    assert validate(CONTRACT, "OperationDescriptor", hidden, dispatching) == [
        "constraint:dispatcher_target_listed",
        "constraint:parameters_match_schema",
    ]


def test_numbers_are_never_accepted_where_a_decimal_string_belongs() -> None:
    credential = next(case for case in CASES if case["kind"] == "Credential" and case["expect"] == "valid")
    assert validate(CONTRACT, "Credential", {**credential["record"], "exp": 1762692900}) == ["type:exp:uint64"]
    assert validate(CONTRACT, "Credential", {**credential["record"], "exp": "01762692900"}) == ["type:exp:uint64"]
    assert validate(CONTRACT, "Credential", {**credential["record"], "exp": "18446744073709551616"}) == [
        "type:exp:uint64"
    ]
    assert validate(CONTRACT, "Credential", {**credential["record"], "exp": "18446744073709551615"}) == []

    grant = next(case for case in CASES if case["id"] == "GRANT-ROOT-OK")
    assert validate(
        CONTRACT,
        "HorizonDelegationGrant",
        {**grant["record"], "budget": {"amount": 1000, "unit": "tokens"}},
    ) == ["type:budget:money"]
    assert validate(
        CONTRACT,
        "HorizonDelegationGrant",
        {**grant["record"], "budget": {"amount": "1000"}},
    ) == ["type:budget:money"]


def test_a_private_key_is_never_a_holder_key() -> None:
    credential = next(case for case in CASES if case["kind"] == "Credential" and case["expect"] == "valid")
    for member in ("d", "p", "q", "dp", "dq", "qi", "oth"):
        record = {
            **credential["record"],
            "holder_jwk": {"kty": "EC", "crv": "P-256", "x": "eA", "y": "eQ", member: "c2VjcmV0"},
        }
        assert validate(CONTRACT, "Credential", record) == ["type:holder_jwk:jwk"], member


def test_an_unknown_record_or_rule_fails_closed() -> None:
    assert validate(CONTRACT, "NotARecord", {}) == ["unknown_record:NotARecord"]
    assert validate(CONTRACT, "Credential", []) == ["type:record:Credential"]
    tripping = next(case for case in CASES if any(v.startswith("constraint:") for v in case["violations"]))
    with pytest.raises(ValueError):
        validate({**CONTRACT, "constraints": {}}, tripping["kind"], tripping["record"], tripping.get("catalog"), tripping.get("context"))


def test_an_absent_child_grant_field_grants_nothing() -> None:
    effective = effective_child_grant(
        CONTRACT,
        {"grant_ref": "grant-0002", "parent_ref": "grant-0001", "agent_ref": "agent:helper"},
    )
    assert effective["operations"] == []
    assert effective["resource_selectors"] == []
    assert effective["data_labels"] == []
    assert effective["budget"] == {"amount": "0", "unit": "currency", "remaining": "0"}
    assert effective["depth_remaining"] == "0"
    assert effective["redelegate"] is False
    assert effective["offline"] is False
    assert effective["expires_at"] is None


def test_the_two_implementations_read_the_same_files() -> None:
    # The descriptor is JSON, not YAML, precisely so this test needs no dependency to read it.
    assert json.loads(RECORDS_PATH.read_text(encoding="utf-8"))["contract_id"] == "horizon.identity.records"
    assert json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))["fixtures_version"] == (
        "horizon.identity.record-fixtures/1"
    )
