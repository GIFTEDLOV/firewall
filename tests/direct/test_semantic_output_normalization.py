import ast
from pathlib import Path


_CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "firewall.py"
_CONTRACT_TREE = ast.parse(_CONTRACT_PATH.read_text(encoding="utf-8"))
_VECTOR_NODE = next(
    node for node in _CONTRACT_TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "_exact_vector"
)
_VECTOR_MODULE = ast.fix_missing_locations(ast.Module(body=[_VECTOR_NODE], type_ignores=[]))
_VECTOR_NAMESPACE = {
    "SEMANTIC_KEYS": (
        "intent_satisfied", "scope_expanded", "prohibited_effect_present",
        "economic_terms_consistent", "administrative_authority_changed",
        "implementation_behavior_consistent", "evidence_sufficient",
    ),
}
exec(compile(_VECTOR_MODULE, str(_CONTRACT_PATH), "exec"), _VECTOR_NAMESPACE)
_exact_vector = _VECTOR_NAMESPACE["_exact_vector"]


def valid_vector():
    return {
        "intent_satisfied": True,
        "scope_expanded": False,
        "prohibited_effect_present": False,
        "economic_terms_consistent": True,
        "administrative_authority_changed": False,
        "implementation_behavior_consistent": True,
        "evidence_sufficient": True,
    }


def test_v2_accepts_only_the_exact_boolean_semantic_vector():
    valid = valid_vector()
    assert _exact_vector(valid) == valid

    for malformed in (
        {key: value for key, value in valid.items() if key != "evidence_sufficient"},
        {**valid, "unexpected": False},
        {**valid, "intent_satisfied": "true"},
        {**valid, "intent_satisfied": 1},
        list(valid.items()),
        None,
    ):
        assert _exact_vector(malformed) is None
