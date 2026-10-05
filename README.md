# Firewall

Firewall is a semantic execution-security layer for on-chain governance. Gate 1 is a local-only protocol foundation: deterministic domain bindings, evidence/authentication boundaries, an EVM analyzer, a current-runtime GenLayer Intelligent Contract skeleton, Direct Mode tests, and a typed Next.js shell.

## Local verification

```powershell
pnpm install
pnpm typecheck
pnpm test:ts
pnpm lint:contract
pnpm schema:contract
$env:GENVM_VERSION = "v0.6.0-rc2"
$scriptDir = python -c "import sysconfig; print(sysconfig.get_path('scripts'))"
& (Join-Path $scriptDir "gltest.exe") tests/direct -q
pnpm --filter @firewall/web build
```

No command above deploys, funds, contacts, or writes to a GenLayer network. See `provenance/TOOLCHAIN.md` for the recorded local versions and current official network research.
