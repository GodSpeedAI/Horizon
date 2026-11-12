"""An independent implementation of the Stage 0A-2 record contract.

This module exists to disagree. It shares no code with the TypeScript validator: it reads the
same `records.json` descriptor and the same fixture file, and it implements each cross-field rule
from the rule text in the descriptor. Both implementations must produce the exact violation set a
case names, so a divergence in either one fails a test rather than passing quietly.

Stdlib only, on purpose: `research/pyproject.toml` declares no dependencies, so a schema checker
that needed PyYAML would be a new dependency for a contract that does not require one.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RECORDS_PATH = ROOT / "contracts" / "identity" / "v1" / "records.json"
FIXTURES_PATH = ROOT / "contracts" / "identity" / "v1" / "fixtures" / "record-cases.json"
EXTERNAL_INTERFACES_PATH = ROOT / "contracts" / "identity" / "v1" / "external-interfaces.json"
ENTITLEMENT_INTERFACE_ID = "sea_forge.human_entitlement"

UINT64_MAX = "18446744073709551615"
UINT64 = re.compile(r"^(0|[1-9][0-9]*)$")
DECIMAL = re.compile(r"^(0|[1-9][0-9]*)(\.[0-9]+)?$")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$")
BASE64URL = re.compile(r"^[A-Za-z0-9_-]{16,}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
PRIVATE_JWK = ("d", "p", "q", "dp", "dq", "qi", "oth")
PUBLIC_KTY = ("EC", "RSA", "OKP")


def load_contract() -> dict[str, Any]:
    contract = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
    if contract["contract_id"] != "horizon.identity.records":
        raise ValueError(f"unexpected contract id {contract['contract_id']}")
    return contract


def load_fixtures() -> dict[str, Any]:
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


def load_external_interfaces() -> dict[str, Any]:
    """The interfaces other projects own and mint. Horizon consumes them; it never authors them."""
    contract = json.loads(EXTERNAL_INTERFACES_PATH.read_text(encoding="utf-8"))
    if contract["contract_id"] != "horizon.identity.external_interfaces":
        raise ValueError(f"unexpected contract id {contract['contract_id']}")
    return contract


def entitlement_interface() -> dict[str, Any] | None:
    """The entitlement interface, or None when the interface contract cannot be read. A contract
    that cannot be read is a refusal, never a pass."""
    try:
        contract = load_external_interfaces()
    except (OSError, ValueError, KeyError):
        return None
    for entry in contract.get("interfaces", []):
        if entry.get("interface_id") == ENTITLEMENT_INTERFACE_ID:
            return entry
    return None


def timestamp_millis(value: object) -> float | None:
    """A canonical UTC timestamp in milliseconds, or None when the value is not one. Two timestamps
    are compared as instants, not as text, so a fractional second cannot reorder them."""
    if not isinstance(value, str) or not TIMESTAMP.match(value):
        return None
    whole, _, fraction = value[:-1].partition(".")
    try:
        base = datetime.strptime(whole, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    millis = base.timestamp() * 1000
    if fraction:
        millis += float(f"0.{fraction}") * 1000
    return millis


def is_object(value: object) -> bool:
    return isinstance(value, dict)


def canonical_uint64(value: object) -> bool:
    if not isinstance(value, str) or not UINT64.match(value):
        return False
    if len(value) != len(UINT64_MAX):
        return len(value) < len(UINT64_MAX)
    return value <= UINT64_MAX


def canonical_decimal(value: object) -> bool:
    return isinstance(value, str) and bool(DECIMAL.match(value))


def compare_decimal(left: str, right: str) -> int:
    """Compare two canonical decimals without floating point."""
    left_whole, _, left_fraction = left.partition(".")
    right_whole, _, right_fraction = right.partition(".")
    width = max(len(left_fraction), len(right_fraction))
    scaled_left = (left_whole + left_fraction.ljust(width, "0")).lstrip("0") or "0"
    scaled_right = (right_whole + right_fraction.ljust(width, "0")).lstrip("0") or "0"
    if len(scaled_left) != len(scaled_right):
        return -1 if len(scaled_left) < len(scaled_right) else 1
    if scaled_left == scaled_right:
        return 0
    return -1 if scaled_left < scaled_right else 1


def type_violation(kind: str, value: object) -> bool:
    if kind == "string":
        return not isinstance(value, str)
    if kind == "uint64":
        return not canonical_uint64(value)
    if kind == "decimal":
        return not canonical_decimal(value)
    if kind == "timestamp":
        return not isinstance(value, str) or not TIMESTAMP.match(value)
    if kind == "boolean":
        return not isinstance(value, bool)
    if kind == "base64url":
        return not isinstance(value, str) or not BASE64URL.match(value)
    if kind == "digest":
        return not isinstance(value, str) or not DIGEST.match(value)
    if kind == "string_array":
        return not isinstance(value, list) or any(not isinstance(entry, str) for entry in value)
    if kind == "object":
        return not is_object(value)
    if kind == "jwk":
        if not is_object(value):
            return True
        if not isinstance(value.get("kty"), str) or value["kty"] not in PUBLIC_KTY:
            return True
        return any(member in value for member in PRIVATE_JWK)
    if kind == "money":
        if not is_object(value):
            return True
        if not canonical_decimal(value.get("amount")):
            return True
        unit = value.get("unit")
        if not isinstance(unit, str) or unit == "":
            return True
        if "remaining" in value and not canonical_decimal(value["remaining"]):
            return True
        return False
    raise ValueError(f"unknown field type {kind}")


def check_fields(contract: dict[str, Any], kind: str, value: object) -> list[str]:
    spec = contract["records"].get(kind)
    if spec is None:
        return [f"unknown_record:{kind}"]
    if not is_object(value):
        return [f"type:record:{kind}"]
    violations: list[str] = []
    declared: dict[str, dict[str, Any]] = {}
    for field in [*contract["envelope"], *spec["fields"]]:
        declared[field["name"]] = field
    for name, field in declared.items():
        if name not in value:
            violations.append(f"missing:{name}")
            continue
        present = value[name]
        if present is None:
            if field.get("nullable") is not True:
                violations.append(f"null:{name}")
            continue
        if type_violation(field["type"], present):
            violations.append(f"type:{name}:{field['type']}")
        choices = field.get("enum")
        if choices is not None and isinstance(present, str) and present not in choices:
            violations.append(f"enum:{name}")
    for key in value:
        if key not in declared:
            violations.append(f"unknown:{key}")
    return violations


def _string_of(record: dict[str, Any], field: str) -> str | None:
    value = record.get(field)
    return value if isinstance(value, str) else None


def _is_null(record: dict[str, Any], field: str) -> bool:
    return record.get(field) is None


def _wire_name(field: dict[str, Any]) -> str:
    wire = field.get("wire")
    return wire if isinstance(wire, str) else str(field.get("name"))


def _parameter_type_holds(kind: str, value: object) -> bool:
    """The parameter types, checked the way the TypeScript validator checks them."""
    if kind == "array":
        return isinstance(value, list)
    if kind == "object_array":
        return isinstance(value, list) and all(is_object(entry) for entry in value)
    if kind == "string":
        return isinstance(value, str)
    if kind in ("uint64", "decimal"):
        return isinstance(value, str) and bool(DECIMAL.match(value))
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool) and abs(value) <= 2**53 - 1
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "timestamp":
        return isinstance(value, str) and bool(TIMESTAMP.match(value))
    if kind == "json":
        return value is not None
    if kind == "jwk":
        return is_object(value) and isinstance(value.get("kty"), str)
    if kind == "string_array":
        return isinstance(value, list) and all(isinstance(entry, str) for entry in value)
    if kind == "object":
        return is_object(value)
    if kind == "object_array":
        return isinstance(value, list) and all(is_object(entry) for entry in value)
    if kind == "string_or_string_array":
        return isinstance(value, str) or (isinstance(value, list) and all(isinstance(entry, str) for entry in value))
    return False


def _check_field(field: dict[str, Any], value: object, path: str, out: list[str]) -> None:
    """Check one value against one field's declaration, recursively.

    A nested object's members are checked against their own declarations, so a nested field's
    optionality and nullability are facts rather than assumptions, and an array's elements are
    checked against the element declaration. The path names where the violation is.
    """
    if value is None:
        if field.get("nullable") is not True:
            out.append(f"params:null:{path}")
        return
    if not _parameter_type_holds(str(field.get("type")), value):
        out.append(f"params:type:{path}:{field.get('type')}")
        return
    choices = field.get("enum")
    if choices is not None and not any(choice == value and type(choice) is type(value) for choice in choices):
        out.append(f"params:enum:{path}")
    nested_fields = field.get("object_fields")
    if isinstance(nested_fields, list) and is_object(value):
        for nested in nested_fields:
            key = _wire_name(nested)
            nested_path = f"{path}.{key}"
            if key not in value:
                if nested.get("optional") is not True:
                    out.append(f"params:missing:{nested_path}")
                continue
            _check_field(nested, value[key], nested_path, out)
    items = field.get("items")
    if isinstance(items, dict) and isinstance(value, list):
        for index, entry in enumerate(value):
            _check_item(items, entry, f"{path}[{index}]", out)


def _check_item(item: dict[str, Any], value: object, path: str, out: list[str]) -> None:
    """Check one array element against the element declaration."""
    if value is None:
        if item.get("nullable") is not True:
            out.append(f"params:null:{path}")
        return
    if not _parameter_type_holds(str(item.get("type")), value):
        out.append(f"params:type:{path}:{item.get('type')}")
        return
    choices = item.get("enum")
    if choices is not None and not any(choice == value and type(choice) is type(value) for choice in choices):
        out.append(f"params:enum:{path}")
    nested_fields = item.get("object_fields")
    if isinstance(nested_fields, list) and is_object(value):
        for nested in nested_fields:
            key = _wire_name(nested)
            nested_path = f"{path}.{key}"
            if key not in value:
                if nested.get("optional") is not True:
                    out.append(f"params:missing:{nested_path}")
                continue
            _check_field(nested, value[key], nested_path, out)
    items = item.get("items")
    if isinstance(items, dict) and isinstance(value, list):
        for index, entry in enumerate(value):
            _check_item(items, entry, f"{path}[{index}]", out)


def _field_violations(fields: list[dict[str, Any]], parameters: dict[str, Any]) -> list[str]:
    out: list[str] = []
    declared = {_wire_name(field): field for field in fields}
    for field in fields:
        name = _wire_name(field)
        if name not in parameters:
            if field.get("optional") is not True:
                out.append(f"params:missing:{name}")
            continue
        _check_field(field, parameters[name], name, out)
    for name in parameters:
        if name not in declared:
            out.append(f"params:unknown:{name}")
    return out


def _variant_fields(spec: dict[str, Any], record: dict[str, Any]) -> tuple[list[dict[str, Any]] | None, bool, str | None]:
    """The fields of the chosen variant, whether the choice was resolved, and the unknown kind.

    A schema with no variants has its own fields. A schema with variants is chosen by the
    record's own discriminator when it has one; a record that names no variant must describe
    one of them.

    A discriminator the record carries but the schema does not know is refused by name, not
    fitted to the closest variant: a caller kind the schema never declared must not inherit
    another caller's wire contract.
    """
    variants = spec.get("variants")
    if not is_object(variants):
        return (spec.get("fields") if isinstance(spec.get("fields"), list) else []), True, None
    key = spec.get("discriminator") or spec.get("discriminated_by")
    if isinstance(key, str):
        chosen = record.get(key)
        if isinstance(chosen, str) and is_object(variants.get(chosen)):
            fields = variants[chosen].get("fields")
            return (fields if isinstance(fields, list) else []), True, None
        # The record names a discriminator the schema has no variant for. A caller-kind
        # discriminator is refused; an external code operation may simply be absent, so the
        # best-fit rule still applies there.
        if isinstance(spec.get("discriminator"), str) and isinstance(chosen, str):
            return None, False, chosen
    return None, False, None


def parameter_violations(spec: dict[str, Any], parameters: dict[str, Any], record: dict[str, Any]) -> list[str]:
    """The violations one parameter object finds in one schema."""
    chosen, resolved, unknown = _variant_fields(spec, record)
    if resolved:
        return _field_violations(chosen or [], parameters)
    if unknown is not None:
        return [f"params:unknown_variant:{spec.get('discriminator')}:{unknown}"]
    variants = spec.get("variants")
    if is_object(variants):
        # No discriminator: the parameters must describe one of the variants. The report is the
        # variant with the fewest violations.
        best: list[str] | None = None
        for key in sorted(variants):
            fields = variants[key].get("fields")
            found = _field_violations(fields if isinstance(fields, list) else [], parameters)
            if best is None or len(found) < len(best):
                best = found
        return best or []
    fields = spec.get("fields")
    return _field_violations(fields if isinstance(fields, list) else [], parameters)


def entitlement_binds(record: dict[str, Any], kind: str, view: dict[str, Any], spec: dict[str, Any]) -> bool:
    """Does the external entitlement cover the record it authorizes?

    The record's own facts and the owner's facts have to agree. A wider entitlement is fine — the
    owner may grant more than this operation needs — but a narrower scope, a smaller ceiling, a
    different subject, a different operation, a different epoch, an expiry before the record's, or
    a revoked entitlement are all refusals.

    The fact names come from the external interface contract, so the contract decides what the
    owner's artifact must carry; this function decides what "the same" means.
    """
    for fact in spec.get("required_facts", []):
        name = fact.get("fact")
        if not isinstance(name, str) or name not in view:
            return False
        owned = view[name]
        # The issuer's key identifier and the owner's signature are not optional text: an artifact
        # that names no key or carries no signature is not authority, whatever else it says.
        if name in ("issuer_key_id", "signature"):
            if not isinstance(owned, str) or owned == "":
                return False
        binds = fact.get("binds")
        if binds is None:
            continue
        if binds == "interface_id":
            if owned != spec.get("interface_id"):
                return False
        elif binds == "interface_version":
            if owned != spec.get("interface_version"):
                return False
        elif binds == "entitlement_ref":
            if owned != record.get("entitlement_ref"):
                return False
        elif binds == "record_subject":
            # The subject a fact binds to is named per record kind by the interface's own subject
            # binding map. A kind the map does not name is a contract defect, not a pass.
            bindings = spec.get("subject_binding")
            field = bindings.get(kind) if isinstance(bindings, dict) else None
            if not isinstance(field, str):
                return False
            subject = record.get(field)
            if not isinstance(subject, str) or owned != subject:
                return False
        elif binds == "operation_digest":
            if owned != record.get("operation_digest"):
                return False
        elif binds == "resource_scope":
            covered = owned if isinstance(owned, list) else None
            named = record.get("resource_refs")
            named = named if isinstance(named, list) else []
            if covered is None:
                return False
            if any(resource not in covered for resource in named):
                return False
        elif binds == "amount":
            # The entitlement is bounded: a ceiling is required, and it covers the record's amount
            # in the same unit. An unbounded entitlement is not a bounded one.
            if not is_object(owned) or not isinstance(owned.get("amount"), str) or not isinstance(owned.get("unit"), str):
                return False
            if not canonical_decimal(owned.get("amount")):
                return False
            own = record.get("amount")
            if own is None:
                continue
            if not is_object(own) or not isinstance(own.get("amount"), str) or not isinstance(own.get("unit"), str):
                return False
            if not canonical_decimal(own.get("amount")):
                return False
            if own.get("unit") != owned.get("unit"):
                return False
            if compare_decimal(owned["amount"], own["amount"]) < 0:
                return False
        elif binds == "authority_epoch":
            if owned != record.get("authority_epoch"):
                return False
        elif binds == "expiry":
            own_millis = timestamp_millis(record.get("expires_at"))
            owned_millis = timestamp_millis(owned)
            if own_millis is None or owned_millis is None:
                return False
            if owned_millis < own_millis:
                return False
        elif binds == "revocation_state":
            if owned != "active":
                return False
        else:
            # An unknown binding is a contract defect, not a pass.
            return False
    return True


def _delegation_reference_meaning(entry: dict[str, Any] | None, caller_kind: str) -> str:
    """What a delegation-reference parameter means to one caller kind.

    `authority` — the delegation the caller acts under, so the record's own `delegation_ref` must
    be that same reference. `target` — the delegation the operation acts on; naming it claims
    nothing. `forbidden` — the caller may not name it at all. A caller kind the register does not
    list is `forbidden`: a parameter whose meaning is not stated is a parameter whose authority is
    not stated. A (schema, field) pair the register does not list at all is `forbidden` too, so
    an unstated parameter cannot become an unstated permission.
    """
    if not isinstance(entry, dict):
        return "forbidden"
    kinds = entry.get("per_caller_kind")
    meaning = kinds.get(caller_kind) if isinstance(kinds, dict) else None
    if meaning in ("authority", "target", "forbidden"):
        return str(meaning)
    return "forbidden"


def _every_field(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Every field of a schema, its variants' fields included, and each field's nested members."""
    found: list[dict[str, Any]] = []

    def walk(fields: object) -> None:
        if not isinstance(fields, list):
            return
        for field in fields:
            if not isinstance(field, dict):
                continue
            found.append(field)
            walk(field.get("object_fields"))
            item = field.get("items")
            if isinstance(item, dict):
                walk(item.get("object_fields"))

    walk(spec.get("fields"))
    variants = spec.get("variants")
    if isinstance(variants, dict):
        for variant in variants.values():
            if isinstance(variant, dict):
                walk(variant.get("fields"))
    return found


