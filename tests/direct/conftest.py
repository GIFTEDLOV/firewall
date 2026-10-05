"""Windows-safe Direct Mode bootstrap.

genlayer-test 0.30.0rc2 uses a named temporary file for fd 0 and unlinks it
while the duplicated descriptor is still open. Windows correctly rejects that
unlink. The pipe implementation below preserves the same message injection
semantics and lets the test VM restore fd 0 during teardown.
"""

import os

from gltest.direct import loader


def _inject_message_via_pipe(vm) -> None:
    calldata = loader.import_calldata()
    Address = loader.import_address()

    sender_addr = vm.sender if not isinstance(vm.sender, bytes) else Address(vm.sender)
    contract_addr = vm._contract_address if not isinstance(vm._contract_address, bytes) else Address(vm._contract_address)
    origin_addr = vm.origin if not isinstance(vm.origin, bytes) else Address(vm.origin)
    message_data = {
        "contract_address": contract_addr,
        "sender_address": sender_addr,
        "origin_address": origin_addr,
        "stack": [],
        "value": vm._value,
        "datetime": vm._datetime,
        "is_init": False,
        "chain_id": vm._chain_id,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    encoded = calldata.encode(message_data)
    read_fd, write_fd = os.pipe()
    os.write(write_fd, encoded)
    os.close(write_fd)
    vm._original_stdin_fd = os.dup(0)
    os.dup2(read_fd, 0)
    os.close(read_fd)


loader._inject_message_to_fd0 = _inject_message_via_pipe
