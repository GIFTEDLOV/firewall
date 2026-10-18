// V3.9 replaces the rate-limited Tenderly receipt path with PublicNode state
// reads cross-bound to Blockscout's independent Sepolia transaction/log API.
process.env.FIREWALL_V3_SOURCE_PATH = "contracts/firewall_v3_9_prospective.py";
process.env.FIREWALL_V3_SOURCE_SHA256 = "9bf5631b8f537cbe27bd82457db055c016fc53e0f8499a22223424189b66b3a3";
process.env.FIREWALL_V3_SCHEMA_PATH = "artifacts/firewall_v3_9_prospective.schema.json";
process.env.FIREWALL_V3_JOURNAL_PATH = "evidence/qualification/current/firewall-studionet-v3-9-publicnode-blockscout-transactions.json";
await import("./firewall_studionet_v3_runner.js");
