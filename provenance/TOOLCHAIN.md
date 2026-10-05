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

## Gate 3 runner closure

The contract header pins the runner artifact
`py-genlayer:9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0`. The
installed linter's default latest selector resolves to
`v0.6.0-rc8`, which does not contain that artifact. The exact local runner is
available in the rc2 bundle/cache as `v0.6.0-rc2`.

| Item | Gate 3 value |
| --- | --- |
| `EXACT_STUDIO_DEV_CHAIN_ID` | `61997` |
| `EXACT_STUDIO_DEV_RPC` | `https://studio-dev.genlayer.com/api` |
| `EXACT_REQUIRED_RUNNER_ID` | `py-genlayer:9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0` |
| `EXACT_RUNNER_ARTIFACT_NAME` | `py-genlayer` at the pinned content ID above |
| `EXACT_RUNNER_SOURCE` | local official linter cache/bundle, selected with `GENVM_VERSION=v0.6.0-rc2` |
| Direct/GLSim prebuilt tree | `C:\Users\DELL\.cache\gltest-direct\trees-v2\v0.6.0-rc2` |
| GLSim local RPC / chain | `http://127.0.0.1:4010/api` / `61127` |
| GLSim validators | `5` |

The official gates use the explicit rc2 selector and the Python Scripts path:

```powershell
$env:GENVM_VERSION = 'v0.6.0-rc2'
$env:Path = 'C:\Users\DELL\AppData\Local\Python\pythoncore-3.14-64\Scripts;' + $env:Path
genvm-lint lint contracts/firewall.py --json
genvm-lint validate contracts/firewall.py --json
genvm-lint check contracts/firewall.py --json
genvm-lint schema contracts/firewall.py --json
genvm-lint typecheck contracts/firewall.py --json
```

For Windows GLSim only, `scripts/glsim_windows.py` applies a checked-in
adapter shim at the SDK boundary: it replaces the rc2 SDK's empty method key
with `method`, converts decoded `memoryview` byte fields to `bytes`, and uses a
pipe for Direct Mode stdin injection. This does not alter Firewall contract
semantics or any network configuration. Without this shim, the installed
`genlayer-py 0.19.0rc2` / current GLSim combination fails before contract
execution with calldata-shape and Windows temporary-file errors.
