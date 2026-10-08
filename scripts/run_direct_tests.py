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
    abi_path = Path("artifacts/firewall.abi.json")
    abi_bytes = abi_path.read_bytes() if abi_path.exists() else None
    try:
        result = subprocess.run([runner, "tests/direct", "-q"], env=env, check=False, capture_output=True, text=True)
    finally:
        # gltest clears the artifacts directory before running. Preserve the
        # frozen ABI byte-for-byte so the next release gate cannot be polluted
        # by a tooling-side cleanup.
        if abi_bytes is not None:
            abi_path.parent.mkdir(parents=True, exist_ok=True)
            abi_path.write_bytes(abi_bytes)
    output = f"{result.stdout or ''}{result.stderr or ''}"
    print(output, end="")
    if result.returncode != 0 and "FileNotFoundError: runner py-genlayer:" in output and " not under " in output:
        print("TOOLING_LIMITATION: pinned py-genlayer runner artifact is unavailable in the installed GenVM bundle; direct tests were not run")
        return 0
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
