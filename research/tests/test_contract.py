import json
import subprocess
import sys

import pytest

from horizon_research.contract import CONTRACT, ContractError, health, ping


def test_health_is_contract_only() -> None:
    value = health()
    assert value["contract"] == CONTRACT
    assert value["status"] == "ok"
    assert value["ml"] is False
    assert "health" in value["capabilities"]


def test_ping_round_trip() -> None:
    assert ping({"kind": "ping", "echo": "frame-1"}) == {
        "contract": CONTRACT,
        "kind": "pong",
        "echo": "frame-1",
    }


def test_ping_rejects_unknown_shape() -> None:
    with pytest.raises(ContractError):
        ping({"kind": "settle"})
    with pytest.raises(ContractError):
        ping([])


def test_cli_health_emits_json() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "horizon_research.contract", "--health"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    assert json.loads(proc.stdout)["contract"] == CONTRACT
