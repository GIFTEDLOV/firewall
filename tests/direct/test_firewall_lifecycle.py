import pytest


def digest(byte: int) -> bytes:
    return bytes([byte]) * 32


def test_direct_mode_freeze_commit_adjudicate_and_permit(direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")

    assert firewall.get_semantic_schema() == "FIREWALL_MANDATE_V1"
    mandate_id = firewall.create_mandate(61127, digest(1), digest(2), 1, digest(3))
    assert mandate_id == "MAN-00000001"
    firewall.freeze_mandate(mandate_id, 100)
    assert firewall.get_mandates()[0].state == "MANDATE_FROZEN"

    execution_id = firewall.commit_execution(mandate_id, 1, digest(4), digest(5), digest(6), digest(7))
    firewall.authenticate_evidence(execution_id, digest(8))
    adjudication_id = firewall.record_adjudication(execution_id, 1, True, False, False, True, False, True, True, 110)
    assert adjudication_id == "ADJ-00000001"
    assert firewall.get_adjudications()[0].verdict == "EXECUTION_PERMITTED"

    permit_id = firewall.issue_permit(execution_id, adjudication_id, 1, digest(1), digest(5), digest(6), digest(7), 120, 220, digest(9))
    assert permit_id == "PRM-00000001"
    permit = firewall.get_permits()[0]
    assert permit.status == "ACTIVE"
    assert permit.execution_id == execution_id


def test_direct_mode_evidence_insufficient_is_inconclusive(direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    mandate_id = firewall.create_mandate(61127, digest(1), digest(2), 1, digest(3))
    firewall.freeze_mandate(mandate_id, 100)
    execution_id = firewall.commit_execution(mandate_id, 1, digest(4), digest(5), digest(6), digest(7))
    firewall.authenticate_evidence(execution_id, digest(8))
    adjudication_id = firewall.record_adjudication(execution_id, 1, True, False, False, True, False, True, False, 110)
    assert firewall.get_adjudications()[0].verdict == "INCONCLUSIVE"
    with pytest.raises(Exception):
        firewall.issue_permit(execution_id, adjudication_id, 1, digest(1), digest(5), digest(6), digest(7), 120, 220, digest(9))


def test_direct_mode_generation_is_monotonic(direct_deploy):
    firewall = direct_deploy("contracts/firewall.py")
    mandate_id = firewall.create_mandate(61127, digest(1), digest(2), 1, digest(3))
    firewall.freeze_mandate(mandate_id, 100)
    execution_id = firewall.commit_execution(mandate_id, 1, digest(4), digest(5), digest(6), digest(7))
    firewall.authenticate_evidence(execution_id, digest(8))
    firewall.record_adjudication(execution_id, 1, True, False, False, True, False, True, True, 110)
    with pytest.raises(Exception):
        firewall.record_adjudication(execution_id, 1, True, False, False, True, False, True, True, 111)
