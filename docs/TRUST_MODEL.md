# Trust model

Firewall has two authorities:

1. deterministic contract logic owns identities, binding, lifecycle,
   prerequisites, replay protection, policy derivation, permit expiry, and
   public canonical state;
2. GenLayer consensus owns only the irreducibly semantic comparison between a
   frozen mandate and authenticated execution evidence.

The semantic contract is `FIREWALL_MANDATE_V1` and contains exactly seven
booleans. It has no confidence, prose, risk score, addresses, amounts,
recommendations, or verdict field. The contract derives the verdict. A backend,
wallet, deployer, creator, or frontend cannot force it.

Proposal text, ABI labels, source comments, code metadata, and execution data
are delimited untrusted data. Embedded instructions cannot modify the task,
schema, authority, identifiers, or policy. Malformed semantic output reverts;
off-chain parsers also fail closed.

## Steward remediation boundary

The deployed V1 contract is historical and remains unchanged. Its
`authenticate_evidence` method records caller-supplied digests; that is a
commitment, not independent blockchain authentication. The application no
longer labels such records authenticated.

The V2 candidate in `contracts/firewall_v2_candidate.py` is separate and is
not deployed. It uses GenLayer's source-grounded nondeterministic boundary to
retrieve two distinct evidence sources, verifies chain/package fields before
semantic adjudication, rejects missing or conflicting evidence, and derives
permit time from the GenLayer transaction timestamp. A new GenLayer deployment
is required before V2 can replace the frozen V1 canonical address.

Independent EVM evidence is implemented off-chain in
`packages/evidence/src/evm.ts`. It reads chain ID, block context, transaction,
receipt, logs, bytecode, EIP-1967 slots, implementation code, and finality
assumptions from one or two configured RPC sources. Conflicts, stale contexts,
reorg signals, unavailable sources, failed receipts, and payload mismatches do
not become verified evidence.

Execution authority is a separate EVM boundary. `contracts/FirewallSafeGuard.sol`
implements the Safe guard pre-execution check and signed relay registration.
The EIP-712 attestation binds the target chain, Safe, nonce, exact target,
native value, calldata hash, operation, ordered bundle digests, code/proxy
facts, canonical permit hash, adjudication generation, expiry, and replay
state. The relay signer is an explicit trust assumption, not a trustless
GenLayer-to-EVM proof; it must authenticate canonical GenLayer state before
registering an authorization. Module execution and guard configuration
changes fail closed, and delegatecall is rejected by this initial integration.
Proxy authorizations are also rejected by the generic guard because EIP-1967
storage cannot be read from another contract in Solidity; a target-specific
proxy verifier is required before proxy execution is enabled.
