import ast
import copy
import json
from pathlib import Path

from eth_hash.auto import keccak


SOURCE = Path(__file__).resolve().parents[2] / "contracts" / "firewall_v3_9_prospective.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
RUNNER = Path(__file__).resolve().parents[2] / "packages" / "genlayer-client" / "scripts" / "firewall_studionet_v3_runner.ts"
V3_9_WRAPPER = Path(__file__).resolve().parents[2] / "packages" / "genlayer-client" / "scripts" / "firewall_studionet_v3_9_runner.ts"


class _Digest:
    def __init__(self, raw):
        self.raw = keccak(raw)

    def digest(self):
        return self.raw


def _load_normalizer():
    selected_constants = {
        "CHAIN_ID", "SAFE_SINGLETON", "SAFE_SINGLETON_CODE_HASH", "SAFE_FACTORY",
        "SAFE_FACTORY_CODE_HASH", "SAFE_PROXY_CREATION_TOPIC", "SAFE_MODULE_SENTINEL",
        "SAFE_GUARD_STORAGE_SLOT", "MAX_SNAPSHOT_AGE",
    }
    assignments = [
        node for node in TREE.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id in selected_constants for target in node.targets)
    ]
    names = {"_keccak", "_lower", "_word", "_word_address", "_hex_number", "_normalize_prospective_provider"}
    functions = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in names]
    namespace = {"json": json, "Keccak256": _Digest}
    exec(compile(ast.fix_missing_locations(ast.Module(body=assignments + functions, type_ignores=[])), str(SOURCE), "exec"), namespace)
    # Use deterministic test bytecode for the two registry contracts. The code
    # hashes are independently rechecked by the normalizer on every test.
    namespace["SAFE_FACTORY_CODE_HASH"] = "0x" + keccak(bytes.fromhex("60016002")).hex()
    namespace["SAFE_SINGLETON_CODE_HASH"] = "0x" + keccak(bytes.fromhex("60036004")).hex()
    return namespace["_normalize_prospective_provider"]


def _word(value):
    return value[2:].lower().rjust(64, "0")


def _fixture():
    normalize = _load_normalizer()
    safe = "0x" + "11" * 20
    owner = "0x" + "22" * 20
    target = "0x" + "33" * 20
    guard = "0x" + "44" * 20
    singleton = "0x41675c099f32341bf84bfc5382af534df5c7461a"
    factory = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67"
    singleton_code = "0x60036004"
    factory_code = "0x60016002"
    safe_code = "0x60056006"
    guard_code = "0x60076008"
    target_code = "0x6009600a"
    intent = {
        "intent_id": "0x" + "55" * 32, "owner": owner, "chain_id": 11155111,
        "safe": safe, "safe_nonce": 7, "target": target, "value": "9",
        "calldata": "0x1234", "calldata_hash": "0x" + "66" * 32, "operation": 0,
        "guard": guard, "guard_code_hash": "0x" + keccak(bytes.fromhex(guard_code[2:])).hex(),
        "target_code_hash": "0x" + keccak(bytes.fromhex(target_code[2:])).hex(),
        "safe_deployment_tx": "0x" + "77" * 32, "evidence_block": 100,
        "execution_deadline": 2_000_000_000, "permit_expiry": 2_000_000_100,
    }
    deployment_block_hash = "0x" + "88" * 32
    snapshot_hash = "0x" + "99" * 32
    receipt = {
        "transactionHash": intent["safe_deployment_tx"], "status": "0x1", "to": factory,
        "blockNumber": "0x5", "blockHash": deployment_block_hash,
        "logs": [{
            "address": factory,
            "topics": ["0x" + "aa" * 32, "0x" + _word(safe)],
            "data": "0x" + _word(singleton),
        }],
    }
    # Use the Safe Factory's pinned ProxyCreation event topic.
    module = _load_constants()
    receipt["logs"][0]["topics"][0] = module["SAFE_PROXY_CREATION_TOPIC"]
    records = {
        "chain_id": "0xaa36a7",
        "snapshot_block": {"number": "0x64", "hash": snapshot_hash, "timestamp": hex(1_800_000_000)},
        "safe_deployment": {"hash": intent["safe_deployment_tx"], "to": factory, "blockNumber": "0x5", "blockHash": deployment_block_hash},
        "safe_deployment_receipt": receipt,
        "deployment_block": {"number": "0x5", "hash": deployment_block_hash},
        "safe_code": safe_code, "factory_code": factory_code, "singleton_code": singleton_code,
        "guard_code": guard_code, "target_code": target_code,
        "safe_singleton": "0x" + _word(singleton),
        "safe_owners": "0x" + _word("0x20") + _word("0x1") + _word(owner),
        "safe_threshold": "0x1", "safe_nonce": "0x7",
        "installed_guard": "0x" + _word(guard),
        "safe_modules": "0x" + _word("0x40") + _word("0x0000000000000000000000000000000000000001") + _word("0x0"),
    }
    return normalize, intent, records, {"now": 1_800_000_005, "safe": safe, "owner": owner, "target": target, "guard": guard}


