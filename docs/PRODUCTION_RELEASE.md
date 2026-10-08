# Firewall production release record

## Verified contract

| Field | Value |
| --- | --- |
| Network | GenLayer Studio-dev, chain `61997` |
| Contract | `0xEFD65978F54318349139c93c1576ED3eb6f187b6` |
| Deployment transaction | `0xe42328da75aba2c4f898ec4c4ade8eb1eea10f9d4e4194bc6f4476c4dc0b3ac0` |
| Runner | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |
| Contract SHA-256 | `2b9396f217880a5cdc8a3b4c7adcdce9e3b7ad2cdf975cb847165ce258645735` |
| ABI SHA-256 | `928b03e2f1c768794a95f2101609984673c8ac7118587cfe4d5ca4bfddfbaecc` |
| Deployment source parity | PASS, 18,284 bytes |
| Public methods | 14 |
| Semantic schema | `FIREWALL_MANDATE_V1` |

The deployment used the direct GenLayer JS SDK transaction path. Before
signing, the serialized request was checked for the complete fee object,
positive `feeValue`, distribution, zero user value, chain, runner, and nonce.

## Qualification result

The compliant TreasuryVault batching execution (`EXE-00000001`) produced
`ADJ-00000001`, generation 1, with vector
`true,false,false,true,false,true,true`. The canonical result was
`EXECUTION_PERMITTED`; permit `PRM-00000001` was issued and its binding was
verified.

The adversarial execution (`EXE-00000002`) produced `ADJ-00000002`, generation
1, with vector `false,true,true,false,true,false,false`. The semantic result
identified scope expansion, a prohibited effect, economic inconsistency,
changed administrative authority, and inconsistent implementation behavior.
Because `evidence_sufficient=false`, the frozen policy returned
`INCONCLUSIVE`. This was not `EXECUTION_BLOCKED`. The contract issued no permit
for the adversarial execution. This is the demonstrated fail-closed property;
the observed result is reported without reassessment or result shopping.

Canonical state after qualification: 1 mandate, 2 executions, 2 evidence
records, 2 adjudications, and 1 permit. No blockchain writes are authorized by
this release record; the qualification writes described above are historical.

## Immutable history and nonce correction

Preserve earlier outcomes as recorded: Deployment #1 reverted with
`FeeValueMustBeNonZero`; Deployment #2 failed validation with
`invalid_contract runner malformed`; Deployment #3 succeeded at
`0x2C16eae2F439cb799F3Bc43883Dcc5c321b300Ac`; qualification attempt #1
canceled with `NO_MAJORITY`; qualification attempt #2 failed on malformed
semantic output and a parser assertion; Deployment #4 failed with
`FeeValueMustBeNonZero(1)` because the CLI path omitted the positive fee value.
Deployment #5 succeeded using the explicit-fee SDK path.

Deployment #4 consumed nonce 0. Therefore Deployment #5's starting nonce was
**1**, its transaction used nonce 1, and the signer reached latest/pending
nonce 11 after the ten Deployment #5 and qualification broadcasts. Any older
derived summary claiming Deployment #5 started at nonce 0 is superseded by
this correction; raw historical logs remain unchanged.

## Publication status

This repository has no configured Git remote and no linked Vercel project or
production environment configuration. The web app's canonical read model is
still explicitly unavailable, so it must not present the qualification
snapshot as live chain reads. GitHub publication, Vercel deployment, production
smoke testing, release tagging, and GenLayer portal submission have not been
performed. These are blockers, not implied successes.

The exact submission content is represented by this record and the README;
portal submission requires locating and using the official project submission
portal. No submission ID or URL exists yet.
