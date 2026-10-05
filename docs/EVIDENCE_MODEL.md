# Evidence model

Evidence is divided into four separately auditable layers:

- **Identity:** `evidence_id`, `mandate_id`, `execution_id`, proposal identity,
  schema version.
- **Authority:** authority type and authority identifier; on-chain target,
  code hash, implementation address/hash, block number/hash where available.
- **Transport:** source URI and host, capture time, freshness expiry. A URL is
  transport only and never serves as identity.
- **Content:** SHA-256 and exact byte length for the captured bytes.

The package is `FIREWALL_EVIDENCE_V1`. Its lifecycle is `PENDING`,
`AUTHENTICATED`, `SOURCE_UNAVAILABLE`, or `EVIDENCE_MISMATCH`. Infrastructure
states never become a semantic `BLOCKED` or `PERMITTED` result. Authentication
requires the evidence hash committed with the execution, exact execution and
chain bindings, schema, digest, and byte length. Once written, the evidence
record is append-only.

RPC reads and source lookups are orchestration inputs. Canonical application
state comes only from the Intelligent Contract readback.
