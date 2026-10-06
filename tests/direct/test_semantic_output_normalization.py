import ast
import json
from pathlib import Path

_CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "firewall.py"
_CONTRACT_TREE = ast.parse(_CONTRACT_PATH.read_text(encoding="utf-8"))
_RESOLVER_NODE = next(
    node for node in _CONTRACT_TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "_resolve_prompt_output"
)
_RESOLVER_MODULE = ast.fix_missing_locations(ast.Module(body=[_RESOLVER_NODE], type_ignores=[]))
_RESOLVER_NAMESPACE = {}
exec(compile(_RESOLVER_MODULE, str(_CONTRACT_PATH), "exec"), _RESOLVER_NAMESPACE)
_resolve_prompt_output = _RESOLVER_NAMESPACE["_resolve_prompt_output"]


def semantic_result():
    return {
        "intent_satisfied": True,
        "scope_expanded": False,
        "prohibited_effect_present": False,
        "economic_terms_consistent": True,
        "administrative_authority_changed": False,
        "implementation_behavior_consistent": True,
        "evidence_sufficient": True,
    }


class CalldataResponse:
    def __init__(self, calldata):
        self.calldata = calldata


class GetResponse:
    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value


def test_known_runtime_shapes_normalize_to_supported_payloads():
    valid = semantic_result()
    encoded = json.dumps(valid, separators=(",", ":"))
    accepted = [
        (valid, valid),
        (encoded, encoded),
        (encoded.encode("utf-8"), encoded),
        (CalldataResponse(valid), valid),
        (CalldataResponse(encoded), encoded),
        (GetResponse(valid), valid),
        (GetResponse(encoded), encoded),
    ]
    for response, expected in accepted:
        assert _resolve_prompt_output(response) == expected

    for response in (7, object(), list(valid.items()), None):
        assert _resolve_prompt_output(response) is None
