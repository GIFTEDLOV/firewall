import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: {
    "@firewall/shared": resolve("../shared/src/index.ts"),
    "@firewall/domain": resolve("../domain/src/index.ts"),
    "@firewall/policy-engine": resolve("../policy-engine/src/index.ts"),
    "@firewall/evidence": resolve("../evidence/src/index.ts"),
    "@firewall/evm-analyzer": resolve("../evm-analyzer/src/index.ts"),
    "@firewall/governance-adapters": resolve("../governance-adapters/src/index.ts"),
    "@firewall/indexer": resolve("../indexer/src/index.ts"),
  } },
  test: { include: ["src/**/*.test.ts"], passWithNoTests: true },
});
