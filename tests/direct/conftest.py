"""Windows-safe Direct Mode bootstrap.

genlayer-test 0.30.0rc2 uses a named temporary file for fd 0 and unlinks it
while the duplicated descriptor is still open. Windows correctly rejects that
unlink. The pipe implementation below preserves the same message injection
semantics and lets the test VM restore fd 0 during teardown.
"""

import os
import importlib

from gltest.direct import loader


def _import_calldata_compat():
    try:
        from genlayer import calldata
        return calldata
    except ImportError:
        return importlib.import_module("genlayer.py.calldata")


def _import_address_compat():
    try:
        from genlayer import types as sdk_types
        return sdk_types.Address
    except ImportError:
        from genlayer import Address
        return Address


def _import_lazy_compat():
    try:
        from genlayer import types as sdk_types
        return sdk_types.Lazy
    except ImportError:
        from genlayer.py.types import Lazy
        return Lazy


# genlayer-test's current Direct Mode helper targets the v0.3
# ``genlayer.calldata`` layout. The pinned v0.6 runtime used by the deployed
# V2 contract exposes the equivalent module at ``genlayer.py.calldata``.
loader.import_calldata = _import_calldata_compat
loader.import_address = _import_address_compat
loader.import_lazy = _import_lazy_compat
_allocate_contract_v03 = loader._allocate_contract

def _allocate_contract_compat(contract_cls, vm, *args, **kwargs):
    try:
        generate = importlib.import_module("genlayer.py.storage._internal.generate")
        core = importlib.import_module("genlayer.py.storage._internal.core")
        td = generate._storage_build(contract_cls, {})
        instance = td.get(vm._storage.get_store_slot(core.ROOT_SLOT_ID), 0)
        init = getattr(td, "cls", None)
        init = getattr(init, "__init__", None) if init is not None else getattr(contract_cls, "__init__", None)
        if init is not None:
            if hasattr(init, generate.ORIGINAL_INIT_ATTR):
                init = getattr(init, generate.ORIGINAL_INIT_ATTR)
            init(instance, *args, **kwargs)
        return loader._make_contract_proxy(instance)
    except ImportError:
        return _allocate_contract_v03(contract_cls, vm, *args, **kwargs)


loader._allocate_contract = _allocate_contract_compat


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
