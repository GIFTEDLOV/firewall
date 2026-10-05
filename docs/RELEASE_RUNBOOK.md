# Release runbook

Gate 1 is local-only. Before any future network write:

1. select the intended explicit network and verify RPC, chain ID, explorer, and deployment metadata;
2. verify source/deployment parity and contract schema;
3. use a dedicated non-production account and measured fee profile;
4. perform the precondition read and persist the prepared call hash;
5. broadcast once, persist the returned hash, and resume by reconciling that same hash after interruption;
6. wait for finality, then independently verify the execution result;
7. read canonical state at the appropriate final snapshot;
8. record the exact source, schema, network alias, chain ID, transaction hash, receipt, and readback.

Never rebroadcast blindly, use a second adjudication to shop for a preferred outcome, treat finality as successful execution, or put a real secret in the repository.

## Firewall write postconditions

| Method | Preconditions | Successful execution result | Canonical readback | Failure state | Safe to retry? | Reconciliation key |
| --- | --- | --- | --- | --- | --- | --- |
| `create_mandate` | Valid proposal identity/content bindings; no caller-controlled protocol authority | `SUCCESS` and new mandate ID | Same draft ID, creator provenance, proposal/text digests and byte length | `EXECUTION_FAILED` or pending journal state | **NO after hash exists** | args hash + sender + chain |
| `freeze_mandate` | Existing caller-owned draft and deterministic prerequisites | `SUCCESS` | Same mandate with immutable `MANDATE_FROZEN` state | `EXECUTION_FAILED` | **NO after hash exists** | mandate ID + frozen-at args hash |
| `commit_execution` | Frozen mandate; all execution/evidence digests present | `SUCCESS` and new execution ID | Same immutable execution ID/bundle binding in `EXECUTION_COMMITTED` | `EXECUTION_FAILED` | **NO after hash exists** | mandate ID + args hash |
| `authenticate_evidence` | Committed execution; exact expected evidence hash/schema/length | `SUCCESS` | Same execution with one immutable authenticated evidence record | `EXECUTION_FAILED` or explicit evidence mismatch | **NO after hash exists** | execution ID + evidence args hash |
| `adjudicate_execution` | Frozen mandate, committed execution, authenticated evidence, unused generation | `SUCCESS` and one adjudication ID | Same generation, seven booleans, and contract-derived verdict | `EXECUTION_FAILED`; malformed consensus is not a business verdict | **NO after hash exists** | execution ID + generation |
| `issue_permit` | Canonical qualifying adjudication and exact permit-binding digest | `SUCCESS` and permit ID | Same permit, full binding, expiry, and active status | `EXECUTION_FAILED` or policy rejection | **NO after hash exists** | execution ID + adjudication ID + binding hash |

`FINALIZED` is only a chain lifecycle observation. The journal reaches
`CANONICAL_SUCCESS` only after execution result `SUCCESS` and method-specific
canonical readback. A restart resumes the same hash; it never creates a new
submission.
