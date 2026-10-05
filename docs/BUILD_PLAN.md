# Gate 1 build plan

## Completed in this pass

1. Inventory toolchain and official GenLayer network/runtime research.
2. Initialize a pnpm TypeScript monorepo and Python Direct Mode configuration.
3. Freeze product, architecture, trust, threat, evidence, and state documents.
4. Implement Zod domain schemas, canonical JSON, SHA-256 bindings, IDs, and policy derivation.
5. Implement the first deterministic EVM analyzer with explicit unknowns and proxy facts.
6. Implement a GenLayer contract skeleton, schema extraction, and Direct Mode lifecycle tests.
7. Scaffold a typed Next.js read-model shell and route surface.

## Gate 1 checks

- TypeScript typecheck and package tests.
- `genvm-lint check` and ABI/schema extraction.
- `gltest tests/direct`.
- Next.js production build.
- Git diff review for fake protocol state, secrets, network writes, and provenance.

## Gate 2

Add adversarial/property/mutation tests, canonical Governor/Safe import fixtures, RPC/source adapters, trace simulation, browser verification, and a localnet integration harness. No public deployment is implied by Gate 2.

## Release qualification sequence

AST/static audit → semantic validation → schema/ABI audit → Python/TypeScript checks → Direct Mode → adversarial fixtures → mutation/property state machine → semantic equivalence → evidence/authority → transaction lifecycle → fee/value → hosted/full consensus → frontend truth → Playwright → secret/provenance → source/deployment parity → production release audit.
# Gate 2 release-candidate plan

Gate 2 is complete only after local verification covers:

1. contract AST/lifecycle/schema extraction and Direct Mode semantic mocks;
2. strict Zod/parser/prompt-injection tests;
3. adapters, analyzer, deterministic block detector, evidence and permit
   binding tests;
4. backend route and transaction journal tests;
5. Next.js build and Playwright browser truth tests;
6. mutation/property/adversarial suites and a local security review.

No command in this plan deploys, funds, broadcasts, or publishes anything.

## Explicit deterministic block reasons

`CHAIN_MISMATCH`, `FORBIDDEN_TARGET`, `TARGET_NOT_ALLOWLISTED`,
`NATIVE_VALUE_EXCEEDS_CAP`, `VALUE_TRANSFER_FORBIDDEN`, `FORBIDDEN_SELECTOR`,
`OWNERSHIP_TRANSFER`, `ADMIN_AUTHORITY_CHANGE`, `UPGRADE_OUTSIDE_SCOPE`, and
`UNKNOWN_BEHAVIOR` are analyzer/application facts. A hard deterministic block
is kept distinct from a semantic block and from evidence infrastructure states.
