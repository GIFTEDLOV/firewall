# Security policy

Firewall is a security product and its canonical contract is frozen for this
release. Please do not disclose a suspected vulnerability by creating a public
issue with exploit details.

Report privately to the repository maintainers with:

- affected component and commit or release;
- a minimal reproducible case;
- security impact and any required chain context;
- whether the issue concerns canonical state, local analysis, or presentation.

Do not include private keys, access tokens, or unredacted sensitive evidence.

## Trust boundary

The canonical contract is the only authority for mandates, executions,
evidence, adjudications, and permits. The web app performs read-only canonical
reads. `/local/*` and the workflow API are off-chain, pre-chain analysis only;
they cannot create canonical permits or adjudications. An unavailable or
malformed RPC response is an explicit unavailable state, never a fixture
fallback.

The exact seven-field semantic schema and fail-closed rule are documented in
[`docs/FINAL_AUDIT.md`](docs/FINAL_AUDIT.md). Historical qualification and
release records are preserved under `provenance/`.
