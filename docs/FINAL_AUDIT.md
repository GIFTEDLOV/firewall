# Firewall final Chronicle audit

Status: release-candidate hardening in progress; canonical contract frozen.

This is the canonical final audit for the competition release candidate. It
supersedes neither the historical records nor the deployed contract. No
blockchain write was performed during this audit. The source contract and
checked-in ABI remain hash-invariant.

## Severity summary

| Severity | Count | Disposition |
| --- | ---: | --- |
| Critical | 0 | No open finding |
| High | 0 | No open finding |
| Medium | 0 | No open finding |
| Low | 0 | No open finding |
| Info | 3 | GenVM/GLSim runner artifact limitation, manual-import provenance boundary, static-EVM-runtime boundary |

## A. Trust model — PASS

The product states the trust problem before exposing protocol internals. The
contract and application order the trust boundary as deterministic facts,
bounded semantic judgment, then deterministic policy. Consensus is not treated
as evidence authentication. A malformed or insufficient semantic result cannot
become an approval; infrastructure failure is surfaced separately from a
business verdict. The adversarial canonical result remains `INCONCLUSIVE` with
no permit because `evidence_sufficient=false`.

Evidence: `contracts/firewall.py`, `packages/policy-engine`, canonical reader
tests, `tests/adversarial/trust-boundary.test.ts`, live qualification record.

## B. Authorization — PASS

There is no hidden global owner and no owner-controlled adverse-review
suppression. Mandate freezing is creator-only and one-way. The application API
cannot override canonical contract state or create a canonical permit. Local
workflow routes advertise `writeAuthority: NONE` and are explicitly
`LOCAL_PRECHAIN_ANALYSIS`.

Evidence: contract authorization branches, direct authorization tests,
`apps/web/app/api`, `packages/workflow`, and `scripts/check_production_truth.mjs`.

## C. Semantic boundary — PASS

The semantic boundary is exactly the seven V1 boolean keys. Strict parsing
rejects extra keys, missing keys, wrong boolean types, strings, nested values,
malformed JSON, and prose-wrapped output. The contract obtains the vector from
the adjudication path rather than accepting caller-supplied booleans. An
insufficient evidence result is `INCONCLUSIVE` only. There is no result
shopping and the generation guard prevents a second adjudication.

Evidence: contract parser, policy tests, adversarial tests, direct test corpus,
`packages/genlayer-client/src/canonical-reader.test.ts`.

## D. Evidence — PASS

Evidence records bind authority, source, exact bytes, content digests, schema,
execution, and expected hash. The contract prevents overwrite and requires a
non-empty bound evidence record before adjudication. Infrastructure failure is
not silently converted into insufficient semantic evidence.

Evidence: `packages/evidence`, evidence schemas, contract evidence guards, and
the direct/adversarial test suites.

## E. Execution and EVM analysis — PASS

The analyzer records selectors, calldata, native value, token effects,
ownership/roles, pause/admin/upgrade behavior, proxy and EIP-1967 facts,
implementation/code hashes, dangerous capabilities, and explicit unknowns.
Unknown selectors, unverified ABI, proxy ambiguity, `SELFDESTRUCT`,
`DELEGATECALL`, and `CREATE` are not coerced into approval.

Evidence: `packages/evm-analyzer`, its unit tests, property tests, and the
adversarial trust-boundary suite.

## F. Transaction lifecycle — PASS / documented boundary

The write-capable client boundary documents and tests the required sequence:

```text
PRECONDITION READ -> PREPARE -> BROADCAST ONCE -> PERSIST HASH
-> RECONCILE SAME HASH -> FINALITY -> EXECUTION RESULT
-> CANONICAL READBACK
```

Finality is not treated as successful execution. This release performs no write
and exposes no production signing path.

Evidence: `docs/RELEASE_RUNBOOK.md`, `packages/genlayer-client`, transaction
journal tests, and the chain-freeze policy.

## G. State machine — PASS

Mandate freeze, evidence authentication, adjudication generation, and permit
issuance are checked after their required preconditions. The contract does not
expose an approval state one transition early. Duplicate freeze, duplicate
adjudication, evidence overwrite, and early permit paths are covered by the
existing direct/adversarial suites.

## H. Replay and duplication — PASS

Entity IDs, mandate versions, evidence bindings, adjudication generations,
permit bindings, and execution digests are carried through the state machine.
Generation replay, permit replay, duplicate adjudication, stale permit, wrong
chain, and wrong contract cases are covered or explicitly rejected by the
identity/binding tests.

## I. Production truth boundary — PASS

Canonical routes read the frozen contract directly through the pinned
read-only adapter. Production does not substitute a snapshot or controlled
fixture when the RPC is unavailable. Controlled browser fixtures require the
non-production `FIREWALL_TEST_CANONICAL=1` guard. Local analysis is under
`/local/*`, has explicit chain context `61127`, and cannot appear as canonical
state. The canonical deployment remains chain `61997`.

Evidence: `apps/web/app/canonical.ts`, `packages/genlayer-client`, route/API
tests, `scripts/check_production_truth.mjs`, and `scripts/check_routes.mjs`.

