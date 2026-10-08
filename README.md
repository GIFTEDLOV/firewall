# Firewall

![Firewall symbol](apps/web/app/icon.svg)

## Semantic execution security for on-chain governance

[![Live application](https://img.shields.io/badge/live-firewall--xi.vercel.app-9cff57?style=flat-square&logo=vercel&logoColor=111)](https://firewall-xi.vercel.app)
[![CI](https://github.com/GIFTEDLOV/firewall/actions/workflows/release.yml/badge.svg)](https://github.com/GIFTEDLOV/firewall/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/GIFTEDLOV/firewall?display_name=tag&style=flat-square)](https://github.com/GIFTEDLOV/firewall/releases)

Governance can approve one thing while the implementation that executes does
something materially different. Firewall freezes the approved mandate, binds
deterministic EVM evidence, applies bounded semantic adjudication, and lets a
deterministic policy issue a permit only when the complete semantic contract
passes.

## Live proof

Firewall is read-only in the public console and reads the canonical GenLayer
Studio-dev contract directly:

- Network: GenLayer Studio-dev, chain `61997`
- Contract: `0xEFD65978F54318349139c93c1576ED3eb6f187b6`
- Deployment transaction: `0xe42328da75aba2c4f898ec4c4ade8eb1eea10f9d4e4194bc6f4476c4dc0b3ac0`
- Production: [firewall-xi.vercel.app](https://firewall-xi.vercel.app)
- Qualification: 1 mandate, 2 executions, 2 evidence records, 2 adjudications, 1 permit

The compliant path is `EXECUTION_PERMITTED` with `PRM-00000001`. The
adversarial path is `INCONCLUSIVE` with no permit because
`evidence_sufficient=false`; it is not relabeled as a business block.

## The security model

```text
governance mandate
       |
       v
deterministic identity, calldata, value, code, proxy and evidence facts
       |
       v
bounded GenLayer semantic vector (exactly seven booleans)
       |
       v
deterministic policy -> EXECUTION_PERMITTED / INCONCLUSIVE / no permit
```

The `FIREWALL_MANDATE_V1` vector is:

| Key | Meaning |
| --- | --- |
| `intent_satisfied` | The implementation satisfies the approved intent. |
| `scope_expanded` | The implementation expands beyond approved scope. |
| `prohibited_effect_present` | A prohibited effect is present. |
| `economic_terms_consistent` | Economic terms remain consistent. |
| `administrative_authority_changed` | Administrative authority changes. |
| `implementation_behavior_consistent` | Implementation behavior remains consistent. |
| `evidence_sufficient` | Evidence is sufficient for semantic adjudication. |

`EXECUTION_PERMITTED` requires `true, false, false, true, false, true, true`.
If evidence is insufficient, the contract fails closed to `INCONCLUSIVE` and
does not issue a permit.

## Product surfaces

- `/` — product landing page, governance gap, live proof, trust model, and integrations.
- `/app` — live canonical control plane.
- `/mandates`, `/executions`, `/adjudications/[id]`, `/permits/[id]`, `/activity` — forensic record views.
- `/integrate` — Governor, Safe, and manual-import integration guidance.
- `/local/*` — explicitly labeled `LOCAL_PRECHAIN_ANALYSIS` workflow records; never canonical state.

The production reader has no private-key path and no mock fallback. RPC,
configuration, malformed-record, and missing-record failures are surfaced
explicitly. The local workflow API is an off-chain analysis tool and carries
chain context `61127` only as a target-chain analysis context; the canonical
contract remains chain `61997`.

## Why ordinary governance checks are not enough

Votes, quorum, signatures, timelocks, and calldata validation are necessary,
but they do not by themselves prove semantic implementation fidelity. Firewall
connects the approved intent to the exact execution package and evidence that
will be evaluated.

## Development

Requirements: Node.js 24.14+, pnpm 11+, Python 3.12+ for contract tooling.

```powershell
pnpm install
pnpm typecheck
pnpm test:ts
pnpm test:api
pnpm test:adversarial
pnpm test:property
pnpm test:mutation
pnpm test:browser
pnpm --filter @firewall/web build
```

For the live read-only check, configure the three public variables from
[`apps/web/.env.example`](apps/web/.env.example), then run
`pnpm verify:live-read`. This performs reads only; it does not sign or submit
transactions.

## Repository structure

```text
apps/web                 Next.js landing page, control plane, API route handlers
apps/api                 TypeScript workflow boundary and tests
contracts/firewall.py   frozen canonical GenLayer contract
packages/domain          strict domain schemas and identity bindings
packages/evidence        evidence authentication and digests
packages/evm-analyzer    deterministic execution facts and unknowns
packages/genlayer-client canonical read adapter and lifecycle interfaces
packages/policy-engine   deterministic semantic policy
packages/workflow        explicitly local, pre-chain analysis service
tests                    direct, adversarial, property, mutation, browser suites
docs                     architecture, security, runbook, audit and provenance
provenance               immutable qualification and release records
```

## Release and limitations

The frozen contract source SHA-256 is
`2b9396f217880a5cdc8a3b4c7adcdce9e3b7ad2cdf975cb847165ce258645735` and the
ABI SHA-256 is
`928b03e2f1c768794a95f2101609984673c8ac7118587cfe4d5ca4bfddfbaecc`.
Historical deployment failures and the corrected Deployment #5 starting nonce
of `1` remain in the provenance records. The Windows environment may prevent
the installed GLSim runner from extracting its cached runtime; this is recorded
as a tooling limitation and does not change canonical state.

Read the [final Chronicle audit](docs/FINAL_AUDIT.md),
[production release record](docs/PRODUCTION_RELEASE.md), and
[security policy](SECURITY.md) before integrating Firewall.
