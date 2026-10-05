# Local Gate 2 security audit

Scope: contract authorization, semantic boundary, evidence and permit binding,
deterministic analyzer, local API, transaction journal, and UI truth boundary.

Findings addressed in this gate:

- Gate 1 global-owner authority: removed.
- Caller-supplied semantic booleans: removed; replaced by
  `adjudicate_execution(execution_id)` and GenLayer prompt consensus.
- Owner-supplied permit outcome: removed; permit requires canonical qualifying
  adjudication.
- Evidence overwrite: prevented by committed evidence hash and one-way state.
- Prompt injection and malformed output: delimited prompt plus exact seven-key
  boolean parser and adversarial fixtures.
- Permit replay/mutation: deterministic binding contains mandate, proposal,
  execution, chain, target/value/calldata/code/implementation digests,
  adjudication generation, schema, and expiry.

Current local severity counts are recorded by the Gate 2 verification report.
No deployment, faucet, blockchain write, GitHub push, or Vercel operation is
performed by this repository gate.

## Gate 2 disposition

`CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 0 · INFO 3`.

The three informational items are: no hosted/full-consensus write was run;
manual imports remain explicitly unverified provenance; and static EVM facts do
not prove arbitrary runtime behavior. These are documented product boundaries,
not hidden approvals.
