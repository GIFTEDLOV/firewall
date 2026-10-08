import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const expected = {
  "contracts/firewall.py": "2b9396f217880a5cdc8a3b4c7adcdce9e3b7ad2cdf975cb847165ce258645735",
  "artifacts/firewall.abi.json": "928b03e2f1c768794a95f2101609984673c8ac7118587cfe4d5ca4bfddfbaecc",
};

for (const [file, hash] of Object.entries(expected)) {
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actual !== hash) throw new Error(`${file} SHA-256 changed: ${actual}`);
  console.log(`${file} SHA-256 ${actual}`);
}
