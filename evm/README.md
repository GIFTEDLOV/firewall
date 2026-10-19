# Firewall Guard — experimental, NOT approved for deployment

This folder contains an isolated prospective Safe Guard prototype for the
steward's missing EVM enforcement finding.

## Scope and current tests

- Solidity 0.8.28 compilation: PASS after splitting the call binding helper.
- Compile of Solidity regression harness: PASS.
- Ganache local tests: unauthenticated, wrong calldata, delegatecall and
  wrong target rejection checks printed PASS.
- **Authorized transaction execution: FAIL.** The local execution trace
  reverted with `UnauthorizedExecution()`. After adding temporary distinct
  debug errors *only in the ephemeral test sandbox*, the rejection resolved to
  `MissingActivePermit()` in `checkTransaction`. Publication returned an
  active permit at nonce 0, but the Guard did not accept the transaction.
- No complete pass of all replay, expiry, signer and receipt tests.
- No prospective GenLayer V3 contract, permit, or attestor-qualification proof.
- No public EVM Safe/Guard deployment, installation, authorized execution,
  or blocked execution receipt.

**RELEASE GATE: NO-GO.** Never install this prototype on any funded Safe.
It may brick the Safe. The historical GenLayer V2 permit is not prospective
authorization. A prospective GenLayer intent contract and a strictly verified
attestor bridge are separate requirements; this experimental Guard does not
replace either of them.

Follow official Safe Guard hook semantics, verify Safe nonce behavior using
the *actual deployed Safe version*, not only the current MockSafe test harness,
then rerun full execution tests before even considering testnet deployment.
Safe transaction Guards do not automatically cover enabled modules.
Do not allow unsafe bypass modules in the qualification Safe.

The isolated branch is for review and testing only; this is not part of
Firewall's production release.
