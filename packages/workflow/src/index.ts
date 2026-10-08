import { createHash } from "node:crypto";
import { z } from "zod";
import { EvidenceBundleSchema, ExecutionPackageSchema, MandateSchema, mandateIdentityHash, type EvidenceBundle, type ExecutionPackage, type Mandate } from "@firewall/domain";
import { authenticateEvidenceBundle } from "@firewall/evidence";
import { analyzeExecutionPackage, compareExecutionToMandate, detectDeterministicViolations, type AnalyzeCallInput } from "@firewall/evm-analyzer";
import { ManualCanonicalAdapter, OpenZeppelinGovernorAdapter, SafeAdapter } from "@firewall/governance-adapters";
import { deriveReasons, deriveVerdict } from "@firewall/policy-engine";
import { formatEntityId } from "@firewall/shared";
import type { CanonicalReadModel, CanonicalStateReader } from "@firewall/indexer";

export const LOCAL_WORKFLOW_SCOPE = "LOCAL_PRECHAIN_ANALYSIS" as const;
export const LOCAL_ANALYSIS_CHAIN_ID = 61127 as const;

const CreateMandateRequestSchema = z.object({
  adapter: z.enum(["OPENZEPPELIN_GOVERNOR", "SAFE", "MANUAL_CANONICAL"]),
  proposal: z.unknown(),
  constraints: MandateSchema.shape.constraints,
  mandateVersion: z.number().int().positive(),
}).strict();

export type LocalWorkflowState = {
  readonly mandates: Map<string, Mandate>;
  readonly executions: Map<string, ExecutionPackage>;
  readonly evidence: Map<string, EvidenceBundle>;
  readonly canonical: CanonicalStateReader;
};

function sha256(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}` as `0x${string}`;
}

export class FirewallApplicationService {
  private mandateSequence = 1;
  private executionSequence = 1;
  constructor(private readonly state: LocalWorkflowState) {}

  async readModel(): Promise<CanonicalReadModel & { localDrafts: Mandate[]; localExecutions: ExecutionPackage[] }> {
    const canonical = await this.state.canonical.read();
    return { ...canonical, localDrafts: [...this.state.mandates.values()], localExecutions: [...this.state.executions.values()] };
  }

  createMandate(body: unknown): Mandate {
    const input = CreateMandateRequestSchema.parse(body);
    const proposal = input.proposal as Record<string, unknown>;
    const imported = input.adapter === "OPENZEPPELIN_GOVERNOR"
      ? new OpenZeppelinGovernorAdapter().normalize(proposal as never)
      : input.adapter === "SAFE"
        ? new SafeAdapter().normalize(proposal as never)
        : new ManualCanonicalAdapter().normalize(proposal as never);
    const mandateId = formatEntityId("MAN", this.mandateSequence++);
    const createdAt = new Date().toISOString();
    return MandateSchema.parse({
      mandateId,
      governanceSystem: imported.governanceSystem,
      governanceChainId: imported.governanceChainId,
      governanceContract: imported.governanceContract,
      proposalExternalId: imported.proposalExternalId,
      proposalHash: imported.proposalHash,
      proposalSource: imported.proposalSource,
      proposalTextSha256: imported.proposalTextSha256,
      proposalTextBytes: imported.proposalTextBytes,
      mandateVersion: input.mandateVersion,
      createdAt,
      frozenAt: null,
      state: "MANDATE_DRAFT",
      constraints: input.constraints,
      mandateIdentityHash: mandateIdentityHash({ ...imported, mandateVersion: input.mandateVersion, constraints: input.constraints }),
    });
  }

  saveMandate(mandate: Mandate): Mandate {
    if (this.state.mandates.has(mandate.mandateId)) throw new Error("MANDATE_ID_REUSE");
    this.state.mandates.set(mandate.mandateId, mandate);
    return mandate;
  }

  getMandate(id: string): Mandate | null { return this.state.mandates.get(id) ?? null; }
  getExecution(id: string): ExecutionPackage | null { return this.state.executions.get(id) ?? null; }

  freezeMandate(id: string, frozenAt = new Date().toISOString()): Mandate {
    const current = this.state.mandates.get(id);
    if (!current) throw new Error("MANDATE_NOT_FOUND");
    if (current.state !== "MANDATE_DRAFT") throw new Error("MANDATE_ALREADY_FROZEN");
    const frozen = MandateSchema.parse({ ...current, frozenAt, state: "MANDATE_FROZEN" });
    this.state.mandates.set(id, frozen);
    return frozen;
  }

  analyzeExecution(input: { mandateId: string; chainId: number; targets: AnalyzeCallInput[]; operations: ExecutionPackage["operations"]; importedAt?: string }): { execution: ExecutionPackage; assessment: ReturnType<typeof compareExecutionToMandate>; deterministic: ReturnType<typeof detectDeterministicViolations> } {
    const mandate = this.state.mandates.get(input.mandateId);
    if (!mandate || mandate.state !== "MANDATE_FROZEN") throw new Error("MANDATE_NOT_FROZEN");
    const execution = analyzeExecutionPackage({ executionId: formatEntityId("EXE", this.executionSequence++), mandateId: input.mandateId, chainId: input.chainId, targets: input.targets, operations: input.operations, importedAt: input.importedAt ?? new Date().toISOString() });
    const assessment = compareExecutionToMandate(mandate, execution);
    const deterministic = detectDeterministicViolations(mandate, execution);
    this.state.executions.set(execution.executionId, execution);
    return { execution, assessment, deterministic };
  }

  authenticateEvidence(input: unknown): EvidenceBundle {
    const parsed = EvidenceBundleSchema.parse(input);
    const { bundleHash: _bundleHash, authenticatedAt: _authenticatedAt, status: _status, ...base } = parsed;
    const evidence = authenticateEvidenceBundle({ ...base, authenticatedAt: new Date().toISOString() });
    if (evidence.executionId !== parsed.executionId) throw new Error("EVIDENCE_EXECUTION_BINDING_MISMATCH");
    this.state.evidence.set(evidence.evidenceId, evidence);
    return evidence;
  }

  predictSemanticResult(result: unknown) {
    const verdict = deriveVerdict(result as never);
    return { verdict, reasons: deriveReasons(result as never), canonical: false };
  }
}

export function createLocalWorkflowState(canonical: CanonicalStateReader): LocalWorkflowState {
  return { mandates: new Map(), executions: new Map(), evidence: new Map(), canonical };
}

export function createLocalWorkflowRuntime(canonical: CanonicalStateReader) {
  return new FirewallApplicationService(createLocalWorkflowState(canonical));
}

export function hashLocalText(value: string): `0x${string}` {
  return sha256(value);
}
