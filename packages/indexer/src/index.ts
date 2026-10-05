import type { Adjudication, ExecutionPackage, Mandate, Permit } from "@firewall/domain";

export type CanonicalReadModel = {
  readonly mandates: readonly Mandate[];
  readonly executions: readonly ExecutionPackage[];
  readonly adjudications: readonly Adjudication[];
  readonly permits: readonly Permit[];
  readonly asOf: string;
};

export interface CanonicalStateReader {
  read(): Promise<CanonicalReadModel>;
}

/** Backend/indexer data is a cache only; callers must compare it to this canonical reader. */
export function canonicalReadModelIsAuthoritative(_model: CanonicalReadModel): false {
  return false;
}
