# Firewall architecture

## Trust domains

| Domain | Responsibility | Authority |
| --- | --- | --- |
| Governance adapter | Normalize proposal identity and capture | Source-specific, never final by itself |
| Domain packages | Validate state and identity shapes | Deterministic application invariants |
| EVM analyzer | Extract selectors, decode known ABI, capture code/proxy facts, flag unknowns | Deterministic facts only |
| Evidence package | Bind authority, source, content digests, freshness, and schema | Evidence authentication boundary |
| GenLayer Intelligent Contract | Store frozen bindings and accept bounded semantic adjudication | Canonical adjudication history |
| Policy engine | Derive permit/block/inconclusive | Deterministic boolean rule |
| API/indexer | Orchestrate and cache reads | Never overrides canonical state |
| Web app | Display canonical read models and lifecycle | Presentation only |

## Monorepo

```text
apps/web                 Next.js application shell and forensic routes
apps/api                 TypeScript orchestration boundary
contracts/firewall.py   GenLayer Intelligent Contract skeleton
packages/domain          Zod schemas and identity bindings
packages/shared          Canonical JSON, SHA-256, IDs, hex utilities
packages/evidence        Evidence authentication and failure states
packages/evm-analyzer    Deterministic EVM analysis domain layer
packages/governance-adapters  Governor, Safe, manual import interfaces
packages/policy-engine   Bounded result policy and deterministic reasons
packages/genlayer-client Typed read/write lifecycle interfaces
packages/indexer         Canonical-read-model cache boundary
tests/*                  Direct, adversarial, property, mutation, integration, browser
docs/*                   Frozen specification and release gates
```

## Data flow

The API may acquire data, but every record must carry the exact identity/hash needed to reconcile it against canonical reads. An imported proposal becomes a mandate only after the text, source, external identity, and constraints are hashed. An execution package becomes committed only after its ordered target/value/calldata facts are hashed. Evidence is not trusted because it came from a URL; it is authenticated by the evidence bundle hash and its entry-level digests. A permit is a binding over all protected facts.

## Runtime posture

There are no live RPC writes in Gate 1. The GenLayer client package exposes the safe transaction lifecycle as an interface and guard. When writes are added, the only permitted sequence is precondition read, prepare, broadcast once, persist exact hash, reconcile the same hash, finality, execution-result check, and canonical readback.

## UI posture

The web app has typed routes and an empty canonical state. It never inserts sample mandates, fake verdicts, fabricated AI prose, or invented addresses. Pending transaction records must be persisted in a later client integration and must keep the distinction between finality and execution success.
