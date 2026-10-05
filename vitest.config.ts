import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: {
    "@firewall/shared": resolve("packages/shared/src/index.ts"),
    "@firewall/domain": resolve("packages/domain/src/index.ts"),
    "@firewall/policy-engine": resolve("packages/policy-engine/src/index.ts"),
    "@firewall/evidence": resolve("packages/evidence/src/index.ts"),
    "@firewall/evm-analyzer": resolve("packages/evm-analyzer/src/index.ts"),
  } },
  test: {
    include: ["packages/**/src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: false,
  },
});
