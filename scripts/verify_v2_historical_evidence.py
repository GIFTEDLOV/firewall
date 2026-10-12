"""Live qualification proof for the V2 evidence boundary.

This is intentionally a read-only test against the supplied historical mainnet
transaction. It loads the candidate contract's normalization code with a tiny
GenLayer runtime shim, then exercises the same native-provider parsing path
used by leader and validator retrieval. It does not submit a transaction.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import types
import urllib.request
from pathlib import Path


TX = "0xd093d4ebae3c529a950002a123e1f58a412b56c87b2c2dcb22704708f8f3f9eb"
SAFE = "0x954a62cbc5b48af7342dfd00e40bf2c9f6de9d19"
BLOCK = "22848240"
BLOCKSCOUT_IMPLEMENTATION = "0xd9db270c1b5e3bd161e8c8503c55ceabee709552"


class _Generic:
    @classmethod
    def __class_getitem__(cls, item):
        return cls


class _Contract:
    pass


class _Public:
    def __getattr__(self, name):
        return lambda function: function


class _Response:
    def __init__(self, body: bytes):
        self.body = body


class _Web:
    @staticmethod
    def get(url: str):
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "Firewall-V2-live-evidence-proof/1.0",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP_{response.status}")
            return _Response(response.read())


def _load_candidate():
    genlayer = types.ModuleType("genlayer")
    gl = types.SimpleNamespace(
        Contract=_Contract,
        public=_Public(),
        nondet=types.SimpleNamespace(web=_Web()),
        eq_principle=types.SimpleNamespace(strict_eq=lambda function: function),
        vm=types.SimpleNamespace(
            UserError=RuntimeError,
            run_nondet_unsafe=lambda leader, validator: leader(),
        ),
        message=types.SimpleNamespace(sender_address="0x" + "11" * 20),
    )
    genlayer.gl = gl
    genlayer.Contract = _Contract
    genlayer.public = gl.public
    genlayer.nondet = gl.nondet
    genlayer.eq_principle = gl.eq_principle
    genlayer.vm = gl.vm
    genlayer.message = gl.message
    genlayer.contract = types.SimpleNamespace(Contract=_Contract)
    genlayer.storage = types.ModuleType("genlayer.storage")
    genlayer.storage.DynArray = _Generic
    genlayer.storage.allow = lambda value: value
    genlayer.types = types.ModuleType("genlayer.types")
    genlayer.types.Address = str
    genlayer.types.u256 = int
    genlayer.types.keccak = types.ModuleType("genlayer.types.keccak")
    genlayer.types.keccak.Keccak256 = lambda value: hashlib.sha3_256(value)
    genlayer.Address = str
    genlayer.DynArray = _Generic
    genlayer.allow_storage = lambda value: value
    genlayer.Keccak256 = genlayer.types.keccak.Keccak256
    genlayer.u256 = int
    sys.modules.update(
        {
            "genlayer": genlayer,
            "genlayer.storage": genlayer.storage,
            "genlayer.types": genlayer.types,
            "genlayer.types.keccak": genlayer.types.keccak,
        }
    )
    path = Path(__file__).resolve().parents[1] / "contracts" / "firewall_v2_candidate.py"
    spec = importlib.util.spec_from_file_location("firewall_v2_candidate", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _fetch_documents(config: dict) -> dict:
    documents = {}
    for key in ("transaction", "block", "logs", "implementation", "transaction_payload", "receipt", "internal"):
        url = config.get(key)
        if not isinstance(url, str) or not url or url in documents:
            continue
        documents[url] = json.loads(_Web.get(url).body.decode("utf-8"))
    return documents


def main() -> None:
    module = _load_candidate()
    candidate = module.FirewallV2.__new__(module.FirewallV2)
    blockscout = {
        "kind": "BLOCKSCOUT_V2",
        "chain_id": "1",
        "transaction": f"https://eth.blockscout.com/api/v2/transactions/{TX}",
        "block": f"https://eth.blockscout.com/api/v2/blocks/{BLOCK}",
        "logs": f"https://eth.blockscout.com/api/v2/transactions/{TX}/logs",
        "implementation": f"https://eth.blockscout.com/api/v2/smart-contracts/{BLOCKSCOUT_IMPLEMENTATION}",
    }
    routescan = {
        "kind": "ROUTESCAN_ETHEREUM",
        "chain_id": "1",
        "transaction": f"https://api.routescan.io/v2/network/mainnet/evm/1/transactions/{TX}",
        "transaction_payload": f"https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api?module=proxy&action=eth_getTransactionByHash&txhash={TX}",
        "receipt": f"https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api?module=proxy&action=eth_getTransactionReceipt&txhash={TX}",
        "block": "https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api?module=proxy&action=eth_getBlockByNumber&tag=0x15ca2f0&boolean=false",
        "internal": f"https://api.routescan.io/v2/network/mainnet/evm/1/internal-operations?txHash={TX}",
    }
    source_a = json.dumps(blockscout, separators=(",", ":"), sort_keys=True)
    source_b = json.dumps(routescan, separators=(",", ":"), sort_keys=True)
    documents = _fetch_documents(blockscout)
    documents.update(_fetch_documents(routescan))
    candidate.trusted_source_a = source_a
    candidate.trusted_source_b = source_b

    first = candidate._normalize_blockscout(blockscout, 1, documents)
    second = candidate._normalize_routescan(routescan, 1, documents)
    assert first is not None and second is not None
    assert first == second
    assert first["chain_id"] == 1
    assert first["governance_contract"] == SAFE
    assert first["transaction_hash"] == TX
    assert first["block_number"] == int(BLOCK)
    assert first["receipt_status"] == "SUCCESS"
    assert first["execution_outcome"] == "SAFE_EXECUTION_SUCCESS"
    assert first["safe_implementation_address"] == BLOCKSCOUT_IMPLEMENTATION

    expected_facts = dict(first)
    expected_facts["mandate_id"] = "MND-LIVE"
    execution = module.Execution(
        "EXE-LIVE",
        "MND-LIVE",
        1,
        json.dumps(expected_facts, separators=(",", ":"), sort_keys=True),
        source_a,
        source_b,
        "EXECUTION_COMMITTED",
        "",
        "UNVERIFIED",
        0,
    )
    assert candidate._authenticated_source(execution, documents) == first

    original_routescan_normalizer = candidate._normalize_routescan
    candidate._normalize_routescan = lambda config, chain, source_documents: {
        **original_routescan_normalizer(config, chain, source_documents),
        "block_hash": "0x" + "00" * 32,
    }
    assert candidate._authenticated_source(execution, documents) is None
    candidate._normalize_routescan = original_routescan_normalizer

    tampered = dict(expected_facts)
    tampered["transaction_calldata"] = "0xdeadbeef"
    tampered_execution = module.Execution(
        "EXE-TAMPERED",
        "MND-LIVE",
        1,
        json.dumps(tampered, separators=(",", ":"), sort_keys=True),
        source_a,
        source_b,
        "EXECUTION_COMMITTED",
        "",
        "UNVERIFIED",
        0,
    )
    assert candidate._authenticated_source(tampered_execution, documents) is None

    print(
        json.dumps(
            {
                "provider_1": source_a,
                "provider_2": source_b,
                "independent_facts_match": True,
                "validator_side_retrieval": "same normalizers and same native GET documents",
                "provider_disagreement_rejected": True,
                "tampered_expected_facts_rejected": True,
                "chain_id": first["chain_id"],
                "transaction_hash": first["transaction_hash"],
                "block_number": first["block_number"],
                "block_hash": first["block_hash"],
                "safe": first["governance_contract"],
                "safe_implementation": first["safe_implementation_address"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
