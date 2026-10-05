import type { CanonicalReadModel, CanonicalStateReader } from "@firewall/indexer";

export type FirewallApiDependencies = {
  readonly canonical: CanonicalStateReader;
};

export function createFirewallApi(dependencies: FirewallApiDependencies) {
  return {
    async getCanonicalReadModel(): Promise<CanonicalReadModel> {
      return dependencies.canonical.read();
    },
    authority: "CANONICAL_CONTRACT_ONLY" as const,
  };
}

/** No HTTP listener is started by Gate 1; this is the orchestration boundary for the next gate. */
export function createEmptyCanonicalReader(): CanonicalStateReader {
  return {
    async read() {
      return { mandates: [], executions: [], adjudications: [], permits: [], asOf: new Date(0).toISOString() };
    },
  };
}
