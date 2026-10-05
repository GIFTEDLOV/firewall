# Gate 0 toolchain and GenLayer network research

Recorded: 2026-10-05 (Africa/Lagos), workspace `C:\Users\DELL\Firewall`.

## Local toolchain

| Tool | Version / observation |
| --- | --- |
| git | 2.53.0.windows.2 |
| node | v24.14.0 |
| pnpm | 11.0.9 |
| python | 3.14.3 |
| pip | 25.3 |
| GenLayer CLI | 0.40.0-rc.3 |
| genlayer-py | 0.19.0rc2 |
| genlayer-test | 0.30.0rc2 |
| genvm-linter | 0.11.1rc2 |
| Direct Mode entry point | `gltest.exe` pytest wrapper; its `--version` output is pytest 9.1.1 |
| `genvm-lint` | installed as `genvm-lint.exe`; version 0.11.1rc2 |
| `glsim` | installed; CLI exposes host/port/validator/chain-id/provider flags but no `--version` flag |

Python packages were already installed locally. `requirements.txt` pins the observed GenLayer packages for reproducibility.

## Current official network/runtime notes

Research source: [GenLayer Networks](https://docs.genlayer.com/developers/networks), [Network Configuration](https://docs.genlayer.com/developers/intelligent-contracts/deploying/network-configuration), [GenLayerPY](https://docs.genlayer.com/api-references/genlayer-py), and [genvm-linter](https://docs.genlayer.com/api-references/genlayer-linter), checked on 2026-10-05.

| Alias / environment | RPC / chain ID | Use |
| --- | --- | --- |
| localnet | `http://localhost:4000/api` / 61127 | Local Studio/GLSim; resettable |
| studionet | `https://studio.genlayer.com/api` / 61999 | Stable hosted development |
| studio-dev | `https://studio-dev.genlayer.com/api` / 61997 | Release-candidate preview; matching RC tooling required; temporary |
| testnet-bradbury | `https://rpc-bradbury.genlayer.com` / 4221 | Production-like testnet |
| testnet-asimov | `https://rpc-asimov.genlayer.com` / 4221 | Infrastructure/stress testnet |

No network was selected, started, funded, contacted, or written to during Gate 0/1. No faucet, deployment, wallet, production secret, or live consensus was used.

The official docs currently require an explicit `studio-dev` preset for the 61997 preview and warn not to relabel `studionet`. This repository records the values but deliberately does not assert that any live integration is complete.
