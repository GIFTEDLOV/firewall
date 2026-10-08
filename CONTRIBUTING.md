# Contributing

Install Node.js 24+, pnpm 11+, and Python 3.12+.

```powershell
pnpm install
pnpm typecheck
pnpm test:ts
pnpm test:api
pnpm test:adversarial
pnpm test:property
pnpm test:mutation
pnpm check:production-truth
pnpm check:routes
pnpm --filter @firewall/web build
pnpm test:browser
```

Do not change `contracts/firewall.py` or the checked-in ABI without explicit
release authorization and a new contract release process. This repository is
under a chain-freeze rule: development and CI must not sign transactions,
adjudicate, issue permits, deploy, or use a faucet. The live check is read-only.

Keep canonical and local analysis state visibly separate. New UI routes should
declare their provenance, preserve explicit loading/error/empty states, and
never insert demo data into canonical routes.
