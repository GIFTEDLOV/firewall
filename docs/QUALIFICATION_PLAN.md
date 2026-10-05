# Qualification plan

Every release candidate must prove the following without treating a passing UI build as protocol evidence:

1. static AST and GenVM validation;
2. schema extraction matches the checked-in contract interface;
3. deterministic hash vectors are stable across Node and Python fixtures;
4. Direct Mode state transitions and invariants pass;
5. adversarial fixtures fail closed for mutation, replay, stale permit, unknown facts, and extra model keys;
6. property and mutation tests cover state machine transitions and policy truth table;
7. evidence, authority, ABI, code, proxy, and implementation bindings reconcile;
8. write lifecycle tests prove one broadcast and same-hash reconciliation;
9. hosted/full-consensus tests verify decision, finality, execution result, and canonical readback separately;
10. browser tests verify the frontend does not invent protocol state or hide unknown/pending/error states;
11. secret/provenance and source/deployment parity checks pass.
