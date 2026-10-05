"""Run the installed genvm-linter AST safety checks from any shell PATH."""

from __future__ import annotations

import subprocess
import sys
import sysconfig
from pathlib import Path


def main() -> int:
    contract = sys.argv[1] if len(sys.argv) > 1 else "contracts/firewall.py"
    linter = Path(sysconfig.get_path("scripts")) / "genvm-lint.exe"
    result = subprocess.run([str(linter), "lint", contract, "--json"], check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
