import ast
from pathlib import Path


CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "firewall.py"
SOURCE = CONTRACT_PATH.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE, filename=str(CONTRACT_PATH))
CONTRACT = next(
    node for node in TREE.body
    if isinstance(node, ast.ClassDef) and node.name == "FirewallV2"
)


def method(name):
    return next(
        node for node in CONTRACT.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    )


def arguments(name):
    return [arg.arg for arg in method(name).args.args]


def test_v2_lifecycle_does_not_accept_caller_authenticated_evidence():
    assert arguments("commit_execution") == ["self", "mandate_id", "chain_id", "expected_facts"]
    assert arguments("authenticate_evidence") == ["self", "execution_id"]
    assert arguments("adjudicate_execution") == ["self", "execution_id"]
    assert arguments("issue_permit") == ["self", "execution_id", "adjudication_id"]

    commit = ast.unparse(method("commit_execution"))
    assert "mandate.governance_chain_id" in commit
    assert "receipt_status" in commit and "SUCCESS" in commit
    assert "execution_outcome" in commit and "SAFE_EXECUTION_SUCCESS" in commit
    assert "finality" in commit and "HISTORICAL" in commit


def test_v2_authentication_fetches_and_compares_independent_sources_in_consensus():
    authenticate = ast.unparse(method("authenticate_evidence"))
    assert "gl.nondet.web.get(url)" in authenticate
    assert "gl.eq_principle.strict_eq(fetch_authenticated)" in authenticate
    assert "first != second" in SOURCE
    assert "INDEPENDENT_EVIDENCE_UNAVAILABLE_OR_MISMATCH" in authenticate


def test_v2_validator_independently_evaluates_semantics_and_permit_requires_success():
    adjudicate = ast.unparse(method("adjudicate_execution"))
    permit = ast.unparse(method("issue_permit"))
    assert "gl.vm.run_nondet_unsafe(leader_fn, validator_fn)" in adjudicate
    assert "independent = self._semantic(prompt)" in adjudicate
    assert "proposed == independent" in adjudicate
    assert "adjudication.verdict" in permit and "EXECUTION_PERMITTED" in permit
    assert "execution.expected_facts" in permit
    assert "execution.evidence_json" in permit
