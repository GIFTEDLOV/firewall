import ast
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[2] / "contracts" / "firewall_v2_candidate.py"


def test_v2_candidate_is_separate_and_source_grounded():
    source = SOURCE.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(SOURCE))
    assert any(isinstance(node, ast.ClassDef) and node.name == "FirewallV2" for node in tree.body)
    assert "gl.nondet.web.get" in source
    assert "gl.eq_principle.strict_eq" in source
    assert "gl.vm.run_nondet_unsafe" in source
    assert "trusted_source_a" in source and "trusted_source_b" in source
    assert "def create_mandate(" in source and "def freeze_mandate(" in source
    assert "mandate_id" in source and "MANDATE_FROZEN" in source
    assert "INDEPENDENT_EVIDENCE_UNAVAILABLE_OR_MISMATCH" in source
    assert "def authenticate_evidence(self, execution_id: str)" in source
    assert "def _normalize_blockscout(" in source and "def _normalize_routescan(" in source
    assert "transaction_hash" in source and "governance_contract" in source
    assert "SAFE_DIRECT_CALL_ONLY" in source and "ExecutionSuccess" in source
    assert "first != second" in source
    assert "datetime.now(timezone.utc)" in source
    assert "def get_permit_status(self, permit_id: str)" in source


def test_v2_does_not_use_caller_supplied_permit_time_or_receipt():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
    issue = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "issue_permit")
    assert [arg.arg for arg in issue.args.args] == ["self", "execution_id", "adjudication_id"]
    auth = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "authenticate_evidence")
    assert [arg.arg for arg in auth.args.args] == ["self", "execution_id"]


def test_v2_expected_facts_bind_transaction_and_receipt_identity():
    source = SOURCE.read_text(encoding="utf-8")
    for field in ("transaction_hash", "block_number", "block_hash", "receipt_status", "execution_outcome", "transaction_calldata", "safe_implementation_address"):
        assert field in source
    assert "facts.get(\"receipt_status\") == \"SUCCESS\"" in source
    assert "facts.get(\"execution_outcome\") == \"SAFE_EXECUTION_SUCCESS\"" in source
    assert "facts.get(\"mandate_id\") == mandate.mandate_id" in source
