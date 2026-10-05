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
