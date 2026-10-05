# Firewall state machine

The smallest Gate 1 lifecycle is:

```text
MANDATE_DRAFT ──freeze──> MANDATE_FROZEN
                                │
                                └─ commit exact package ──> EXECUTION_COMMITTED
                                                               │
                                                               └─ authenticate evidence ──> EVIDENCE_AUTHENTICATED
                                                                                              │
                                                                                              └─ record generation ──> ADJUDICATED
                                                                                                                        │
                                                                                               ┌────────────────────────┴──────────────────────┐
                                                                                               v                                               v
                                                                                   EXECUTION_PERMITTED                                  EXECUTION_BLOCKED
                                                                                               │
                                                                                               └─ issue exact permit ──> PERMIT_ACTIVE
```

`INCONCLUSIVE` is an adjudication verdict caused by insufficient evidence; it is not a permit and cannot transition to `PERMIT_ACTIVE`.

## Invariants

- A mandate's constraints and identity are immutable after freeze.
- An execution's bundle hash is immutable after commit.
- Evidence explicitly binds mandate, execution, proposal identity, source, authority, content digest, byte length, chain, code/implementation facts, ABI provenance, freshness, and schema.
- Adjudication generations increase monotonically and are append-only.
- A permit is bound to the exact execution package, target/code/implementation hashes, semantic schema, adjudication generation, and expiry.
- A changed execution-relevant fact produces a different bundle/binding hash and cannot use the prior permit.
- Finalized transaction state is not execution success; execution result must be checked and then canonical state read back.
