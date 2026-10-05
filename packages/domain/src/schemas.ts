import { z } from "zod";

export const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");
export const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/, "Invalid hex");
export const Hash32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hash");
export const UIntStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/, "Expected an unsigned integer string");
export const ChainIdSchema = z.number().int().positive().safe();
export const TimestampSchema = z.string().datetime({ offset: true });

export const EntityIdSchemas = {
  mandate: z.string().regex(/^MAN-[0-9]{8}$/),
  proposal: z.string().regex(/^PRP-[0-9]{8}$/),
  execution: z.string().regex(/^EXE-[0-9]{8}$/),
  evidence: z.string().regex(/^EVD-[0-9]{8}$/),
  adjudication: z.string().regex(/^ADJ-[0-9]{8}$/),
  permit: z.string().regex(/^PRM-[0-9]{8}$/),
} as const;

export const GovernanceSystemSchema = z.enum(["OPENZEPPELIN_GOVERNOR", "SAFE", "MANUAL_CANONICAL"]);

export const MandateConstraintsSchema = z.object({
  allowedTargets: z.array(AddressSchema),
  forbiddenTargets: z.array(AddressSchema),
  allowedValueTransfer: z.enum(["NONE", "NATIVE", "ERC20", "UNKNOWN"]),
  maximumValue: UIntStringSchema.nullable(),
  allowedSelectors: z.array(HexSchema),
  prohibitedCapabilities: z.array(z.string().min(1)),
  protectedEconomicTerms: z.array(z.string().min(1)),
  protectedAdminAuthorities: z.array(z.string().min(1)),
  protectedOwnership: z.boolean(),
  protectedUpgradeScope: z.boolean(),
}).strict();

export const MandateStateSchema = z.enum(["MANDATE_DRAFT", "MANDATE_FROZEN"]);

export const MandateSchema = z.object({
  mandateId: EntityIdSchemas.mandate,
  governanceSystem: GovernanceSystemSchema,
  governanceChainId: ChainIdSchema,
  governanceContract: AddressSchema,
  proposalExternalId: z.string().min(1),
  proposalHash: Hash32Schema,
  proposalSource: z.string().url(),
  proposalTextSha256: Hash32Schema,
  proposalTextBytes: z.number().int().nonnegative().safe(),
  mandateVersion: z.number().int().positive().safe(),
  createdAt: TimestampSchema,
  frozenAt: TimestampSchema.nullable(),
  state: MandateStateSchema,
  constraints: MandateConstraintsSchema,
  mandateIdentityHash: Hash32Schema,
}).strict();

export const ProposalIdentitySchema = z.object({
  governanceSystem: GovernanceSystemSchema,
  governanceChainId: ChainIdSchema,
  governanceContract: AddressSchema,
  proposalExternalId: z.string().min(1),
  proposalHash: Hash32Schema,
  proposalSource: z.string().url(),
  proposalTextSha256: Hash32Schema,
  proposalTextBytes: z.number().int().nonnegative().safe(),
}).strict();

export const ProxyTypeSchema = z.enum(["NONE", "EIP1967", "BEACON", "TRANSPARENT", "UUPS", "UNKNOWN"]);

export const AbiProvenanceSchema = z.object({
  source: z.enum(["VERIFIED_SOURCE", "KNOWN_PACKAGE", "GOVERNANCE_IMPORT", "OPERATOR_SUPPLIED", "NONE"]),
  sourceUrl: z.string().url().nullable(),
  abiSha256: Hash32Schema.nullable(),
}).strict();

export const TokenEffectSchema = z.object({
  token: AddressSchema.nullable(),
  kind: z.enum(["ERC20_TRANSFER", "ERC20_APPROVE", "ERC20_TRANSFER_FROM", "UNKNOWN_TOKEN_EFFECT"]),
  from: AddressSchema.nullable(),
  to: AddressSchema.nullable(),
  spender: AddressSchema.nullable(),
  amount: UIntStringSchema.nullable(),
}).strict();

export const ExecutionTargetSchema = z.object({
  address: AddressSchema,
  codeHash: Hash32Schema.nullable(),
  proxyType: ProxyTypeSchema,
  implementationAddress: AddressSchema.nullable(),
  implementationCodeHash: Hash32Schema.nullable(),
  knownAbiProvenance: AbiProvenanceSchema,
  selector: HexSchema.nullable(),
  decodedFunctionName: z.string().nullable(),
  decodedArguments: z.array(z.unknown()),
  calldata: HexSchema,
  nativeValue: UIntStringSchema,
  tokenEffects: z.array(TokenEffectSchema),
  dangerousCapabilities: z.array(z.enum([
    "OWNERSHIP_CHANGE",
    "ADMIN_AUTHORITY_CHANGE",
    "UPGRADE",
    "MINT_AUTHORITY",
    "BURN_OPERATION",
    "ROLE_GRANT",
    "ROLE_REVOKE",
    "PAUSE_OPERATION",
    "ADMIN_CHANGE",
    "TREASURY_TRANSFER",
    "DELEGATECALL",
    "CREATE_CONTRACT",
    "SELFDESTRUCT",
    "UNKNOWN_SELECTOR",
    "UNKNOWN_RUNTIME_BEHAVIOR",
  ])),
  unknowns: z.array(z.string().min(1)),
}).strict();

export const ExecutionOperationSchema = z.object({
  order: z.number().int().nonnegative().safe(),
  targetIndex: z.number().int().nonnegative().safe(),
  kind: z.enum(["CALL", "DELEGATECALL", "STATICCALL"]),
}).strict();

export const ExecutionPackageStateSchema = z.enum(["EXECUTION_IMPORTED", "EXECUTION_COMMITTED"]);

