"""Extract the current GenLayer runtime schema without a network write.

The installed genvm-linter 0.11.1rc2 cannot import the current v0.6 message
module without a VM stdin frame, while gltest Direct Mode provides that frame.
This uses the same installed current runtime and its authoritative get_schema
reflection, then writes the checked-in local artifact.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def inject_message(vm, loader) -> None:
    calldata = loader.import_calldata()
    address = loader.import_address()
    to_address = lambda value: value if not isinstance(value, bytes) else address(value)
    message = {
        "contract_address": to_address(vm._contract_address),
        "sender_address": to_address(vm.sender),
        "origin_address": to_address(vm.origin),
        "stack": [],
        "value": vm._value,
        "datetime": vm._datetime,
        "is_init": False,
        "chain_id": vm._chain_id,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    encoded = calldata.encode(message)
    read_fd, write_fd = os.pipe()
    os.write(write_fd, encoded)
    os.close(write_fd)
    vm._original_stdin_fd = os.dup(0)
    os.dup2(read_fd, 0)
    os.close(read_fd)


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_genlayer_schema.py CONTRACT OUTPUT")
    contract_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()

    from gltest.direct import loader, sdk_loader
    from gltest.direct.vm import VMContext

    sdk_loader.setup_sdk_paths(contract_path, "v0.6.0-rc2")
    vm = VMContext()
    vm.sender = b"\x22" * 20
    vm._contract_address = b"\x11" * 20
    loader._patch_get_type_hints_for_pep695()
    inject_message(vm, loader)
    module = loader._load_module(contract_path)
    contract = loader._find_contract_class(module)
    from genlayer._internal.get_schema import get_schema

    schema = get_schema(contract)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "contract": str(contract_path), "output": str(output_path), "methods": sorted(schema["methods"]) }))
    vm._cleanup_after_deactivate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
