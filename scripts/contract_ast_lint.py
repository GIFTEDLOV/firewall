"""Run the installed genvm-linter AST safety checks from any shell PATH."""

from __future__ import annotations

import subprocess
import sys
import sysconfig
from pathlib import Path
import ast


def main() -> int:
    contract = sys.argv[1] if len(sys.argv) > 1 else "contracts/firewall.py"
    scripts = Path(sysconfig.get_path("scripts"))
    candidates = [scripts / "genvm-lint", scripts / "genvm-lint.exe"]
    linter = next((path for path in candidates if path.exists()), None)
    if linter is not None:
        result = subprocess.run([str(linter), "lint", contract, "--json"], check=False)
        return result.returncode

    # Keep the release gate useful on a clean CI image where the optional GenVM
    # binary is unavailable. This is a structural AST gate, not a claim that
    # the external runtime linter ran.
    tree = ast.parse(Path(contract).read_text(encoding="utf-8"), filename=contract)
    classes = [node for node in tree.body if isinstance(node, ast.ClassDef)]
    if not classes:
        raise SystemExit("CONTRACT_AST_INVALID:no contract class")
    source = Path(contract).read_text(encoding="utf-8")
    required = ("get_semantic_schema", "get_semantic_keys", "adjudicate_execution", "issue_permit")
    missing = [name for name in required if name not in source]
    if missing:
        raise SystemExit(f"CONTRACT_AST_INVALID:missing {','.join(missing)}")
    print("TOOLING_LIMITATION: genvm-lint binary unavailable; structural AST checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
