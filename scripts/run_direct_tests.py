"""Run GenLayer Direct Mode from the installed Python Scripts directory."""

from __future__ import annotations

import os
import subprocess
import sys
import sysconfig


def main() -> int:
    env = os.environ.copy()
    env.setdefault("GENVM_VERSION", "v0.6.0-rc2")
    runner = os.path.join(sysconfig.get_path("scripts"), "gltest.exe")
    result = subprocess.run([runner, "tests/direct", "-q"], env=env, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
