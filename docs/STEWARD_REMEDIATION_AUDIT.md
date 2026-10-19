# Steward remediation acceptance audit

This is a local adversarial audit of the two critical findings. It does not
claim a public deployment or a trustless GenLayer-to-EVM bridge.

| Finding / attack | Root cause before remediation | Correction | Source | Test / evidence | Real chain or fixture | Remaining assumption / deployment |
| --- | --- | --- | --- | --- | --- | --- |
| Fabricated receipt, wrong chain, block reorg, stale block | A caller digest was called `AUTHENTICATED` | RPC verifier binds chain, block, tx, receipt, logs and freshness; disagreement fails closed | `packages/evidence/src/evm.ts` | `packages/evidence/src/evm.test.ts` | Controlled RPC fixtures; local EVM guard executes real calls | Production needs two genuinely independent configured RPC providers |
| Wrong calldata/value/target/code/proxy facts | Evidence schema carried labels but did not read the chain | Exact transaction payload and EIP-1967/code reads are checked at a common block; the generic guard rejects proxy authorizations it cannot verify in-contract | `packages/evidence/src/evm.ts`, `contracts/FirewallSafeGuard.sol` | payload/code/implementation mismatch tests | Controlled RPC fixtures | Proxy storage is independently read off-chain, but this initial guard requires a target-specific proxy verifier before proxy execution |
| Governor/Safe/manual provenance spoof | Adapter selection promoted imports | Normalize paths are unverified; only RPC-verified functions return authenticated provenance; manual remains unverified | `packages/governance-adapters/src/index.ts` | adapter verification tests | Controlled reader fixtures | Governor event/confirmation service must be wired for each production deployment |
| GenLayer semantic consensus over unverified description | Frozen V1 adjudicated stored caller records | Separate V2 candidate retrieves two source responses, validates expected facts, then runs bounded seven-field consensus | `contracts/firewall_v2_candidate.py` | candidate AST/direct source tests; existing V1 history preserved | Candidate not deployed; direct structural test only on this host | New GenLayer deployment required; source URLs must be independent chain gateways |
| Caller-controlled permit time / `now` | V1 accepted `issued_at` and `now` arguments | V2 derives permit time/status from GenLayer transaction time | `contracts/firewall_v2_candidate.py` | `tests/direct/test_firewall_v2_candidate.py` | Candidate source/direct structural test | Target-chain expiry is separately checked by the EVM guard |
| Frontend/backend permit claim | No execution gate existed | EIP-712 relay authorization is verified on-chain and keyed by Safe nonce + exact call | `contracts/FirewallSafeGuard.sol`, `packages/safe-enforcement/src/index.ts` | `scripts/test_safe_guard.mjs` | Real Ganache EVM deployment and transactions | Relay signer is trusted to authenticate canonical GenLayer state; not trustless |
| Modified calldata/value/target/chain/Safe | Permit existence was sufficient | Guard compares every runtime field and chain/Safe identity | `contracts/FirewallSafeGuard.sol` | local guard adversarial cases | Real local EVM | Safe owner signature mechanics are delegated to Safe itself |
| Expired/replayed/revoked/wrong adjudication | No on-chain consumption boundary | expiry uses `block.timestamp`, authorizations are consumed, revocation and generation/binding fields are signed | `contracts/FirewallSafeGuard.sol` | replay, binding, expiry/revocation paths | Real local EVM plus controlled signatures | Relayer key rotation/revocation is owner-controlled and must be governed |
| Guard removal / module / batch bypass | No guard existed | guard configuration changes and module hook fail closed; delegatecall rejected | `contracts/FirewallSafeGuard.sol` | guard removal, module bypass, delegatecall tests | Real local EVM harness | Safe versions lacking module hook require module disable/separate guard; this is documented |

## Source-to-test acceptance matrix

| Component | Acceptance property | Test command |
| --- | --- | --- |
| Evidence status | JSON/hash alone is `UNVERIFIED` | `pnpm --filter @firewall/evidence test` |
| EVM evidence | two-source chain/receipt/code verification and fail-closed attack cases | `pnpm --filter @firewall/evidence test` |
| Governance adapters | normalized imports do not claim auth; verified chain facts can promote | `pnpm --filter @firewall/governance-adapters test` |
| Safe authorization helper | EIP-712 type/key bindings are deterministic | `pnpm --filter @firewall/safe-enforcement typecheck` |
| Safe guard | valid exact call executes; attacks revert | `pnpm test:solidity` |
| V2 contract | independent source boundary and chain-derived time | `python -m pytest -q tests/direct/test_firewall_v2_candidate.py` |
| Existing V1 contract | frozen source and ABI remain byte-for-byte unchanged | `pnpm verify:invariants`, `pnpm schema:check` |
| Workflow | local/unverified evidence cannot prepare protected execution | `pnpm --filter @firewall/workflow test` |
| Browser/API | local scope and RPC verification status are explicit; unavailable sources do not enable execution | `pnpm test:browser`, `pnpm --filter @firewall/web build` |

## Steward verdict

Finding 1 is resolved for the new evidence/V2 path, but the frozen V1 address
cannot be retrofitted; deployment is required before it can be canonical.
Finding 2 is resolved for the tested Safe-compatible execution path in local
EVM execution. It is not a claim that every historical Safe version's module
path is guarded; versions without the module hook remain a deployment
blocking condition unless modules are disabled or separately guarded.
