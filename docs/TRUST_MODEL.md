# Trust model

Firewall has two authorities:

1. deterministic contract logic owns identities, binding, lifecycle,
   prerequisites, replay protection, policy derivation, permit expiry, and
   public canonical state;
2. GenLayer consensus owns only the irreducibly semantic comparison between a
   frozen mandate and authenticated execution evidence.

The semantic contract is `FIREWALL_MANDATE_V1` and contains exactly seven
booleans. It has no confidence, prose, risk score, addresses, amounts,
recommendations, or verdict field. The contract derives the verdict. A backend,
wallet, deployer, creator, or frontend cannot force it.

Proposal text, ABI labels, source comments, code metadata, and execution data
are delimited untrusted data. Embedded instructions cannot modify the task,
schema, authority, identifiers, or policy. Malformed semantic output reverts;
off-chain parsers also fail closed.
