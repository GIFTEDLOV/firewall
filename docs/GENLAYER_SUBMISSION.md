# GenLayer submission package

Submission status: ready for the remaining authenticated portal action. No
portal submission success is claimed.

## Project

- Project: Firewall
- One-line: Semantic execution security for on-chain governance.
- Description: Firewall verifies whether an on-chain execution package still semantically implements the governance mandate that approved it. It combines deterministic EVM evidence with bounded GenLayer semantic adjudication and issues an execution permit only when the frozen semantic policy is satisfied.
- Problem: Governance systems verify votes, quorum, signatures, calldata, and timelocks, but those mechanisms alone do not prove that the code ultimately executed still implements the mandate voters approved.

## Live proof

- Compliant: `EXECUTION_PERMITTED`, permit `PRM-00000001`.
- Adversarial: `INCONCLUSIVE`, no permit.
- Fail-closed reason: `evidence_sufficient=false` caused `INCONCLUSIVE`; the result was not relabeled `BLOCKED`.
- Counts: 1 mandate, 2 executions, 2 evidence records, 2 adjudications, 1 permit.
- Schema: `FIREWALL_MANDATE_V1`.
- Qualification IDs: `EXE-00000001` / `ADJ-00000001` and `EXE-00000002` / `ADJ-00000002`.

## Links and chain references

- GitHub: https://github.com/GIFTEDLOV/firewall
- Production: https://firewall-xi.vercel.app
- Release: https://github.com/GIFTEDLOV/firewall/releases/tag/v1.0.2
- Canonical contract: `0xEFD65978F54318349139c93c1576ED3eb6f187b6`
- Deployment transaction: `0xe42328da75aba2c4f898ec4c4ade8eb1eea10f9d4e4194bc6f4476c4dc0b3ac0`
- Chain: `61997`
- RPC: `https://studio-dev.genlayer.com/api`
- Contract SHA-256: `2b9396f217880a5cdc8a3b4c7adcdce9e3b7ad2cdf975cb847165ce258645735`
- ABI SHA-256: `928b03e2f1c768794a95f2101609984673c8ac7118587cfe4d5ca4bfddfbaecc`

## Submission boundary

The repository, production URL, contract, deployment transaction, and
qualification evidence above are the complete package. The remaining action is
for an authenticated project owner to open the official GenLayer project
submission portal, paste this package, and press its final submit control. No
transaction, faucet, permit, adjudication, or other blockchain write is part
of that action.
