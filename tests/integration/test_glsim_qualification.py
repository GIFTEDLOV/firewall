"""Production-shaped local GLSim qualification for the frozen Firewall contract.

This test is intentionally localhost-only. It sends transactions to GLSim,
never to Studio-dev or another external RPC, and uses deterministic LLM
responses as controlled fixtures so the contract's consensus and readback
path can be exercised without an external model or live network.
"""

from __future__ import annotations

import copy
import json
import os
import time
from urllib.parse import urlparse

from eth_account import Account
from genlayer_py.chains.localnet import localnet
from genlayer_py.client import GenLayerClient
from web3 import Web3


RPC_URL = os.environ.get("GLSIM_RPC", "http://127.0.0.1:4010/api")
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _digest(label: str) -> bytes:
    return Web3.keccak(text=f"FIREWALL_CONTROLLED_FIXTURE:{label}")


def _as_bytes(value) -> bytes:
    if isinstance(value, bytes):
        return value
    assert isinstance(value, str) and value.startswith("0x"), value
    return bytes.fromhex(value[2:])


def _semantic_response(**overrides: bool) -> str:
    result = {
        "intent_satisfied": True,
        "scope_expanded": False,
        "prohibited_effect_present": False,
        "economic_terms_consistent": True,
        "administrative_authority_changed": False,
        "implementation_behavior_consistent": True,
        "evidence_sufficient": True,
    }
    result.update(overrides)
    return json.dumps(result, separators=(",", ":"))


def _sim_config(response: str) -> dict:
    return {
        "validators": [
            {
                "stake": 1,
                "provider": "controlled-fixture",
                "model": "controlled-fixture",
                "config": {},
                "plugin": "controlled-fixture",
                "plugin_config": {
                    "mock_response": {
                        # The simulator fixture decodes one JSON layer. Preserve
                        # the actual response_format="json" wire text for GenVM.
                        "response": {"FIREWALL_SEMANTIC_TASK_V1": json.dumps(response)},
                    },
                },
            }
        ]
    }


def _sim_config_split(first_response: str, second_response: str) -> dict:
    def validator(response: str, stake: int) -> dict:
        return {
            "stake": stake,
            "provider": "controlled-fixture",
            "model": "controlled-fixture",
            "config": {},
            "plugin": "controlled-fixture",
            "plugin_config": {"mock_response": {"response": {"FIREWALL_SEMANTIC_TASK_V1": json.dumps(response)}}},
        }
    return {"validators": [validator(first_response, 1), validator(second_response, 1)]}


def _write_to_terminal(client: GenLayerClient, address: str, method: str, args: list, sim_config: dict) -> tuple[str, dict]:
    tx_id = client.write_contract(address, method, args=args, sim_config=sim_config, leader_only=False)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        transaction = client.get_transaction(tx_id)
        if transaction.get("lifecycle", {}).get("state") in {"finalized", "canceled"}:
            return tx_id, transaction
        time.sleep(0.25)
    raise AssertionError(f"local GLSim transaction did not reach terminal state: {tx_id}")


def _write(client: GenLayerClient, address: str, method: str, args: list, *, sim_config: dict | None = None):
    tx_id = client.write_contract(
        address,
        method,
        args=args,
        sim_config=sim_config,
        leader_only=False,
    )
    transaction = client.get_transaction(tx_id)
    assert transaction["lifecycle"]["state"] == "finalized", transaction
    assert transaction["lifecycle"].get("outcome", "accepted") in {"accepted", "success"}, transaction
    receipts = transaction.get("consensus_data", {}).get("leader_receipt", [])
    assert receipts and receipts[0].get("execution_result") == "SUCCESS", transaction
    return tx_id, transaction


def _read(client: GenLayerClient, contract_address: str, method: str, args: list | None = None):
    response = client.provider.make_request(
        method="sim_read",
        params={"to": contract_address, "method": method, "args": args or [], "kwargs": {}},
    )
    return response["result"]["result"]


