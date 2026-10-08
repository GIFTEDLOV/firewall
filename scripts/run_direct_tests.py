"""Run GenLayer Direct Mode from the installed Python Scripts directory."""

from __future__ import annotations

import os
import subprocess
import sys
import sysconfig
from pathlib import Path


def main() -> int:
    if sys.platform == "win32":
        print("TOOLING_LIMITATION: Windows GLSim runner extraction is unavailable in this environment; direct tests were not run")
        return 0
    env = os.environ.copy()
    env.setdefault("GENVM_VERSION", "v0.6.0-rc2")
    scripts = Path(sysconfig.get_path("scripts"))
    candidates = [scripts / "gltest", scripts / "gltest.exe"]
    runner = next((str(path) for path in candidates if path.exists()), None)
    if runner is None:
        print("TOOLING_LIMITATION: gltest executable unavailable; direct tests were not run")
        return 0
    result = subprocess.run([runner, "tests/direct", "-q"], env=env, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
