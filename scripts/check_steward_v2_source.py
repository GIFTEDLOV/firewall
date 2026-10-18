"""Reviewer-specific source/parity gate for the deployed Firewall Studionet V2 contract."""
import ast
import hashlib
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "contracts" / "firewall.py"
EXPECTED_SHA256 = "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163"

def main():
    content = SOURCE.read_bytes()
    assert hashlib.sha256(content).hexdigest() == EXPECTED_SHA256, "Deployed Firewall V2 source parity mismatch"
    code = content.decode("utf-8")
    tree = ast.parse(code)
    assert "gl.nondet.web.get" in code, "Validator-side authenticated evidence fetching is absent"
    assert "strict_eq" in code, "Independent validator equality is absent"
    public = {n.name for cls in tree.body if isinstance(cls, ast.ClassDef) for n in cls.body if isinstance(n, ast.FunctionDef)}
    for name in ("authenticate_evidence", "adjudicate_execution", "issue_permit", "get_adjudications", "get_permits"):
        assert name in public, f"Missing deployed method: {name}"
    print("FIREWALL_V2_SOURCE_PARITY=PASS")
    print("FIREWALL_V2_VALIDATOR_FETCH_IMPLEMENTED=PASS")
    print("LIVE_GUARD_ENFORCEMENT=NOT_EVALUATED")

if __name__ == "__main__":
    main()
