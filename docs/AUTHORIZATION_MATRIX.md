# Firewall Gate 2 authorization matrix

Firewall has no global owner. Mandate creators are stored for provenance and
may freeze only their own draft; that scoped capability cannot alter another
mandate or any semantic result.

| Method | Caller rule | Why | Can owner override? | Business authority |
|---|---|---|---|---|
| `create_mandate` | Permissionless | Capture a candidate governance identity | No global owner exists | Canonical identity and immutable draft fields |
| `freeze_mandate` | Mandate creator only | The creator confirms deterministic prerequisites | No | Frozen content, not outcome |
| `commit_execution` | Permissionless after frozen mandate | Bind a new immutable package identity | No | Package digests and mandate state |
| `authenticate_evidence` | Permissionless; exact committed evidence hash required | Bind authority/source/content/schema/length once | No | Immutable evidence binding |
| `adjudicate_execution` | Permissionless; execution identifier only | Run GenLayer consensus over canonical stored inputs | No | Seven-field consensus vector, then contract policy |
| `issue_permit` | Permissionless; execution/adjudication identifiers only | Materialize an already qualifying result | No | Deterministic policy and exact permit binding |
| `get_*` views | Permissionless | Public auditability | No | Canonical contract readback |

No write accepts semantic booleans, a verdict, a permit decision, replacement
execution facts, or a history deletion request. The contract does not expose a
record-adjudication escape hatch.
