"""Typed process contract between Cognate and the Python research subsystem.

T04 ships only transport and schema validation. No datasets, models, calibration or
experiment execution are claimed here.
"""

from __future__ import annotations

import json
import sys
from typing import Any, TypedDict


CONTRACT = "horizon.research/1"


class Health(TypedDict):
    contract: str
    status: str
    capabilities: list[str]
    ml: bool


class Pong(TypedDict):
    contract: str
    kind: str
    echo: str


class ContractError(ValueError):
    pass


def health() -> Health:
    return {
        "contract": CONTRACT,
        "status": "ok",
        "capabilities": ["health", "typed-process-contract"],
        "ml": False,
    }


def ping(document: Any) -> Pong:
    if not isinstance(document, dict):
        raise ContractError("request must be a JSON object")
    if document.get("kind") != "ping":
        raise ContractError("request kind must be 'ping'")
    echo = document.get("echo")
    if not isinstance(echo, str) or not echo:
        raise ContractError("request echo must be a non-empty string")
    return {"contract": CONTRACT, "kind": "pong", "echo": echo}


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args == ["--health"]:
        print(json.dumps(health(), sort_keys=True))
        return 0
    if args == ["--ping"]:
        try:
            request = json.load(sys.stdin)
            response = ping(request)
        except (json.JSONDecodeError, ContractError) as error:
            print(json.dumps({"contract": CONTRACT, "error": str(error)}, sort_keys=True))
            return 1
        print(json.dumps(response, sort_keys=True))
        return 0
    print("usage: python -m horizon_research.contract --health | --ping", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
