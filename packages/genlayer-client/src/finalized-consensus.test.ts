import { describe, expect, it } from "vitest";
import { verifyFinalizedConsensus } from "./finalized-consensus.js";

function finalizedQuorum() {
  const agreed = ["0x1", "0x2", "0x3"];
  const idle = ["0x4", "0x5"];
  return {
    statusName: "FINALIZED",
    result: 6,
    consensus_data: {
      votes: Object.fromEntries([...agreed.map((address) => [address, "agree"]), ...idle.map((address) => [address, "idle"])]),
      leader_receipt: [{ mode: "leader", execution_result: "SUCCESS", result: { status: "return" } }],
      validators: [
        { vote: "agree", execution_result: "SUCCESS" },
        { vote: "agree", execution_result: "SUCCESS" },
        { vote: "idle", execution_result: "ERROR", genvm_result: { error_code: "CONSENSUS_VALIDATOR_QUORUM_REACHED", stderr: "Validator execution cancelled after quorum" } },
        { vote: "idle", execution_result: "ERROR", genvm_result: { error_code: "CONSENSUS_VALIDATOR_QUORUM_REACHED", stderr: "Validator execution cancelled after quorum" } },
      ],
    },
    last_round: {
      votes_committed: "5", votes_revealed: "5", round_validators: ["0x1", "0x2", "0x3", "0x4", "0x5"],
      validator_votes_name: ["AGREE", "AGREE", "AGREE", "IDLE", "IDLE"],
    },
  };
}

describe("finalized GenLayer quorum qualification", () => {
  it("accepts a finalized majority with successful execution and explicit quorum cancellations", () => {
    expect(verifyFinalizedConsensus(finalizedQuorum())).toMatchObject({ valid: true, agreedVotes: 3, idleVotes: 2, validatorSuccessfulExecutions: 2, quorumCancelledExecutions: 2, leaderReturned: true });
  });

  it("does not treat an execution error as successful consensus", () => {
    const failed = finalizedQuorum();
    failed.consensus_data.leader_receipt[0]!.execution_result = "ERROR";
    expect(verifyFinalizedConsensus(failed)).toMatchObject({ valid: false, reason: "LEADER_EXECUTION_DID_NOT_RETURN_SUCCESS" });
  });

  it("rejects a non-quorum validator failure even if a vote majority is present", () => {
    const failed = finalizedQuorum();
    failed.consensus_data.validators[2]!.genvm_result = { error_code: "RUNTIME_ERROR", stderr: "contract failed" };
    expect(verifyFinalizedConsensus(failed)).toMatchObject({ valid: false, reason: "UNCLASSIFIED_VALIDATOR_EXECUTION_FAILURE" });
  });

  it("rejects partial or contradictory vote records", () => {
    const failed = finalizedQuorum();
    failed.consensus_data.votes["0x3"] = "disagree";
    expect(verifyFinalizedConsensus(failed)).toMatchObject({ valid: false, reason: "FINAL_VOTE_RECORDS_INCOMPLETE_OR_INCONSISTENT" });
  });

  it("does not accept accepted-but-not-final transactions", () => {
    const pending = finalizedQuorum();
    pending.statusName = "ACCEPTED";
    expect(verifyFinalizedConsensus(pending)).toMatchObject({ valid: false, reason: "TRANSACTION_NOT_FINALIZED" });
  });
});
