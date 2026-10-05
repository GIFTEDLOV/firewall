"""Start GLSim with the Windows-safe GenLayer Direct stdin bootstrap."""

from __future__ import annotations

import os
from dataclasses import is_dataclass

from gltest.direct import loader


def _inject_message_via_pipe(vm) -> None:
    calldata = loader.import_calldata()
    address_type = loader.import_address()
    sender = vm.sender if not isinstance(vm.sender, bytes) else address_type(vm.sender)
    contract = vm._contract_address if not isinstance(vm._contract_address, bytes) else address_type(vm._contract_address)
    origin = vm.origin if not isinstance(vm.origin, bytes) else address_type(vm.origin)
    message_data = {
        "contract_address": contract,
        "sender_address": sender,
        "origin_address": origin,
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

import glsim.server as _server  # noqa: E402
import glsim.engine as _engine  # noqa: E402
import glsim.tx_decoder as _tx_decoder  # noqa: E402


_raw_decode_calldata_bytes = _tx_decoder.decode_calldata_bytes


def _decode_calldata_bytes_compat(raw):
    decoded = _raw_decode_calldata_bytes(raw)
    decoded = _normalize_calldata_value(decoded)
    # genlayer-py 0.19.0rc2 encodes the method under the empty-string key;
    # current GLSim call dispatch expects the normalized ``method`` key.
    if isinstance(decoded, dict) and "method" not in decoded and "" in decoded:
        decoded = dict(decoded)
        decoded["method"] = decoded.pop("")
    return decoded


def _normalize_calldata_value(value):
    """Bridge genlayer-py's memoryview bytes to GLSim's bytes contract."""
    if isinstance(value, memoryview):
        return value.tobytes()
    if isinstance(value, dict):
        return {key: _normalize_calldata_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_calldata_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_normalize_calldata_value(item) for item in value)
    return value


_tx_decoder.decode_calldata_bytes = _decode_calldata_bytes_compat
_server.decode_calldata_bytes = _decode_calldata_bytes_compat
_engine.decode_calldata_bytes = _decode_calldata_bytes_compat

_raw_decode_genlayer_payload = _tx_decoder.decode_genlayer_payload


def _decode_genlayer_payload_compat(raw):
    payload = _raw_decode_genlayer_payload(raw)
    decoded_tx_data = payload.get("decoded_tx_data") or {}
    call_data = decoded_tx_data.get("call_data")
    call_data = _normalize_calldata_value(call_data)
    if isinstance(call_data, dict) and "method" not in call_data and "" in call_data:
        call_data = dict(call_data)
        call_data["method"] = call_data.pop("")
    if call_data is not None:
        decoded_tx_data = dict(decoded_tx_data)
        decoded_tx_data["call_data"] = call_data
        payload = dict(payload)
        payload["decoded_tx_data"] = decoded_tx_data
    return payload


_tx_decoder.decode_genlayer_payload = _decode_genlayer_payload_compat
_server.decode_genlayer_payload = _decode_genlayer_payload_compat

_raw_call_method = _engine.SimEngine.call_method


def _call_method_compat(self, contract_address, method_name, args=None, kwargs=None, sender=None):
    return _raw_call_method(
        self,
        contract_address,
        method_name,
        _normalize_calldata_value(args),
        _normalize_calldata_value(kwargs),
        sender,
    )


_engine.SimEngine.call_method = _call_method_compat


def _json_ready(value):
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if is_dataclass(value):
        return {key: _json_ready(getattr(value, key)) for key in value.__dataclass_fields__}
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_ready(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    try:
        return [_json_ready(item) for item in value]
    except TypeError:
        return str(value)


_raw_sim_read = _server._rpc_sim_read


def _rpc_sim_read_json(state, engine, params):
    result = _raw_sim_read(state, engine, params)
    return {"result": _json_ready(result["result"])}


_server.RPC_METHODS["sim_read"] = _rpc_sim_read_json

from glsim.__main__ import main  # noqa: E402


if __name__ == "__main__":
    main()