def _load_constants():
    selected = {"SAFE_PROXY_CREATION_TOPIC"}
    assignments = [node for node in TREE.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in selected for target in node.targets)]
    namespace = {}
    exec(compile(ast.fix_missing_locations(ast.Module(body=assignments, type_ignores=[])), str(SOURCE), "exec"), namespace)
    return namespace


def test_v3_prospective_snapshot_authenticates_matching_independent_provider_facts():
    normalize, intent, records, context = _fixture()
    result = normalize(intent, records, "DRPC_SEPOLIA", context["now"])
    assert result is not None
    assert result["chain_id"] == 11155111
    assert result["safe_state"]["owners"] == [context["owner"]]
    assert result["safe_state"]["guard"] == context["guard"]
    assert result["safe_state"]["enabled_modules"] == []
    assert result["safe_deployment"]["receipt_status"] == "SUCCESS"
    assert result["target_state"]["value"] == "9"


def test_v3_prospective_snapshot_accepts_exact_next_nonce_for_owner_signed_guard_installation():
    normalize, intent, records, context = _fixture()
    intent["safe_nonce"] = 8
    records["safe_nonce"] = "0x7"
    records["installed_guard"] = "0x" + _word("0x0")
    result = normalize(intent, records, "DRPC_SEPOLIA", context["now"])
    assert result is not None
    state = result["safe_state"]
    assert state["nonce"] == 7
    assert state["guard"] == "0x" + "00" * 20
    assert state["intended_guard"] == context["guard"]
    assert state["guard_installation_pending"] is True
    assert state["planned_execution_nonce"] == 8


def test_v3_prospective_snapshot_rejects_guard_installation_nonce_gap_or_foreign_guard():
    normalize, intent, records, context = _fixture()
    intent["safe_nonce"] = 9
    records["safe_nonce"] = "0x7"
    records["installed_guard"] = "0x" + _word("0x0")
    assert normalize(intent, records, "DRPC_SEPOLIA", context["now"]) is None
    intent["safe_nonce"] = 8
    records["installed_guard"] = "0x" + _word("0x" + "ab" * 20)
    assert normalize(intent, records, "DRPC_SEPOLIA", context["now"]) is None


def test_v3_prospective_snapshot_rejects_tampered_or_stale_facts():
    normalize, intent, records, context = _fixture()
    mutations = [
        ("chain_id", lambda value: value.__setitem__("chain_id", "0x1")),
        ("receipt_status", lambda value: value["safe_deployment_receipt"].__setitem__("status", "0x0")),
        ("receipt_tx", lambda value: value["safe_deployment_receipt"].__setitem__("transactionHash", "0x" + "ab" * 32)),
        ("receipt_block", lambda value: value["safe_deployment_receipt"].__setitem__("blockHash", "0x" + "ab" * 32)),
        ("factory_event", lambda value: value["safe_deployment_receipt"]["logs"][0]["topics"].__setitem__(0, "0x" + "00" * 32)),
        ("owner", lambda value: value.__setitem__("safe_owners", "0x" + _word("0x20") + _word("0x1") + _word("0x" + "ab" * 20))),
        ("nonce", lambda value: value.__setitem__("safe_nonce", "0x8")),
        ("guard", lambda value: value.__setitem__("installed_guard", "0x" + _word("0x" + "ab" * 20))),
        ("modules", lambda value: value.__setitem__("safe_modules", "0x" + _word("0x40") + _word("0x0000000000000000000000000000000000000001") + _word("0x1"))),
        ("target_code", lambda value: value.__setitem__("target_code", "0x600b600c")),
        ("snapshot_number", lambda value: value["snapshot_block"].__setitem__("number", "0x65")),
        ("stale_snapshot", lambda value: value["snapshot_block"].__setitem__("timestamp", "0x1")),
    ]
    for label, mutate in mutations:
        changed = copy.deepcopy(records)
        mutate(changed)
        assert normalize(intent, changed, "DRPC_SEPOLIA", context["now"]) is None, label


