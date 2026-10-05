# Firewall trust model

## Parties

- Governance voters and the governance contract establish the mandate.
- Proposal/execution adapters transport authenticated source facts.
- RPC, source, ABI, and code providers supply evidence that must be independently bound.
- GenLayer validators provide a semantic comparison under the bounded V1 schema.
- The deterministic policy engine and Intelligent Contract derive the final verdict.
- An executor consumes a permit but does not get to rewrite its bindings.

## Deterministic facts

IDs, chain IDs, addresses, deadlines, state transitions, byte lengths, digests, selector sets, values, order, code hashes, implementation hashes, generation numbers, replay protection, expiry, and policy derivation are deterministic. They cannot be delegated to GenLayer.

## Semantic question

Given a frozen mandate and authenticated evidence for an exact execution package, return only seven booleans: whether intent is satisfied, scope expanded, a prohibited effect is present, economic terms remain consistent, admin authority changed, implementation behavior remains consistent, and evidence is sufficient.

## Fail-closed distinction

`SOURCE_UNAVAILABLE`, `EVIDENCE_MISMATCH`, and `INCONCLUSIVE` are operational/evidence states. They are not substitutes for either permitted or blocked. In particular, `evidence_sufficient=false` derives `INCONCLUSIVE`.

## Authority order

1. Canonical Intelligent Contract state.
2. Deterministic, hash-bound evidence and analyzer facts.
3. Backend/indexer read models reconciled to canonical state.
4. Frontend presentation.

No lower layer may override a higher layer.