def _delegation_reference_wire_names(
    schema_ref: str,
    vocabulary: list[str],
    spec: object,
) -> list[str]:
    """The parameter names of one schema that name a delegation, on the wire.

    A parameter is a delegation reference when its name is in the register's vocabulary, or when
    the schema declares a field whose own name is in the vocabulary — the second case catches a
    schema that renames a delegation reference on the wire to smuggle it past the rule. The
    vocabulary itself is always included, so a request that carries a delegation reference under a
    schema that does not declare it is still seen.
    """
    names = set(vocabulary)
    if isinstance(spec, dict):
        for field in _every_field(spec):
            name = field.get("name")
            wire = _wire_name(field)
            if (isinstance(name, str) and name in vocabulary) or (isinstance(wire, str) and wire in vocabulary):
                names.add(wire)
    return sorted(names)


def check_constraints(
    contract: dict[str, Any],
    kind: str,
    value: object,
    catalog: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> list[str]:
    spec = contract["records"].get(kind)
    if spec is None or not is_object(value):
        return []
    record: dict[str, Any] = value
    out: list[str] = []

    def fail(rule_id: str) -> None:
        if rule_id not in contract["constraints"]:
            raise ValueError(f"fixture names unknown constraint {rule_id}")
        out.append(f"constraint:{rule_id}")

    parameters = record.get("parameters") if is_object(record.get("parameters")) else None
    caller_kind = _string_of(record, "caller_kind")

    if kind == "EffectFence":
        caller = _string_of(record, "caller_ref")
        execution = _string_of(record, "execution_ref")
        if caller is not None and execution is not None and caller == execution:
            fail("caller_is_not_target")

    if kind in ("OperationDescriptor", "PendingOperation"):
        if caller_kind == "human_session":
            if not _is_null(record, "delegation_ref"):
                fail("human_has_no_grant")
            if not _is_null(record, "execution_ref"):
                fail("human_has_no_credential")
        # The delegation-reference register. A parameter that names a delegation is the caller's
        # authority, the operation's target, or forbidden to that caller, and the register says
        # which. The vocabulary decides which parameters are delegation references at all, so a
        # request cannot smuggle one under a schema that forgot to register it: an unlisted
        # (schema, field) pair is forbidden to every caller kind.
        if parameters is not None and caller_kind is not None:
            schema_ref = _string_of(record, "params_schema_ref")
            if schema_ref is not None:
                register = contract.get("delegation_reference_parameters")
                register = register if isinstance(register, dict) else {}
                entries = register.get("entries")
                entries = [entry for entry in entries if isinstance(entry, dict)] if isinstance(entries, list) else []
                vocabulary = register.get("delegation_reference_fields")
                vocabulary = [name for name in vocabulary if isinstance(name, str)] if isinstance(vocabulary, list) else []
                names = _delegation_reference_wire_names(
                    schema_ref, vocabulary, (catalog or {}).get("params_schema_spec")
                )
                for name in names:
                    if name not in parameters:
                        continue
                    named = parameters[name]
                    if named is None:
                        continue
                    entry = next(
                        (
                            candidate
                            for candidate in entries
                            if candidate.get("schema") == schema_ref and candidate.get("field") == name
                        ),
                        None,
                    )
                    meaning = _delegation_reference_meaning(entry, caller_kind)
                    if meaning == "target":
                        continue
                    if caller_kind == "human_session":
                        fail("human_has_no_grant")
                        continue
                    if meaning == "authority":
                        # The caller acts under the delegation it names, so the record must hold
                        # that same one. A console caller holds no delegation at all and can never
                        # be the authority.
                        if caller_kind == "local_console" or _string_of(record, "delegation_ref") != named:
                            fail("delegation_reference_kind")
                        continue
                    fail("delegation_reference_kind")
        if caller_kind == "agent_execution" and _is_null(record, "execution_ref"):
            fail("agent_needs_execution")
        if caller_kind == "local_console" and (not _is_null(record, "execution_ref") or not _is_null(record, "delegation_ref")):
            fail("console_has_no_execution")
        # A device credential and a code holder hold none of the three caller channels. A record
        # that gives one of them a session, an execution or a delegation head is refused.
        if caller_kind in ("device_credential", "code_holder") and (
            not _is_null(record, "session_ref")
            or not _is_null(record, "execution_ref")
            or not _is_null(record, "delegation_ref")
        ):
            fail("non_principal_caller_has_no_credential")
        # The registered key proves the agent principal and not a logical execution, so the record
        # names no session and no execution. It holds no delegation head of its own either: the
        # agent door has no grant to spend until the issuer exists.
        if caller_kind == "registered_agent" and (
            not _is_null(record, "session_ref")
            or not _is_null(record, "execution_ref")
            or not _is_null(record, "delegation_ref")
        ):
            fail("caller_channel_exclusive")
        if catalog is not None:
            # The operation's own permitted caller kinds. The record's kind must be one of them,
            # so a device's record cannot claim a human session and a human's record cannot claim
            # a device. The fact is the catalog's, not the validator's.
            permitted = catalog.get("permitted_caller_kinds")
            if isinstance(permitted, list) and caller_kind not in permitted:
                fail("caller_kind_permitted")
            governed = catalog.get("class") in ("P2", "P3")
            if governed and caller_kind == "agent_execution" and _is_null(record, "delegation_ref"):
                fail("governed_agent_needs_delegation")
            expected = catalog.get("params_schema")
            if expected is not None and _string_of(record, "params_schema_ref") != expected:
                fail("params_schema_mismatch")
            fixed = catalog.get("alias_fixed")
            if fixed is not None:
                supplied = None if parameters is None else parameters.get(fixed["field"])
                if supplied != fixed["value"]:
                    fail("alias_fixes_action")
            listed = catalog.get("listed_targets")
            if listed is not None and parameters is not None:
                single = parameters.get("target_operation")
                planned = parameters.get("resolved_operations")
                planned = planned if isinstance(planned, list) else None
                if isinstance(single, str):
                    targets = [single]
                elif planned is not None:
                    targets = [entry for entry in planned if isinstance(entry, str)]
                else:
                    targets = []
                names_one = isinstance(single, str) or (planned is not None and len(planned) > 0)
                if not names_one:
                    fail("dispatcher_target_listed")
                elif not targets or any(target not in listed for target in targets):
                    fail("dispatcher_target_listed")
            if governed and expected in ("params.read", "params.local_write"):
                fail("params_schema_mismatch")
            # The parameters themselves are checked against the schema the record names. The name
            # alone proves nothing: a record that names the right schema and carries the wrong
            # fields is the defect this rule exists for.
            if parameters is not None and expected is not None:
                spec = catalog.get("params_schema_spec")
                if not is_object(spec):
                    fail("parameters_match_schema")
                elif parameter_violations(spec, parameters, record):
                    fail("parameters_match_schema")

    if kind == "PendingOperation":
        # The descriptor is immutable and carries no confirmation: the confirmation is a
        # PendingTransition from pending to confirmed.
        confirmer = _string_of(record, "confirmer_ref")
        presence = record.get("presence_evidence")
        receipt = record.get("local_receipt")
        has_presence = presence is not None
        has_receipt = receipt is not None
        if confirmer is not None or has_presence or has_receipt:
            fail("pending_confirmation_not_caller_supplied")
        # The caller channel. A pending record names exactly one, and it is the one its caller
        # kind implies.
        session = _string_of(record, "session_ref")
        execution = _string_of(record, "execution_ref")
        delegation = _string_of(record, "delegation_ref")
        if caller_kind == "human_session":
            if session is None or execution is not None or delegation is not None:
                fail("caller_channel_exclusive")
        elif caller_kind == "agent_execution":
            if execution is None or session is not None:
                fail("caller_channel_exclusive")
            if catalog is not None:
                # An agent execution holds a delegation exactly when the operation is governed: a
                # local P0/P1 run has no delegation head to spend.
                governed = catalog.get("class") in ("P2", "P3")
                if governed != (delegation is not None):
                    fail("caller_channel_exclusive")
        elif caller_kind == "local_console":
            if session is not None or execution is not None or delegation is not None:
                fail("caller_channel_exclusive")
        # A replacement record inherits the authority of the record it replaces.
        superseded = (context or {}).get("superseded_pending")
        if is_object(superseded):
            if _string_of(record, "case_authority") != _string_of(superseded, "case_authority"):
                fail("pending_case_authority_immutable")
            if _string_of(record, "operation_id") != _string_of(superseded, "operation_id"):
                fail("pending_case_authority_immutable")
        if catalog is not None:
            writer = catalog.get("authority_writer")
            outside = writer in ("sea_forge", "issuer_root")
            if (outside or catalog.get("class") == "P3") and _string_of(record, "case_authority") != "governed":
                fail("pending_governed_needs_governed_authority")
            case_authority = (context or {}).get("case_authority")
            if writer == "case_record.authority" and case_authority is not None:
                if _string_of(record, "case_authority") != case_authority:
                    fail("pending_case_authority_matches_case")
    if kind == "PendingTransition":
        # The complete transition table: the only state pairs that exist, the reason each pair
        # carries, and the chain the transition must continue.
        from_state = _string_of(record, "from_state")
        to_state = _string_of(record, "to_state")
        reason = _string_of(record, "reason")
        allowed: dict[str, list[tuple[str, list[str]]]] = {
            "pending": [("confirmed", ["human_confirmation"]),
                        ("expired", ["window_closed", "launch_ended"])],
            "confirmed": [("dispatching", ["redemption_claim"]),
                          ("expired", ["launch_ended"])],
            "dispatching": [("applied", ["effect_applied"]),
                            ("uncertain", ["effect_uncertain", "launch_ended"])],
        }
        if from_state is not None and to_state is not None and reason is not None:
            successors = allowed.get(from_state, [])
            match = next((entry for entry in successors if entry[0] == to_state), None)
            if match is None:
                fail("pending_transition_chain")
            elif reason not in match[1]:
                fail("pending_transition_chain")
            prior = (context or {}).get("pending_transitions") or []
            previous = "pending"
            if prior:
                previous = _string_of(prior[-1], "to_state")
            if previous != from_state:
                fail("pending_transition_chain")
        # The confirmation lives in the transition that makes it, and nowhere else.
        confirmer = _string_of(record, "confirmer_ref")
        presence = record.get("presence_evidence")
        receipt = record.get("local_receipt")
        has_presence = presence is not None
        has_receipt = receipt is not None
        makes_confirmation = from_state == "pending" and to_state == "confirmed"
        if makes_confirmation:
            if confirmer is None or not has_presence or not has_receipt:
                fail("pending_confirmation_not_caller_supplied")
        elif to_state == "expired" and (confirmer is not None or has_presence or has_receipt):
            # An expiry is the absence of a new confirmation; it never erases an earlier one.
            fail("pending_expired_carries_no_confirmation")
        elif confirmer is not None or has_presence or has_receipt:
            fail("pending_confirmation_not_caller_supplied")
    if kind == "Approval":
        approver = _string_of(record, "approver_ref")
        requester = _string_of(record, "requester_ref")
        executor = _string_of(record, "executor_ref")
        if approver is not None and (approver == requester or (executor is not None and approver == executor)):
            fail("separation_of_duty")

    if kind == "DelegationGrant":
        parent = (context or {}).get("parent_grant")
        if is_object(parent):
            def listed(container: object) -> list[str]:
                return [entry for entry in container if isinstance(entry, str)] if isinstance(container, list) else []

            operations = listed(record.get("operations"))
            resources = listed(record.get("resource_selectors"))
            labels = listed(record.get("data_labels"))
            wider = (
                any(operation not in listed(parent.get("operations")) for operation in operations)
                or any(resource not in listed(parent.get("resource_selectors")) for resource in resources)
                or any(label not in listed(parent.get("data_labels")) for label in labels)
                or (
                    isinstance(record.get("audience"), str)
                    and record["audience"] != parent.get("audience")
                )
                or (
                    _string_of(record, "expires_at") is not None
                    and isinstance(parent.get("expires_at"), str)
                    and _string_of(record, "expires_at") > parent["expires_at"]
                )
                or (
                    isinstance(record.get("depth_remaining"), str)
                    and isinstance(parent.get("depth_remaining"), str)
                    and compare_decimal(record["depth_remaining"], parent["depth_remaining"]) > 0
                )
                or (record.get("redelegate") is True and parent.get("redelegate") is not True)
                or (record.get("offline") is True and parent.get("offline") is not True)
                or (
                    isinstance(record.get("delegator_ref"), str)
                    and isinstance(parent.get("agent_ref"), str)
                    and record["delegator_ref"] != parent["agent_ref"]
                )
                or (
                    isinstance(record.get("authority_epoch"), str)
                    and isinstance(parent.get("authority_epoch"), str)
                    and record["authority_epoch"] != parent["authority_epoch"]
                )
            )
            own_budget = record.get("budget") if is_object(record.get("budget")) else None
            parent_budget = parent.get("budget") if is_object(parent.get("budget")) else None
            if own_budget is not None and parent_budget is not None:
                if canonical_decimal(own_budget.get("amount")) and canonical_decimal(parent_budget.get("amount")):
                    if compare_decimal(own_budget["amount"], parent_budget["amount"]) > 0:
                        wider = True
            if own_budget is not None and canonical_decimal(own_budget.get("amount")) and canonical_decimal(own_budget.get("remaining")):
                if compare_decimal(own_budget["remaining"], own_budget["amount"]) > 0:
                    wider = True
            if wider:
                fail("child_subset_of_parent")

    if kind in ("EffectFence", "AuthorityDecision"):
        has_grant = not _is_null(record, "grant_ref")
        has_entitlement = not _is_null(record, "entitlement_ref")
        if has_grant == has_entitlement:
            fail("fence_authority_exactly_one")
        # An entitlement is an external record: SEA-Forge mints it and Horizon binds to it. A
        # record that names one is only as good as the entitlement behind it, so the two are
        # checked together. The rule applies only when the entitlement is the record's sole
        # authority; a record carrying both a grant and an entitlement is refused above.
        if has_entitlement and not has_grant:
            spec = entitlement_interface()
            view = (context or {}).get("entitlement")
            # While the owner has published no entitlement artifact there is nothing to
            # authenticate, so the path is unavailable rather than merely unsigned.
            if spec is None or spec.get("publication_status") != "published":
                fail("entitlement_is_external")
            elif not is_object(view):
                fail("entitlement_is_external")
            elif not entitlement_binds(record, kind, view, spec):
                fail("entitlement_is_external")

    if kind == "A3Receipt":
        predicate = _string_of(record, "assurance_predicate")
        if predicate == "A3-UV" and record.get("uv") is not True:
            fail("a3_uv_requires_uv")
        # A3-T rests on the protected-terminal claim. Without it the receipt claims an assurance it
        # cannot show, and the two claims never stand in for each other.
        if predicate == "A3-T" and record.get("protected_terminal_presence") is not True:
            fail("a3_t_requires_protected_terminal_presence")
        if predicate == "A3-UV" and record.get("protected_terminal_presence") is True:
            fail("a3_uv_is_not_terminal_presence")

    if kind in ("Approval", "OperationDescriptor", "PendingOperation"):
        nonce = _string_of(record, "nonce")
        if nonce is not None and nonce in (context or {}).get("previous_nonces", []):
            fail("nonce_not_reused")

    if kind in ("EffectFence", "EvidenceRecord", "PendingOperation"):
        if "previous_ref" in (context or {}):
            previous = (context or {})["previous_ref"]
            supplied = _string_of(record, "supersedes_ref")
            if (previous is None and supplied is not None) or (previous is not None and supplied != previous):
                fail("supersedes_chain")

    return out


def validate(
    contract: dict[str, Any],
    kind: str,
    value: object,
    catalog: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> list[str]:
    violations = [
        *check_fields(contract, kind, value),
        *check_constraints(contract, kind, value, catalog, context),
    ]
    return sorted(set(violations))


def effective_child_grant(contract: dict[str, Any], child: dict[str, Any]) -> dict[str, Any]:
    """A child grant with an absent field grants nothing; the field is not inherited."""

    effective: dict[str, Any] = {}
    for field in contract["records"]["DelegationGrant"]["fields"]:
        name = field["name"]
        if name == "signature":
            continue
        present = child.get(name)
        if present is not None:
            effective[name] = present
            continue
        if name in ("operations", "resource_selectors", "data_labels"):
            effective[name] = []
        elif name == "budget":
            effective[name] = {"amount": "0", "unit": "currency", "remaining": "0"}
        elif name == "depth_remaining":
            effective[name] = "0"
        elif name in ("redelegate", "offline"):
            effective[name] = False
        elif name == "audience":
            effective[name] = ""
        else:
            effective[name] = None
    return effective
