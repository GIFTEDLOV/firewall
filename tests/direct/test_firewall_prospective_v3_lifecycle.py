from datetime import datetime, timezone

import pytest


def test_prospective_intent_is_frozen_and_uniquely_bound_before_authentication(direct_deploy):
    firewall = direct_deploy("contracts/firewall_v3_9_prospective.py")
    proposal_id = firewall.create_mandate("qualification-1", "Allow one exact zero-value test call from this controlled Safe. Do not alter owners, threshold, modules, or Guard.")
    assert proposal_id == "MAN3-00000001"
    firewall.freeze_mandate(proposal_id)
    assert firewall.get_mandates()[0].state == "MANDATE_FROZEN"
    now = int(datetime.now(timezone.utc).timestamp())
    args = (
        proposal_id, "0x" + "11" * 32, 11155111, "0x" + "22" * 20, 0,
        "0x" + "33" * 20, 0, "0x", 0, "0x" + "44" * 20,
        "0x" + "55" * 32, "0x" + "66" * 32, 10, now + 3600,
        now + 7200, "0x" + "77" * 32,
    )
    intent_record = firewall.commit_prospective_intent(*args)
    assert intent_record == "INT3-00000001"
    intent = firewall.get_intents()[0]
    assert intent.state == "INTENT_COMMITTED"
    assert intent.chain_id == 11155111
    assert intent.safe_nonce == 0
    assert intent.execution_deadline == now + 3600
    with pytest.raises(Exception):
        firewall.commit_prospective_intent(*args)
    with pytest.raises(Exception):
        firewall.commit_prospective_intent(proposal_id, "0x" + "12" * 32, 1, *args[3:])
