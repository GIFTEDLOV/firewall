export type CanonicalReadModelState = {
  readonly status: "UNAVAILABLE";
  readonly reason: "CANONICAL_CONTRACT_READ_NOT_CONFIGURED";
  readonly mandates: readonly [];
  readonly executions: readonly [];
  readonly adjudications: readonly [];
  readonly permits: readonly [];
};

/** Typed empty state; it is not a protocol snapshot and must not be rendered as one. */
export const emptyCanonicalReadModel: CanonicalReadModelState = {
  status: "UNAVAILABLE",
  reason: "CANONICAL_CONTRACT_READ_NOT_CONFIGURED",
  mandates: [],
  executions: [],
  adjudications: [],
  permits: [],
};
