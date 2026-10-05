# State machine

The protocol uses separate append-only records and the smallest useful gates:

```text
MANDATE_DRAFT -> MANDATE_FROZEN
EXECUTION_COMMITTED -> EVIDENCE_AUTHENTICATED -> ADJUDICATED
ADJUDICATED -> (EXECUTION_PERMITTED | EXECUTION_BLOCKED | INCONCLUSIVE)
PERMIT_NONE -> PERMIT_ISSUED -> PERMIT_EXPIRED
```

`adjudicate_execution` requires a frozen mandate, a committed execution, an
authenticated exact evidence hash, and generation zero. It creates exactly one
generation-one append-only adjudication. New execution facts require a new
execution identity; result shopping is not a supported transition.

`issue_permit` requires the exact execution, matching adjudication generation,
`EXECUTION_PERMITTED`, and the fixed semantic schema. It derives expiry as
`issued_at + 86400`; the caller cannot choose expiry or alter the protected
binding fields.

The following attacks are rejected by state guards: early adjudication, early
permit, double freeze, duplicate execution commit replacement, evidence
overwrite, duplicate same-generation adjudication, generation rollback,
cross-execution adjudication, cross-mandate permit, and terminal history
mutation. Finalization of a transaction is never treated as execution success;
the transaction journal separately requires execution result and canonical
readback.
