import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const expected = {
  "contracts/firewall.py": "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163",
  "artifacts/firewall.abi.json": "8655da1e0d9618f1994d4f6383c059e054735f614906f86630eaa676147cc0d4",
};

for (const [file, hash] of Object.entries(expected)) {
  const sourceBytes = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const actual = createHash("sha256").update(sourceBytes).digest("hex");
  if (actual !== hash) throw new Error(`${file} SHA-256 changed: ${actual}`);
  console.log(`${file} SHA-256 ${actual}`);
}
