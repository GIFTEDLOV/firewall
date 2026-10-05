# Firewall threat model

Gate 1 records the following threats as release-gate inputs. Each must have a fixture or explicit integration test before a production release:

- altered proposal text after vote;
- substituted proposal/source URL;
- calldata, target, value, or ordering mutation;
- hidden native/ERC-20 transfer;
- proxy implementation replacement or stale code hash;
- ABI spoofing, unverified selectors, and unknown runtime behavior;
- introduced admin, ownership, mint, or treasury authority;
- replayed adjudication, generation, or permit;
- stale/expired permit;
- prompt injection in proposal, evidence, code metadata, or ABI labels;
- malformed model output or extra JSON keys;
- validator disagreement;
- unavailable or mismatched evidence;
- backend compromise or frontend omission;
- interrupted transaction lifecycle, wrong-chain wallet, duplicate submission, and concurrent writers.

## Required controls

Content is identified by hashes and byte lengths, not URLs. Execution packages include ordered calls, values, calldata, code hashes, and implementation hashes. Unknown facts are explicit and reduce evidence sufficiency. The semantic schema is strict and rejects extra keys. The policy engine is deterministic and does not accept free-form explanations. Generations and exact binding hashes prevent replay. The backend is a cache/orchestrator. UI status separates finality from execution success.

## Residual risks

Static analysis does not prove arbitrary runtime effects. A verified ABI can still describe a malicious implementation. RPC/source providers can be unavailable. GenLayer semantic adjudication is not a substitute for an audit. These residuals must remain visible in evidence and audit records.