export const ExecutionPackageSchema = z.object({
  executionId: EntityIdSchemas.execution,
  mandateId: EntityIdSchemas.mandate,
  chainId: ChainIdSchema,
  targets: z.array(ExecutionTargetSchema).min(1),
  operations: z.array(ExecutionOperationSchema).min(1),
  bundleHash: Hash32Schema,
  calldataValueDigest: Hash32Schema,
  valuesDigest: Hash32Schema.optional(),
  targetSetDigest: Hash32Schema.optional(),
  selectorSetDigest: Hash32Schema.optional(),
  importedAt: TimestampSchema,
  state: ExecutionPackageStateSchema,
}).strict();

export const EvidenceEntrySchema = z.object({
  evidenceId: z.string().min(1),
  authorityType: z.enum(["GOVERNANCE_CONTRACT", "EXECUTION_TARGET", "RPC_PROVIDER", "VERIFIED_SOURCE", "SAFE", "MANUAL_OPERATOR"]),
  authorityId: z.string().min(1),
  sourceUri: z.string().url(),
  sourceHost: z.string().min(1).nullable(),
  chainId: ChainIdSchema,
  proposalIdentityHash: Hash32Schema,
  executionId: EntityIdSchemas.execution,
  contentSha256: Hash32Schema,
  exactByteLength: z.number().int().nonnegative().safe(),
  codeHash: Hash32Schema.nullable(),
  implementationAddress: AddressSchema.nullable(),
  implementationCodeHash: Hash32Schema.nullable(),
  blockNumber: UIntStringSchema.nullable(),
  blockHash: Hash32Schema.nullable(),
  abiProvenance: AbiProvenanceSchema,
  capturedAt: TimestampSchema,
  freshnessExpiresAt: TimestampSchema.nullable(),
  schemaVersion: z.string().min(1),
  role: z.enum(["PROPOSAL", "CALldata", "CODE", "IMPLEMENTATION", "ABI", "RPC_READ", "OTHER"]),
  contentType: z.string().min(1),
}).strict();

export const EvidenceBundleSchema = z.object({
  evidenceId: EntityIdSchemas.evidence,
  mandateId: EntityIdSchemas.mandate,
  executionId: EntityIdSchemas.execution,
  proposalIdentityHash: Hash32Schema,
  entries: z.array(EvidenceEntrySchema).min(1),
  schemaVersion: z.literal("FIREWALL_EVIDENCE_V1"),
  bundleHash: Hash32Schema,
  authenticatedAt: TimestampSchema.nullable(),
  status: z.enum(["PENDING", "AUTHENTICATED", "SOURCE_UNAVAILABLE", "EVIDENCE_MISMATCH"]),
}).strict();

export const SemanticSchemaVersionSchema = z.literal("FIREWALL_MANDATE_V1");

export const SemanticResultSchema = z.object({
  intent_satisfied: z.boolean(),
  scope_expanded: z.boolean(),
  prohibited_effect_present: z.boolean(),
  economic_terms_consistent: z.boolean(),
  administrative_authority_changed: z.boolean(),
  implementation_behavior_consistent: z.boolean(),
  evidence_sufficient: z.boolean(),
}).strict();

export const VerdictSchema = z.enum(["EXECUTION_PERMITTED", "EXECUTION_BLOCKED", "INCONCLUSIVE"]);

export const AdjudicationSchema = z.object({
  adjudicationId: EntityIdSchemas.adjudication,
  mandateId: EntityIdSchemas.mandate,
  executionId: EntityIdSchemas.execution,
  evidenceId: EntityIdSchemas.evidence,
  adjudicationGeneration: z.number().int().positive().safe(),
  semanticSchema: SemanticSchemaVersionSchema,
  result: SemanticResultSchema,
  verdict: VerdictSchema,
  createdAt: TimestampSchema,
}).strict();

export const PermitSchema = z.object({
  permitId: EntityIdSchemas.permit,
  mandateId: EntityIdSchemas.mandate,
  mandateVersion: z.number().int().positive().safe(),
  proposalHash: Hash32Schema,
  executionId: EntityIdSchemas.execution,
  executionBundleHash: Hash32Schema,
  chainId: ChainIdSchema,
  targetsDigest: Hash32Schema,
  valuesDigest: Hash32Schema,
  calldataDigest: Hash32Schema,
  targetCodeHashesDigest: Hash32Schema,
  implementationHashesDigest: Hash32Schema,
  adjudicationId: EntityIdSchemas.adjudication,
  adjudicationGeneration: z.number().int().positive().safe(),
  semanticSchema: SemanticSchemaVersionSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  permitBindingHash: Hash32Schema,
  status: z.enum(["ACTIVE", "EXPIRED", "INVALIDATED"]),
}).strict();

export type Mandate = z.infer<typeof MandateSchema>;
export type GovernanceSystem = z.infer<typeof GovernanceSystemSchema>;
export type MandateConstraints = z.infer<typeof MandateConstraintsSchema>;
export type ProposalIdentity = z.infer<typeof ProposalIdentitySchema>;
export type ExecutionTarget = z.infer<typeof ExecutionTargetSchema>;
export type ExecutionPackage = z.infer<typeof ExecutionPackageSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type EvidenceEntry = z.infer<typeof EvidenceEntrySchema>;
export type SemanticResult = z.infer<typeof SemanticResultSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Adjudication = z.infer<typeof AdjudicationSchema>;
export type Permit = z.infer<typeof PermitSchema>;

export const EvidenceStatusSchema = z.enum(["PENDING", "AUTHENTICATED", "SOURCE_UNAVAILABLE", "EVIDENCE_MISMATCH"]);