## J. Frontend security and UX — PASS for implemented surface

The landing page now explains the governance gap before the console. The
control plane is at `/app`; record routes, evidence views, permit views,
semantic vectors, error states, empty states, keyboard focus, responsive
breakpoints, and provenance labels are present. Untrusted imported text is
displayed through React text rendering rather than raw HTML. The UI distinguishes
`EXECUTION_PERMITTED` from `INCONCLUSIVE / NO PERMIT` without relying only on
color.

Evidence: 34 Playwright tests across desktop/mobile, responsive CSS, route
inventory, and production build.

## K. Backend/API — PASS

The previously missing production workflow endpoints are now Next.js route
handlers. They validate JSON content types and payloads, return explicit
errors, keep local state separate, reject the wrong analysis chain, and never
claim canonical mutation. Canonical read endpoints return 503 with an explicit
error when the reader is unavailable.

Evidence: `/api/mandates`, `/api/mandates/[id]`, `/api/mandates/[id]/freeze`,
`/api/executions/analyze`, `/api/executions/[id]`, `/api/read-model`,
`/api/activity`, API tests, and browser E2E.

## L. Release and provenance — PASS

Contract and ABI hashes remain fixed. Historical failures remain preserved,
including Deployment #5 starting nonce `1`. The release workflow now runs
dependency installation, typecheck, unit/API/adversarial/property/mutation and
reader tests, AST/schema checks, direct tests, invariants, production-truth
checks, route/secret checks, production build, and fixture-backed browser E2E.
A separate manually triggered workflow retains the explicit read-only live RPC
verification.

Exact-head CI run `37857839041` passed on the clean release candidate
`470c65deb5efb7a7622dec28c8d2ca032cd90457`. That source was deployed to the
existing Vercel project and the real production alias passed the throttled
read-only smoke: all required routes returned HTTP 200, `/api/read-model`
returned the canonical schema and 1/2/2/2/1 counts, `/api/activity` returned
canonical state, local workflow APIs remained explicitly non-canonical,
missing records returned 404, and browser console/page errors were zero.
The final metadata commit is intentionally recorded using a pre-metadata
source-head field to avoid a self-referential commit hash; the exact final
release head is the SHA pointed to by tag `v1.0.1`. v1.0.0 history is not
rewritten.

## Regression proof against known failures

| Regression | Status | Test / evidence | Remaining risk |
| --- | --- | --- | --- |
| Omitted `feeValue` | PASS | Historical release record preserves the failure; explicit-fee path and runbook require positive fee validation | None in this read-only release |
| Malformed runner | PASS | Historical failure preserved; deployment provenance pins runner and exact source parity | Studio-dev runner can change externally |
| Runner/runtime drift | PASS | Pinned runtime/toolchain metadata, AST/schema gates, provenance hashes | External toolchain availability |
| Malformed semantic output parser assertion | PASS | Exact parser and adversarial malformed-output corpus | GenLayer service availability remains external |
| `NO_MAJORITY` handling | PASS | Historical cancellation retained; no retry/result is treated as canonical approval | None in frozen state |
| Adjudication retry/result shopping | PASS | Generation guard, one adjudication path, result-shopping invariant, policy tests | None identified |
| Unexplained nonce advancement | PASS | Provenance retains Deployment #5 starting nonce `1` and raw history | Historical chain state is immutable |
| Finality interpreted as success | PASS | Transaction runbook and journal tests require execution result and readback | No write path active in this release |
| Fake state fallback | PASS | Production truth guard, fixture isolation check, canonical reader error state, E2E | Live RPC may still be unavailable; UI reports it |
| Production API route absence | PASS | Next route handlers, route inventory, API E2E, production build | Deployment must remain on the final source head |
| Stale browser tests | PASS | Replaced suite; 34/34 desktop/mobile tests pass | External browser/runtime drift |
| Chain-context ambiguity | PASS | Canonical 61997 config; local 61127 labels and `/local/*` routes; wrong-chain validation | Imported local data is intentionally unverified |
| Hidden write paths after freeze | PASS | Production API has no chain client; canonical reader only calls public reads; secret scan and source review | Future contributors must preserve the chain-freeze rule |

## Final gate record

At the time of this audit commit:

- contract source changed: no;
- contract SHA-256: `2b9396f217880a5cdc8a3b4c7adcdce9e3b7ad2cdf975cb847165ce258645735`;
- ABI SHA-256: `928b03e2f1c768794a95f2101609984673c8ac7118587cfe4d5ca4bfddfbaecc`;
- canonical qualification: 1 mandate, 2 executions, 2 evidence, 2 adjudications, 1 permit;
- compliant: `EXECUTION_PERMITTED` / `PRM-00000001`;
- adversarial: `INCONCLUSIVE` / no permit;
- blockchain writes during this audit: zero.

The only informational tooling result observed in this environment is the
documented GenVM/GLSim runner artifact limitation: the pinned historical
`py-genlayer` runner is not present in the downloaded CI/runtime bundle, and
Windows also cannot extract the cached GLSim tree. The checked-in ABI/source
schema gate remains authoritative; this does not alter the contract, canonical
data, or production reader.
