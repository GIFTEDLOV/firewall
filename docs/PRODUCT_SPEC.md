# Firewall product specification

Status: frozen for Gate 1 (2026-10-05)

Firewall is a semantic execution-security layer for on-chain governance. It binds an authenticated governance mandate to one exact execution package, analyzes deterministic execution facts, asks GenLayer only the bounded semantic question that code cannot answer, and derives the final permit/block state with deterministic policy.

## Trust objective

The system must prevent a protocol or DAO from executing a package whose actual meaning or effects materially diverge from what governance approved. Firewall is not the governance system, wallet, multisig, or executor. It is an adjudication and evidence-binding layer that can be integrated before execution.

## Canonical flow

1. Import a proposal through an adapter or manual canonical import.
2. Hash and freeze the mandate and its explicit constraints.
3. Import the candidate execution package in exact order.
4. Analyze target, calldata, value, ABI, bytecode, proxy, and implementation facts deterministically.
5. Bind authoritative evidence by authority, source, chain, proposal/execution identity, SHA-256, byte length, code hashes, ABI provenance, freshness, and schema.
6. Submit the seven-field semantic question to GenLayer.
7. Derive `EXECUTION_PERMITTED`, `EXECUTION_BLOCKED`, or `INCONCLUSIVE` locally and in the Intelligent Contract.
8. Issue a permit only for the exact package and adjudication generation.
9. Expose canonical readback and append-only audit history.

## GenLayer boundary

GenLayer does not choose targets, calldata, recipients, amounts, ordering, proposal outcomes, administrators, winners, risk scores, or prose decisions. Its V1 authority is exactly the `FIREWALL_MANDATE_V1` boolean object in `packages/domain/src/schemas.ts`. The policy engine owns the verdict.

## V1 scope

- OpenZeppelin Governor-style EVM import.
- Safe transaction bundle import.
- Manual canonical bundle import.
- Deterministic EVM call and proxy analysis with explicit unknowns.
- GenLayer lifecycle skeleton and Direct Mode tests.
- Typed web read model and route shell with empty/pending/error states.

Snapshot/Tally ingestion, full trace simulation, production RPC adapters, live writes, deployment, and executor integrations are post-Gate 1 work.

## Non-goals

Firewall does not prove arbitrary runtime behavior from static facts, replace code audits, make governance decisions, or treat backend/indexer data as protocol authority.
