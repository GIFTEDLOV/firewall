"""Focused tests for V3.9's independent PublicNode + Blockscout evidence path."""

import ast
import json
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[2] / "contracts" / "firewall_v3_9_prospective.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))


def _load_blockscout_helpers(responses):
    names = {"_lower", "_word", "_word_address", "_hex_number", "_blockscout_json", "_blockscout_creation_receipt"}
    functions = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in names]

    class _VmError(Exception):
        pass

    class _Response:
        status = 200

        def __init__(self, payload):
            self.body = json.dumps(payload).encode("utf-8")

    class _Web:
        @staticmethod
        def request(url, *, method, headers):
            assert method == "GET"
            assert headers["Accept"] == "application/json"
            return _Response(responses[url.rsplit("/api/v2", 1)[-1]])

    namespace = {
        "json": json,
        "BLOCKSCOUT_API": "https://eth-sepolia.blockscout.com/api/v2",
        "SAFE_FACTORY": "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67",
        "SAFE_SINGLETON": "0x41675c099f32341bf84bfc5382af534df5c7461a",
        "SAFE_PROXY_CREATION_TOPIC": "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235",
        "gl": type("FakeGl", (), {"nondet": type("Nondet", (), {"web": _Web}), "vm": type("Vm", (), {"UserError": _VmError})}),
    }
    exec(compile(ast.fix_missing_locations(ast.Module(body=functions, type_ignores=[])), str(SOURCE), "exec"), namespace)
    return namespace


def _fixture():
    tx_hash = "0xa1554d38879c0da9f38897cc6ea31b97a0299e927b2911306e694e9a7092f605"
    safe = "0x9387e30c1b1a864686df80d46786c4f29fe735ba"
    factory = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67"
    singleton = "0x41675c099f32341bf84bfc5382af534df5c7461a"
    block_hash = "0x" + "ab" * 32
    block_number = 4_000_000
    topic = "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235"
    responses = {
        f"/transactions/{tx_hash}": {
            "hash": tx_hash, "status": "ok", "result": "success", "block_number": block_number,
            "value": "0", "to": {"hash": factory},
        },
        f"/transactions/{tx_hash}/logs": {
            "items": [{
                "transaction_hash": tx_hash, "block_number": block_number, "block_hash": block_hash,
                "address": {"hash": factory},
                "topics": [topic, "0x" + safe[2:].rjust(64, "0")],
                "data": "0x" + singleton[2:].rjust(64, "0"),
            }],
        },
        f"/blocks/{block_number}": {"height": block_number, "hash": block_hash},
    }
    intent = {"safe_deployment_tx": tx_hash, "safe": safe}
    publicnode_tx = {"hash": tx_hash, "to": factory, "blockNumber": hex(block_number), "blockHash": block_hash}
    publicnode_block = {"number": hex(block_number), "hash": block_hash}
    return responses, intent, publicnode_tx, publicnode_block


def test_v3_9_blockscout_receipt_is_cross_bound_to_publicnode_transaction_and_block():
    responses, intent, publicnode_tx, publicnode_block = _fixture()
    helpers = _load_blockscout_helpers(responses)
    receipt = helpers["_blockscout_creation_receipt"](intent, publicnode_tx, publicnode_block)
    assert receipt["status"] == "0x1"
    assert receipt["transactionHash"] == intent["safe_deployment_tx"]
    assert receipt["blockHash"] == publicnode_block["hash"]
    assert receipt["to"].lower() == publicnode_tx["to"].lower()
    assert receipt["logs"][0]["topics"][1].lower().endswith("9387e30c1b1a864686df80d46786c4f29fe735ba")


def test_v3_9_blockscout_rejects_transaction_block_or_proxy_event_disagreement():
    for mutate in (
        lambda responses, intent, evm_tx: responses[f"/transactions/{intent['safe_deployment_tx']}"].__setitem__("result", "error"),
        lambda responses, intent, evm_tx: responses[f"/blocks/{int(evm_tx['blockNumber'], 16)}"].__setitem__("hash", "0x" + "cd" * 32),
        lambda responses, intent, evm_tx: responses[f"/transactions/{intent['safe_deployment_tx']}/logs"]["items"][0]["topics"].__setitem__(0, "0x" + "00" * 32),
    ):
        responses, intent, publicnode_tx, publicnode_block = _fixture()
        mutate(responses, intent, publicnode_tx)
        helpers = _load_blockscout_helpers(responses)
        try:
            helpers["_blockscout_creation_receipt"](intent, publicnode_tx, publicnode_block)
        except (AssertionError, Exception):
            continue
        raise AssertionError("tampered Blockscout evidence must be rejected")


def test_v3_9_contract_uses_publicnode_and_independent_blockscout_rest_for_creation_receipt():
    source = SOURCE.read_text(encoding="utf-8")
    assert 'RPC_B = "https://ethereum-sepolia-rpc.publicnode.com"' in source
    assert 'BLOCKSCOUT_API = "https://eth-sepolia.blockscout.com/api/v2"' in source
    provider_records = source.split("def _provider_records(", 1)[1].split("def _fetch_authenticated_evidence", 1)[0]
    assert 'if endpoint == RPC_A:' in provider_records
    assert 'if endpoint != RPC_A:' in provider_records
    assert '_blockscout_creation_receipt(intent, deployment, deployment_block)' in provider_records
    evidence = source.split('"independently_authenticated": {', 1)[1].split('"receipt_claimed_for_future_execution"', 1)[0]
    assert '"provider_b_receipt_source": "BLOCKSCOUT_SEPOLIA_REST"' in evidence
    assert '"receipt_claimed_for_future_execution": False' in source
    assert '"PUBLICNODE_SEPOLIA_BLOCKSCOUT"' in source