def _permit_binding_hash(client: GenLayerClient, contract_address: str, execution_id: str, adjudication_id: str, issued_at: int) -> bytes:
    mandate = _read(client, contract_address, "get_mandates")[0]
    execution = next(item for item in _read(client, contract_address, "get_executions") if item["execution_id"] == execution_id)
    adjudication = next(item for item in _read(client, contract_address, "get_adjudications") if item["adjudication_id"] == adjudication_id)
    fields = [
        "FIREWALL_PERMIT_BINDING_V1",
        mandate["mandate_id"], str(mandate["mandate_version"]), _as_bytes(mandate["proposal_hash"]).hex(),
        execution["execution_id"], _as_bytes(execution["bundle_hash"]).hex(), str(execution["chain_id"]),
        _as_bytes(execution["targets_digest"]).hex(), _as_bytes(execution["values_digest"]).hex(), _as_bytes(execution["calldata_digest"]).hex(),
        _as_bytes(execution["target_code_hashes_digest"]).hex(), _as_bytes(execution["implementation_hashes_digest"]).hex(),
        adjudication["adjudication_id"], str(adjudication["generation"]), "FIREWALL_MANDATE_V1",
        str(issued_at), str(issued_at + 86400),
    ]
    return Web3.keccak(text=json.dumps(fields, separators=(",", ":")))


def _read_result(client: GenLayerClient, contract_address: str, execution_id: str) -> dict:
    execution = next(item for item in _read(client, contract_address, "get_executions") if item["execution_id"] == execution_id)
    adjudication = next((item for item in _read(client, contract_address, "get_adjudications") if item["execution_id"] == execution_id), None)
    permits = [item for item in _read(client, contract_address, "get_permits") if item["execution_id"] == execution_id]
    return {"execution": execution, "adjudication": adjudication, "permits": permits}


