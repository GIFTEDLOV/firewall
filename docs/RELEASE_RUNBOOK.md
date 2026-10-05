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
