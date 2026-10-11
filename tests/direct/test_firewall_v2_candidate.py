import ast
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[2] / "contracts" / "firewall_v2_candidate.py"


def test_v2_candidate_is_separate_and_source_grounded():
    source = SOURCE.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(SOURCE))
    assert any(isinstance(node, ast.ClassDef) and node.name == "FirewallV2" for node in tree.body)
    assert "gl.nondet.web.get" in source
    assert "gl.vm.run_nondet_unsafe" in source
    assert "trusted_source_a" in source and "trusted_source_b" in source
    assert "INDEPENDENT_EVIDENCE_UNAVAILABLE_OR_MISMATCH" in source
    assert "def authenticate_evidence(self, execution_id: str)" in source
    assert "datetime.now(timezone.utc)" in source
    assert "def get_permit_status(self, permit_id: str)" in source


def test_v2_does_not_use_caller_supplied_permit_time_or_receipt():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
    issue = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "issue_permit")
    assert [arg.arg for arg in issue.args.args] == ["self", "execution_id", "adjudication_id"]
    auth = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "authenticate_evidence")
    assert [arg.arg for arg in auth.args.args] == ["self", "execution_id"]