def test_v3_contract_retrieves_rpc_facts_and_compares_independent_validator_fetches_without_llm_equivalence():
    source = SOURCE.read_text(encoding="utf-8")
    assert '"https://sepolia.drpc.org"' in source
    assert '"https://ethereum-sepolia-rpc.publicnode.com"' in source
    assert '"https://eth-sepolia.blockscout.com/api/v2"' in source
    authentication = source.split("    def authenticate_prospective_intent(", 1)[1].split("    @gl.public.write\n    def adjudicate_prospective_intent", 1)[0]
    assert "gl.eq_principle.strict_eq" not in authentication
    assert "gl.vm.run_nondet_unsafe(leader_fn, validator_fn)" in authentication
    assert "facts_a = _normalize_prospective_provider(expected_intent, _provider_records(RPC_A, intent)" in source
    assert "facts_b = _normalize_prospective_provider(expected_intent, _provider_records(RPC_B, intent)" in source
    assert "return _fetch_authenticated_evidence(nondet_intent, expected_intent)" in authentication
    assert "leader_result.calldata == _fetch_authenticated_evidence(nondet_intent, expected_intent)" in authentication
    intent_auth = next(node for node in TREE.body if isinstance(node, ast.ClassDef) and node.name == "FirewallProspectiveV3")
    method = next(node for node in intent_auth.body if isinstance(node, ast.FunctionDef) and node.name == "authenticate_prospective_intent")
    for nested_name in ("leader_fn", "validator_fn"):
        nested = next(node for node in method.body if isinstance(node, ast.FunctionDef) and node.name == nested_name)
        captured_names = {node.id for node in ast.walk(nested) if isinstance(node, ast.Name)}
        assert "intent" not in captured_names, f"{nested_name} must not capture storage-backed intent"
        assert "self" not in captured_names, f"{nested_name} must use module-level RPC helpers"
    rpc_helpers = {
        node.name for node in TREE.body
        if isinstance(node, ast.FunctionDef) and node.name in {"_rpc_batch", "_provider_records", "_fetch_authenticated_evidence"}
    }
    assert rpc_helpers == {"_rpc_batch", "_provider_records", "_fetch_authenticated_evidence"}
    assert "PREEXECUTION_EVIDENCE_CONSENSUS_FAILED" in authentication
    assert "gl.vm.run_nondet_unsafe(leader_fn, validator_fn)" in source
    assert "independent = self._semantic(prompt)" in source
    assert 'gl.nondet.exec_prompt(prompt, response_format="json")' in source
    assert '"receipt_claimed_for_future_execution": False' in source


def test_v3_genvm_web_request_batches_small_json_rpc_groups_and_diagnoses_provider_method():
    source = SOURCE.read_text(encoding="utf-8")
    rpc_method = source.split("def _rpc_batch(", 1)[1].split("\ndef _provider_records(", 1)[0]
    assert "for start in range(0, len(requests), 3)" in rpc_method
    assert 'body=json.dumps(batch, separators=(",", ":"), sort_keys=True)' in rpc_method
    assert 'headers={"Content-Type": "application/json", "Accept-Encoding": "identity"}' in rpc_method
    assert "response.status != 200" in rpc_method
    assert "response.status_code" not in rpc_method
    assert "INDEPENDENT_PREEXECUTION_PROVIDER_UNAVAILABLE:" in rpc_method
    assert "INDEPENDENT_PREEXECUTION_PROVIDER_RPC_ERROR:" in rpc_method


def test_v3_rpc_batch_binds_out_of_order_responses_to_ids_and_chunks_at_three():
    method = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == "_rpc_batch")
    captured = []

    class _VmError(Exception):
        pass

    class _Response:
        status = 200

        def __init__(self, body):
            self.body = body

    class _Web:
        @staticmethod
        def request(endpoint, *, method, body, headers):
            request_batch = json.loads(body)
            captured.append((endpoint, method, headers, request_batch))
            payload = [{"jsonrpc": "2.0", "id": item["id"], "result": item["method"]} for item in reversed(request_batch)]
            return _Response(json.dumps(payload).encode())

    namespace = {
        "json": json,
        "gl": type("FakeGl", (), {"nondet": type("Nondet", (), {"web": _Web}), "vm": type("Vm", (), {"UserError": _VmError})}),
        "RPC_A": "https://sepolia.drpc.org",
        "RPC_B": "https://sepolia.gateway.tenderly.co",
    }
    exec(compile(ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[])), str(SOURCE), "exec"), namespace)
    requests = [(f"k{i}", f"method{i}", []) for i in range(7)]
    result = namespace["_rpc_batch"]("https://sepolia.drpc.org", requests)
    assert result == {f"k{i}": f"method{i}" for i in range(7)}
    assert [len(call[3]) for call in captured] == [3, 3, 1]
    assert all([item["id"] for item in call[3]] == list(range(1, len(call[3]) + 1)) for call in captured)


def test_v3_runner_binds_the_target_safe_chain_not_the_genlayer_chain():
    runner = RUNNER.read_text(encoding="utf-8")
    assert 'const CHAIN_ID = 61999;' in runner
    assert 'const EVM_CHAIN_ID = 11155111;' in runner
    assert 'BigInt(EVM_CHAIN_ID), SAFE' in runner
    assert 'Number(args[2]) !== EVM_CHAIN_ID' in runner


def test_v3_9_runner_uses_corrected_source_and_separate_durable_journal():
    wrapper = V3_9_WRAPPER.read_text(encoding="utf-8")
    assert 'process.env.FIREWALL_V3_SOURCE_SHA256 = "9bf5631b8f537cbe27bd82457db055c016fc53e0f8499a22223424189b66b3a3"' in wrapper
    assert 'firewall-studionet-v3-9-publicnode-blockscout-transactions.json' in wrapper
    assert 'await import("./firewall_studionet_v3_runner.js")' in wrapper


def test_v3_runner_tracks_pending_hash_before_nonce_preflight_and_locks_signer():
    runner = RUNNER.read_text(encoding="utf-8")
    main = runner.split("async function main()", 1)[1]
    assert main.index("await trackStep(existing, client, pending.key)") < main.index("await resumePreflight(client, account.address)")
    assert "acquireRunLock()" in main
    assert '"V3_RUNNER_ALREADY_ACTIVE_REFUSE_PARALLEL_WRITES"' in runner
