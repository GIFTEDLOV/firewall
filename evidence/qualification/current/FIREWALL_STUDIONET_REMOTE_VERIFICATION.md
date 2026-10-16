# Firewall — steward remediation verification (read-only)

Checked 2026-10-16 against **GenLayer Studionet (61999)** at `https://studio.genlayer.com/api`.

## Finding 1: independent execution evidence

- Deployed V2 contract: `0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528`.
- Deployment transaction: `0xa3f25170cfa592fa5d289c8c9a9f9662b58815150c02190478f39ed5cb084c20`, FINALIZED.
- Retrieved on-chain source SHA-256: `b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163`.
- Retrieved deployed ABI exposes `authenticate_evidence(execution_id)`, `adjudicate_execution(execution_id)`, and `issue_permit`.
- On-chain source independently fetches evidence with `gl.nondet.web.get` and compares canonical retrieved facts via `gl.eq_principle.strict_eq`. Source-level mechanism is present, **but has not been exercised successfully by a LIVE write**.
- Historical Ethereum transaction: `0xd093d4ebae3c529a950002a123e1f58a412b56c87b2c2dcb22704708f8f3f9eb` in block `22848240`, Safe `0x954a62Cbc5B48AF7342dfd00e40bF2C9F6de9D19`.
- Both Blockscout and Routescan returned the matching transaction hash, block number, Safe address, and block hash `0x7575def35e24de6592b7da4f111db054bc3f2e84506c82126e280941c99a9770`.
- All **nine** configured provider URLs recovered from the finalized deployment transaction returned HTTP 200 and parseable JSON from an independent cloud runtime.
- On-chain read-only state: **0 mandates, 0 executions, 0 adjudications, 0 permits**. No LIVE evidence-authentication consensus or permit is claimed.
- Authorized signer `0x33653e6e86807e41682d3346cdf648d6653384b1`: latest/pending nonce 8/8, balance 5 GEN; no signing access is present in the connected cloud environment.

## Finding 2: EVM enforcement

- Existing Guard source/artifact and Ganache tests are in an unpublished **local** workspace, not this remote `master` snapshot.
- No user-controlled approved EVM Safe, installed Guard, permitted execution, or rejected execution transaction was available to verify.
- **Finding 2 is not yet proven LIVE.**

## Release truthfulness

The live production `/api/read-model` was HTTP 200 but configured for Studio-dev `61997` and contract `0xEFD65978F54318349139c93c1576ED3eb6f187b6`, not Studionet V2. The remote `master` is behind unpublished local work; do not overwrite that work or cut over V1 code by changing environment variables alone.

**Status: both steward findings still require LIVE qualification; not ready for resubmission.** This file is read-only reconciliation evidence, not a substitute for LIVE validator authentication or installed Safe enforcement.
