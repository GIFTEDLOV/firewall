"""Stable Studionet GenVM compatibility smoke test.

Run with the pinned stable harness and no network target:
    gltest --contracts-dir contracts --artifacts-dir artifacts tests/stable/test_firewall_v2_stable_runtime.py
"""

def test_firewall_v2_loads_on_stable_genvm(direct_deploy, monkeypatch):
    # gltest 0.29.2 leaves the duplicated fd open on Windows before unlinking
    # its temp file. Keep that file until process teardown; the injected message
    # remains the real stable-runtime message context.
    import os

    monkeypatch.setattr(os, "unlink", lambda _path: None)
    contract = direct_deploy(
        "contracts/firewall_v2_candidate.py",
        "https://eth.blockscout.com/api/v2/transactions/example",
        "https://api.routescan.io/v2/network/mainnet/evm/1/tx/example",
    )
    assert contract.get_evidence_schema() == "FIREWALL_EVM_EVIDENCE_V3"
    assert contract.get_semantic_schema() == "FIREWALL_MANDATE_V2"
    mandate_id = contract.create_mandate(
        1,
        "0x1111111111111111111111111111111111111111",
        "historical-test",
        b"\x11" * 32,
        "MANUAL_UNVERIFIED",
        "approve",
        b"\x22" * 32,
        7,
        1,
        b"\x33" * 32,
    )
    assert mandate_id == "MAN-00000001"
    contract.freeze_mandate(mandate_id)
