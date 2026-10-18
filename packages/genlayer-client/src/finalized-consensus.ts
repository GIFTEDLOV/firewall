type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as ObjectValue : null;
}

function count(values: readonly unknown[], expected: string): number {
  return values.filter((value) => value === expected).length;
}

export type FinalizedConsensusProof = {
  readonly valid: boolean;
  readonly status: string | null;
  readonly result: string | null;
  readonly agreedVotes: number;
  readonly idleVotes: number;
  readonly revealedVotes: number;
  readonly validatorSuccessfulExecutions: number;
  readonly quorumCancelledExecutions: number;
  readonly leaderReturned: boolean;
  readonly reason: string;
};

/**
 * Accept a finalized successful GenLayer operation only when its stored vote
 * quorum and successful leader return agree. Validators stopped after that
 * quorum may be recorded as ERROR/IDLE; that is only accepted with GenLayer's
 * explicit CONSENSUS_VALIDATOR_QUORUM_REACHED cancellation marker.
 */
export function verifyFinalizedConsensus(transaction: unknown): FinalizedConsensusProof {
  const raw = object(transaction);
  const consensus = object(raw?.consensus_data);
  const votes = object(consensus?.votes);
  const validators = Array.isArray(consensus?.validators) ? consensus.validators.map(object).filter((value): value is ObjectValue => value !== null) : [];
  const lastRound = object(raw?.last_round) ?? object(raw?.lastRound);
  const roundNames = Array.isArray(lastRound?.validator_votes_name) ? lastRound.validator_votes_name : [];
  const roundValidators = Array.isArray(lastRound?.round_validators) ? lastRound.round_validators : [];
  const voteValues = votes ? Object.values(votes) : [];
  const agreedVotes = count(voteValues, "agree");
  const idleVotes = count(voteValues, "idle");
  const revealedVotes = voteValues.length;
  const validatorsSuccessful = validators.filter((validator) => validator.vote === "agree" && validator.execution_result === "SUCCESS").length;
  const quorumCancelledExecutions = validators.filter((validator) => {
    const result = object(validator.genvm_result);
    return validator.vote === "idle"
      && validator.execution_result === "ERROR"
      && result?.error_code === "CONSENSUS_VALIDATOR_QUORUM_REACHED"
      && result.stderr === "Validator execution cancelled after quorum";
  }).length;
  const unclassifiedValidatorFailures = validators.filter((validator) =>
    validator.execution_result !== "SUCCESS"
    && !(validator.vote === "idle"
      && validator.execution_result === "ERROR"
      && object(validator.genvm_result)?.error_code === "CONSENSUS_VALIDATOR_QUORUM_REACHED"
      && object(validator.genvm_result)?.stderr === "Validator execution cancelled after quorum")
  ).length;
  const leaders = Array.isArray(consensus?.leader_receipt) ? consensus.leader_receipt.map(object).filter((value): value is ObjectValue => value !== null) : [];
  const leaderReturned = leaders.some((leader) => {
    const result = object(leader.result);
    return leader.mode === "leader" && leader.execution_result === "SUCCESS" && (result?.status === "return" || leader.result === "return");
  });
  const resultValue = raw?.result_name ?? raw?.resultName ?? raw?.result;
  const result = resultValue === 6 ? "MAJORITY_AGREE" : typeof resultValue === "string" ? resultValue : null;
  const statusValue = raw?.statusName ?? raw?.status_name ?? raw?.status;
  const status = typeof statusValue === "string" ? statusValue.toUpperCase() : null;
  const committed = Number(lastRound?.votes_committed);
  const revealed = Number(lastRound?.votes_revealed);
  const roundAgrees = count(roundNames, "AGREE");
  const roundIdles = count(roundNames, "IDLE");
  const totalRounds = roundValidators.length;
  const roundMatchesStoredVotes = roundNames.length === totalRounds
    && roundAgrees === agreedVotes && roundIdles === idleVotes
    && committed === totalRounds && revealed === totalRounds;
  let reason = "FINALIZED_MAJORITY_SUCCESS";
  if (status !== "FINALIZED") reason = "TRANSACTION_NOT_FINALIZED";
  else if (result !== "MAJORITY_AGREE") reason = "CONSENSUS_NOT_MAJORITY_AGREE";
  else if (!roundMatchesStoredVotes || revealedVotes !== totalRounds) reason = "FINAL_VOTE_RECORDS_INCOMPLETE_OR_INCONSISTENT";
  else if (agreedVotes <= revealedVotes / 2) reason = "NO_REVEALED_MAJORITY";
  else if (!leaderReturned) reason = "LEADER_EXECUTION_DID_NOT_RETURN_SUCCESS";
  else if (validatorsSuccessful < 2) reason = "TOO_FEW_SUCCESSFUL_VALIDATOR_EXECUTIONS";
  else if (unclassifiedValidatorFailures !== 0) reason = "UNCLASSIFIED_VALIDATOR_EXECUTION_FAILURE";
  return {
    valid: reason === "FINALIZED_MAJORITY_SUCCESS", status, result, agreedVotes, idleVotes, revealedVotes,
    validatorSuccessfulExecutions: validatorsSuccessful, quorumCancelledExecutions,
    leaderReturned, reason,
  };
}
