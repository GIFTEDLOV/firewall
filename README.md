# Firewall

Firewall is a semantic execution-security layer for on-chain governance. It
checks whether the implementation that will execute still semantically matches
the mandate governance approved. Deterministic EVM facts and authenticated
evidence are bound first; bounded GenLayer semantic adjudication follows; a
deterministic contract policy decides permit eligibility last.

## Trust model

1. Deterministic facts first: identity, lifecycle, evidence bindings, replay
   protection, and execution effects are validated and recorded.
2. Bounded semantic judgment second: GenLayer evaluates only the frozen
   mandate-versus-implementation question.
3. Deterministic execution policy last: the contract derives the result and
   issues a bound permit only when the complete policy passes.

The `FIREWALL_MANDATE_V1` semantic vector contains exactly:

| Key | Meaning |
| --- | --- |
| `intent_satisfied` | The implementation satisfies the approved intent. |
| `scope_expanded` | The implementation expands beyond approved scope. |
| `prohibited_effect_present` | A prohibited effect is present. |
| `economic_terms_consistent` | Economic terms remain consistent with the mandate. |
| `administrative_authority_changed` | Administrative authority changes. |
| `implementation_behavior_consistent` | Implementation behavior remains consistent. |
| `evidence_sufficient` | The authenticated evidence is sufficient for adjudication. |

`EXECUTION_PERMITTED` requires, respectively, `true, false, false, true,
false, true, true`. If `evidence_sufficient` is false, the result is
`INCONCLUSIVE`; otherwise a vector that does not meet the permit policy is
`EXECUTION_BLOCKED`. No permit is issued for an inconclusive result.

## Studio-dev live qualification

- Contract: `0xEFD65978F54318349139c93c1576ED3eb6f187b6` (chain 61997)
- Deployment transaction: `0xe42328da75aba2c4f898ec4c4ade8eb1eea10f9d4e4194bc6f4476c4dc0b3ac0`
- Runner: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
- Compliant TreasuryVault batching: `EXECUTION_PERMITTED`; permit `PRM-00000001` issued.
- Adversarial package: semantic evaluation detected scope expansion, a
  prohibited effect, changed administrative authority, inconsistent economic
  terms, and inconsistent implementation behavior. Since
  `evidence_sufficient=false`, its canonical result is `INCONCLUSIVE`, not
  `EXECUTION_BLOCKED`; no permit exists for that execution.

The observed live state is a qualification snapshot, not a promise that the
Studio-dev network or its state is permanent. Historical deployment and
qualification failures are preserved in `provenance/live-qualification.json`.
See [the production release record](docs/PRODUCTION_RELEASE.md) for hashes,
transaction history, and publication status.

## Web application status

The current web app is a typed workflow shell. Its read model explicitly reports
`UNAVAILABLE` until a canonical contract reader is configured; it does not
substitute fixture data for chain state. Production publication is blocked
until that read-only integration and its environment are configured and
verified. No UI action is used as part of the live qualification recorded here.

## Local checks

```powershell
pnpm install
pnpm typecheck
pnpm --filter @firewall/web build
```

Contract validation and prior qualification evidence are recorded under
`provenance/`. These local checks do not deploy or write to a blockchain.
