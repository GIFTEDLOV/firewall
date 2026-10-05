# Firewall evidence model

Evidence is a typed bundle, not a URL list. Each entry records:

- authority and transport source;
- chain and proposal/execution identity;
- SHA-256 of exact bytes and exact byte length;
- target code hash and implementation hash when applicable;
- ABI provenance and ABI digest;
- capture time, freshness expiry, schema version, role, and content type.

The bundle binds its mandate, execution, proposal identity, entry list, and `FIREWALL_EVIDENCE_V1` schema into one SHA-256 identity. Authentication succeeds only when the expected bundle hash and every entry digest match. Unavailable source is `SOURCE_UNAVAILABLE`; a retrieved but incorrect object is `EVIDENCE_MISMATCH`; a semantic result with `evidence_sufficient=false` is `INCONCLUSIVE`.

## Evidence roles

`PROPOSAL`, `CALldata`, `CODE`, `IMPLEMENTATION`, `ABI`, `RPC_READ`, and `OTHER` keep provenance explicit. The analyzer can use deterministic facts but must expose unknown ABI, selector, code, implementation, or runtime behavior instead of guessing.

## Prompt injection

Proposal prose, code comments, ABI labels, and source metadata are untrusted data. They are inputs to the bounded semantic comparison, never instructions to validators or application code. Consensus-critical output is strict JSON with exactly seven boolean keys.
