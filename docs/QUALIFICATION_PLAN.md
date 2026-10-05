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

## Gate 3 local qualification record

The no-write production-shaped environment is GLSim on `127.0.0.1:4010`,
chain `61127`, five validators, the exact `v0.6.0-rc2` runner, and a
controlled LLM response. `tests/integration/test_glsim_qualification.py`
executes one compliant and one malicious case. It asserts finalized execution
results, canonical readback, the exact seven-field semantic vector, the
permit binding, and absence of a permit for the blocked case. It sets
`result_shopping` to `false` and does not repeat adjudication to seek a result.

## Future Studio-dev live proof (not executed in Gate 3)

Use one explicitly selected `studio-dev` deployment and a dedicated account.
Persist the source hash, ABI hash, chain ID, RPC alias, deployment transaction
hash, and canonical deployment readback before any workflow call.

1. Read deployment code/schema and verify source/deployment parity.
2. Create one compliant mandate, then freeze it.
3. Commit the compliant execution and authenticate its evidence.
4. Adjudicate once and read back the seven booleans and derived result.
5. Issue the permit only if canonical readback is `EXECUTION_PERMITTED`; verify
   every protected permit binding field and status.
6. Against the same frozen mandate, commit a distinct malicious execution,
   authenticate its evidence, adjudicate once, and prove
   `EXECUTION_BLOCKED` with zero permit records.
7. Reconcile each write by its original transaction hash, verify execution
   result separately from finality, and perform canonical readback after each
   postcondition.

No deliberate revert transaction is required. Direct Mode and local GLSim
already prove the guards; the live proof is for deployment, wallet, consensus,
finality, execution-result, and canonical-readback closure.
