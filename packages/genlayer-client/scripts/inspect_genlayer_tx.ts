import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const hash = process.argv[2];
if (!hash || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("TRANSACTION_HASH_REQUIRED");
const client = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api" });
const transaction = await client.getTransaction({ hash: hash as `0x${string}` });
const replacer = (_key: string, value: unknown) => typeof value === "bigint" ? value.toString() : value;
const raw = transaction as unknown as Record<string, unknown>;
const consensus = raw.consensus_data as Record<string, unknown> | undefined;
const validators = Array.isArray(consensus?.validators) ? consensus.validators as Record<string, unknown>[] : [];
const lastRound = raw.last_round as Record<string, unknown> | undefined;
const leaders = Array.isArray(consensus?.leader_receipt) ? consensus.leader_receipt as Record<string, unknown>[] : [];
console.log(JSON.stringify({
  hash: raw.hash, from: raw.from_address, to: raw.to_address, nonce: raw.nonce,
  status: transaction.statusName, result: raw.result, resultName: transaction.resultName,
  execution: transaction.txExecutionResultName, rawExecution: raw.tx_execution_result,
  recipient: transaction.recipient,
  validatorVotes: consensus?.votes,
  validators: validators.map((value) => {
    const err = value.genvm_result && typeof value.genvm_result === "object" ? value.genvm_result as Record<string, unknown> : {};
    return { address: (value.node_config as Record<string, unknown> | undefined)?.address, vote: value.vote, execution: value.execution_result, genvmErrorCode: err.error_code, stderr: err.stderr };
  }),
  leaders: leaders.map((value) => ({ mode: value.mode, execution: value.execution_result, result: value.result, genvmResult: value.genvm_result })),
  lastRound: lastRound ? { round: lastRound.round, votesCommitted: lastRound.votes_committed, votesRevealed: lastRound.votes_revealed, votes: lastRound.validator_votes, votesName: lastRound.validator_votes_name, roundValidators: lastRound.round_validators } : null,
  resultPayload: raw.result,
  transactionData: raw.data && typeof raw.data === "object" ? Object.fromEntries(Object.entries(raw.data as Record<string, unknown>).filter(([key]) => key !== "contract_code")) : null,
}, replacer, 2));