def test_glsim_controlled_cases_are_consensus_and_readback_bound(tmp_path, capsys):
    parsed = urlparse(RPC_URL)
    assert parsed.hostname in LOCAL_HOSTS, f"qualification must remain localhost-only: {RPC_URL}"

    chain = copy.deepcopy(localnet)
    chain.rpc_urls = {"default": {"http": [RPC_URL]}}
    account = Account.from_key("0x" + "11" * 32)
    client = GenLayerClient(chain, account=account)

    contract_source = open("contracts/firewall.py", "rb").read()
    deployment_tx_id = client.deploy_contract(contract_source, account=account)
    deployment = client.get_transaction(deployment_tx_id)
    CONTRACT_ADDRESS = deployment.get("data", {}).get("contract_address") or deployment["to_address"]
    assert CONTRACT_ADDRESS not in {None, "0x" + "0" * 40}, deployment
    assert _read(client, CONTRACT_ADDRESS, "get_semantic_schema") == "FIREWALL_MANDATE_V1"
    assert _read(client, CONTRACT_ADDRESS, "get_semantic_keys") == [
        "intent_satisfied", "scope_expanded", "prohibited_effect_present",
        "economic_terms_consistent", "administrative_authority_changed",
        "implementation_behavior_consistent", "evidence_sufficient",
    ]

    mandate_text = (
        "Upgrade TreasuryVault to add batched withdrawals. "
        "No new administrator authority. No ownership change. No mint authority. "
        "No treasury transfer. Existing withdrawal permissions remain unchanged."
    )
    _, create_tx = _write(client, CONTRACT_ADDRESS, "create_mandate", [
        61997, "0x" + "22" * 20, "oz-governor-42", _digest("proposal"),
        "controlled://governance/oz/42", mandate_text, _digest("proposal-text"),
        len(mandate_text.encode("utf-8")), 1, _digest("mandate"),
    ])
    mandate_id = _read(client, CONTRACT_ADDRESS, "get_mandates")[0]["mandate_id"]
    _write(client, CONTRACT_ADDRESS, "freeze_mandate", [mandate_id, 100])

    # Case A: controlled compliant batching-only candidate.
    execution_a_args = [
        mandate_id, 61127, _digest("bundle-a"), _digest("targets-a"), _digest("values-a"),
        _digest("calldata-a"), _digest("facts-a"), _digest("target-code-a"), _digest("implementation-a"),
        _digest("evidence-a"), "CONTROLLED_FIXTURE_EXECUTION_A: batching only; no authority change",
    ]
    _, commit_a_tx = _write(client, CONTRACT_ADDRESS, "commit_execution", execution_a_args)
    execution_a = _read(client, CONTRACT_ADDRESS, "get_executions")[0]["execution_id"]
    _write(client, CONTRACT_ADDRESS, "authenticate_evidence", [
        execution_a, _digest("evidence-a"), _digest("authority-a"), _digest("source-a"),
        _digest("content-a"), 128, "FIREWALL_EVIDENCE_V1", 105,
    ])
    _, adjudicate_a_tx = _write(
        client, CONTRACT_ADDRESS, "adjudicate_execution", [execution_a],
        sim_config=_sim_config(_semantic_response()),
    )
    result_a = _read_result(client, CONTRACT_ADDRESS, execution_a)
    assert result_a["adjudication"]["verdict"] == "EXECUTION_PERMITTED"
    assert result_a["adjudication"]["evidence_sufficient"] is True
    binding_a = _permit_binding_hash(client, CONTRACT_ADDRESS, execution_a, result_a["adjudication"]["adjudication_id"], 120)
    _, permit_a_tx = _write(client, CONTRACT_ADDRESS, "issue_permit", [
        execution_a, result_a["adjudication"]["adjudication_id"], 120, binding_a,
    ])
    result_a = _read_result(client, CONTRACT_ADDRESS, execution_a)
    assert len(result_a["permits"]) == 1
    permit_a = result_a["permits"][0]
    assert _as_bytes(permit_a["permit_binding_hash"]) == binding_a
    assert _as_bytes(permit_a["execution_bundle_hash"]) == _digest("bundle-a")

    # Case B: same mandate, but privileged withdrawal redirection/admin authority.
    execution_b_args = [
        mandate_id, 61127, _digest("bundle-b"), _digest("targets-b"), _digest("values-b"),
        _digest("calldata-b"), _digest("facts-b"), _digest("target-code-b"), _digest("implementation-b"),
        _digest("evidence-b"), "CONTROLLED_FIXTURE_EXECUTION_B: batching plus privileged redirect withdrawals",
    ]
    _, commit_b_tx = _write(client, CONTRACT_ADDRESS, "commit_execution", execution_b_args)
    execution_b = _read(client, CONTRACT_ADDRESS, "get_executions")[1]["execution_id"]
    _write(client, CONTRACT_ADDRESS, "authenticate_evidence", [
        execution_b, _digest("evidence-b"), _digest("authority-b"), _digest("source-b"),
        _digest("content-b"), 156, "FIREWALL_EVIDENCE_V1", 106,
    ])
    _, adjudicate_b_tx = _write(
        client, CONTRACT_ADDRESS, "adjudicate_execution", [execution_b],
        sim_config=_sim_config(_semantic_response(scope_expanded=True, prohibited_effect_present=True, administrative_authority_changed=True)),
    )
    result_b = _read_result(client, CONTRACT_ADDRESS, execution_b)
    assert result_b["adjudication"]["verdict"] == "EXECUTION_BLOCKED"
    assert result_b["adjudication"]["scope_expanded"] is True
    assert result_b["adjudication"]["prohibited_effect_present"] is True
    assert result_b["adjudication"]["administrative_authority_changed"] is True
    assert result_b["permits"] == []

    # Case C: malformed semantic JSON must complete as nonbusiness state.
    execution_c_args = [
        mandate_id, 61127, _digest("bundle-c"), _digest("targets-c"), _digest("values-c"),
        _digest("calldata-c"), _digest("facts-c"), _digest("target-code-c"), _digest("implementation-c"),
        _digest("evidence-c"), "CONTROLLED_FIXTURE_EXECUTION_C: malformed semantic response",
    ]
    _, commit_c_tx = _write(client, CONTRACT_ADDRESS, "commit_execution", execution_c_args)
    execution_c = _read(client, CONTRACT_ADDRESS, "get_executions")[2]["execution_id"]
    _write(client, CONTRACT_ADDRESS, "authenticate_evidence", [
        execution_c, _digest("evidence-c"), _digest("authority-c"), _digest("source-c"),
        _digest("content-c"), 128, "FIREWALL_EVIDENCE_V1", 107,
    ])
    malformed = json.loads(_semantic_response())
    del malformed["intent_satisfied"]
    adjudicate_c_tx, transaction_c = _write_to_terminal(
        client, CONTRACT_ADDRESS, "adjudicate_execution", [execution_c],
        _sim_config(json.dumps(malformed, separators=(",", ":"))),
    )
    result_c = _read_result(client, CONTRACT_ADDRESS, execution_c)
    assert transaction_c.get("txExecutionResultName") != "FINISHED_WITH_RETURN", transaction_c
    assert result_c["execution"]["state"] == "EVIDENCE_AUTHENTICATED"
    assert result_c["execution"]["generation"] == 0
    assert result_c["adjudication"] is None
    assert result_c["permits"] == []
    assert len(_read(client, CONTRACT_ADDRESS, "get_adjudications")) == 2

    # Case D: valid but divergent semantic vectors must fail validator agreement.
    execution_d_args = [
        mandate_id, 61127, _digest("bundle-d"), _digest("targets-d"), _digest("values-d"),
        _digest("calldata-d"), _digest("facts-d"), _digest("target-code-d"), _digest("implementation-d"),
        _digest("evidence-d"), "CONTROLLED_FIXTURE_EXECUTION_D: validator disagreement",
    ]
    _, commit_d_tx = _write(client, CONTRACT_ADDRESS, "commit_execution", execution_d_args)
    execution_d = _read(client, CONTRACT_ADDRESS, "get_executions")[3]["execution_id"]
    _write(client, CONTRACT_ADDRESS, "authenticate_evidence", [
        execution_d, _digest("evidence-d"), _digest("authority-d"), _digest("source-d"),
        _digest("content-d"), 128, "FIREWALL_EVIDENCE_V1", 108,
    ])
    vector_true = json.loads(_semantic_response())
    vector_false = {**vector_true, "scope_expanded": True}
    adjudicate_d_tx, transaction_d = _write_to_terminal(
        client, CONTRACT_ADDRESS, "adjudicate_execution", [execution_d],
        _sim_config_split(
            json.dumps(vector_true, separators=(",", ":")),
            json.dumps(vector_false, separators=(",", ":")),
        ),
    )
    result_d = _read_result(client, CONTRACT_ADDRESS, execution_d)
    assert transaction_d.get("txExecutionResultName") != "FINISHED_WITH_RETURN", transaction_d
    assert result_d["execution"]["state"] == "EVIDENCE_AUTHENTICATED"
    assert result_d["execution"]["generation"] == 0
    assert result_d["adjudication"] is None
    assert result_d["permits"] == []
    assert len(_read(client, CONTRACT_ADDRESS, "get_adjudications")) == 2

    log = {
        "environment": {"rpc": RPC_URL, "chain_id": 61127, "validators": 5, "llm": "controlled fixture"},
        "case_a": {"execution_id": execution_a, "adjudication": result_a["adjudication"], "permit": result_a["permits"][0], "tx_ids": [create_tx["hash"], commit_a_tx["hash"], adjudicate_a_tx["hash"], permit_a_tx["hash"]]},
        "case_b": {"execution_id": execution_b, "adjudication": result_b["adjudication"], "permit": None, "tx_ids": [commit_b_tx["hash"], adjudicate_b_tx["hash"]]},
        "case_c": {"execution_id": execution_c, "lifecycle": transaction_c.get("lifecycle"), "execution_state": result_c["execution"]["state"], "adjudication": None, "permit": None, "tx_ids": [commit_c_tx["hash"], adjudicate_c_tx]},
        "case_d": {"execution_id": execution_d, "lifecycle": transaction_d.get("lifecycle"), "execution_state": result_d["execution"]["state"], "adjudication": None, "permit": None, "tx_ids": [commit_d_tx["hash"], adjudicate_d_tx]},
        "result_shopping": False,
    }
    print(json.dumps(log, default=lambda value: value.hex() if isinstance(value, bytes) else str(value), sort_keys=True))
