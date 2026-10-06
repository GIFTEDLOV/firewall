import json

import pytest
from web3 import Web3


def digest(byte: int) -> bytes:
    return bytes([byte]) * 32


def semantic(**overrides):
    result = {
        "intent_satisfied": True,
        "scope_expanded": False,
        "prohibited_effect_present": False,
        "economic_terms_consistent": True,
        "administrative_authority_changed": False,
        "implementation_behavior_consistent": True,
        "evidence_sufficient": True,
    }
    result.update(overrides)
    return json.dumps(result, separators=(",", ":"))


def mock_semantic(direct_vm, response):
    # wasi_mock parses one JSON layer; keep the inner response as text for the
    # GenVM response_format="json" decoder, which parses that text itself.
    direct_vm.mock_llm("FIREWALL_SEMANTIC_TASK_V1", json.dumps(response))


def permit_binding_hash(firewall, execution_id, adjudication_id, issued_at):
    mandate = firewall.get_mandates()[0]
    execution = next(item for item in firewall.get_executions() if item.execution_id == execution_id)
    adjudication = next(item for item in firewall.get_adjudications() if item.adjudication_id == adjudication_id)
    fields = [
        "FIREWALL_PERMIT_BINDING_V1",
        mandate.mandate_id, str(mandate.mandate_version), mandate.proposal_hash.hex(),
        execution.execution_id, execution.bundle_hash.hex(), str(execution.chain_id),
        execution.targets_digest.hex(), execution.values_digest.hex(), execution.calldata_digest.hex(),
        execution.target_code_hashes_digest.hex(), execution.implementation_hashes_digest.hex(),
        adjudication.adjudication_id, str(adjudication.generation), "FIREWALL_MANDATE_V1",
        str(issued_at), str(issued_at + 86400),
    ]
    return Web3.keccak(text=json.dumps(fields, separators=(",", ":")))


def create_and_commit(firewall):
    text = "Upgrade TreasuryVault to add batched withdrawals. No new administrator authority."
    mandate_id = firewall.create_mandate(
        61127, "0x" + "1" * 40, "proposal-1", digest(1),
        "https://governance.example/proposals/1", text, digest(2), len(text.encode()), 1, digest(3),
    )
    firewall.freeze_mandate(mandate_id, 100)
    execution_id = firewall.commit_execution(
        mandate_id, 61127, digest(4), digest(5), digest(6), digest(7), digest(8), digest(9), digest(10), digest(11),
        "CONTROLLED_FIXTURE_EXECUTION_A",
    )
    firewall.authenticate_evidence(execution_id, digest(11), digest(12), digest(13), digest(14), 32, "FIREWALL_EVIDENCE_V1", 105)
    return mandate_id, execution_id


def test_direct_mode_adjudication_is_consensus_selected_and_permit_is_deterministic(direct_vm, direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    mock_semantic(direct_vm, semantic())
    mandate_id, execution_id = create_and_commit(firewall)
    adjudication_id = firewall.adjudicate_execution(execution_id)
    assert adjudication_id == "ADJ-00000001"
    assert firewall.get_adjudications()[0].verdict == "EXECUTION_PERMITTED"
    with pytest.raises(Exception):
        firewall.issue_permit(execution_id, adjudication_id, 120, digest(13))
    permit_id = firewall.issue_permit(execution_id, adjudication_id, 120, permit_binding_hash(firewall, execution_id, adjudication_id, 120))
    assert permit_id == "PRM-00000001"
    permit = firewall.get_permits()[0]
    assert permit.status == "ACTIVE"
    assert permit.execution_id == execution_id
    assert permit.expires_at == 120 + 86400


def test_direct_mode_insufficient_evidence_is_inconclusive_and_cannot_issue_permit(direct_vm, direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    mock_semantic(direct_vm, semantic(evidence_sufficient=False))
    _, execution_id = create_and_commit(firewall)
    adjudication_id = firewall.adjudicate_execution(execution_id)
    assert firewall.get_adjudications()[0].verdict == "INCONCLUSIVE"
    with pytest.raises(Exception):
        firewall.issue_permit(execution_id, adjudication_id, 120, digest(13))


def test_direct_mode_caller_cannot_supply_semantic_vector_or_repeat_generation(direct_vm, direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    mock_semantic(direct_vm, semantic(scope_expanded=True))
    _, execution_id = create_and_commit(firewall)
    adjudication_id = firewall.adjudicate_execution(execution_id)
    assert firewall.get_adjudications()[0].verdict == "EXECUTION_BLOCKED"
    with pytest.raises(Exception):
        firewall.adjudicate_execution(execution_id)
    assert not hasattr(firewall, "record_adjudication")
    with pytest.raises(Exception):
        firewall.issue_permit(execution_id, adjudication_id, 120, digest(13))


def test_direct_mode_only_mandate_creator_can_freeze_and_owner_is_not_global(direct_vm, direct_deploy, direct_alice):
    firewall = direct_deploy("contracts/firewall.py")
    text = "A mandate"
    mandate_id = firewall.create_mandate(61127, "0x" + "1" * 40, "proposal-2", digest(21), "https://governance.example/2", text, digest(22), len(text), 1, digest(23))
    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        firewall.freeze_mandate(mandate_id, 1)


def test_direct_mode_rejects_extra_or_malformed_semantic_output(direct_vm, direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    _, execution_id = create_and_commit(firewall)
    valid = json.loads(semantic())
    invalid_outputs = [
        "not-json",
        "prefix " + semantic(),
        "```json\n" + semantic() + "\n```",
        json.dumps({**valid, "fake_permit": True}),
        json.dumps({key: value for key, value in valid.items() if key != "intent_satisfied"}),
        json.dumps({**valid, "intent_satisfied": "true"}),
        json.dumps({**valid, "intent_satisfied": 1}),
        json.dumps({**valid, "intent_satisfied": None}),
        json.dumps({**valid, "intent_satisfied": {"value": True}}),
    ]
    for invalid in invalid_outputs:
        mock_semantic(direct_vm, invalid)
        with pytest.raises(Exception):
            firewall.adjudicate_execution(execution_id)
    assert len(firewall.get_adjudications()) == 0


def test_direct_mode_rejects_early_permit_double_freeze_and_evidence_overwrite(direct_vm, direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    text = "A mandate"
    mandate_id = firewall.create_mandate(61127, "0x" + "1" * 40, "proposal-early", digest(31), "https://governance.example/early", text, digest(32), len(text), 1, digest(33))
    with pytest.raises(Exception):
        firewall.commit_execution(mandate_id, 61127, digest(34), digest(35), digest(36), digest(37), digest(38), digest(39), digest(40), digest(41), "early")
    firewall.freeze_mandate(mandate_id, 1)
    with pytest.raises(Exception):
        firewall.freeze_mandate(mandate_id, 2)
    execution_id = firewall.commit_execution(mandate_id, 61127, digest(34), digest(35), digest(36), digest(37), digest(38), digest(39), digest(40), digest(41), "committed")
    with pytest.raises(Exception):
        firewall.issue_permit(execution_id, "ADJ-00000001", 2, digest(45))
    firewall.authenticate_evidence(execution_id, digest(41), digest(42), digest(43), digest(44), 32, "FIREWALL_EVIDENCE_V1", 3)
    with pytest.raises(Exception):
        firewall.authenticate_evidence(execution_id, digest(41), digest(42), digest(43), digest(44), 32, "FIREWALL_EVIDENCE_V1", 4)
