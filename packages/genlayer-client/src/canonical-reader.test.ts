import { describe, expect, it } from "vitest";
import { CANONICAL_CONTRACT_ADDRESS, CANONICAL_CHAIN_ID, CANONICAL_RPC_URL, GenLayerCanonicalReader, canonicalConfigFromEnv } from "./canonical-reader.js";

const digest = "0x" + "11".repeat(32);

function rawState(functionName: string): unknown {
  if (functionName === "get_semantic_schema") return "FIREWALL_MANDATE_V1";
  if (functionName === "get_semantic_keys") return ["intent_satisfied", "scope_expanded", "prohibited_effect_present", "economic_terms_consistent", "administrative_authority_changed", "implementation_behavior_consistent", "evidence_sufficient"];
  if (functionName === "get_mandates") return [{ creator: CANONICAL_CONTRACT_ADDRESS, frozen_at: 100, governance_chain_id: 61997, governance_contract: CANONICAL_CONTRACT_ADDRESS, mandate_digest: digest, mandate_id: "MAN-00000001", mandate_version: 1, proposal_external_id: "proposal-1", proposal_hash: digest, proposal_source: "https://example.test/proposal-1", proposal_text: "No authority change.", proposal_text_bytes: 19, proposal_text_sha256: digest, state: "MANDATE_FROZEN" }];
  if (functionName === "get_executions") return [{ bundle_hash: digest, calldata_digest: digest, chain_id: 61997, code_facts_digest: digest, evidence_hash: digest, execution_id: "EXE-00000001", expected_evidence_hash: digest, generation: 1, implementation_hashes_digest: digest, mandate_id: "MAN-00000001", semantic_input: "controlled", state: "ADJUDICATED", target_code_hashes_digest: digest, targets_digest: digest, values_digest: digest }];
  if (functionName === "get_evidence") return [{ authenticated_at: 101, authority_digest: digest, content_sha256: digest, evidence_hash: digest, exact_byte_length: 19, execution_id: "EXE-00000001", schema_version: "FIREWALL_EVIDENCE_V1", source_digest: digest }];
  if (functionName === "get_adjudications") return [{ adjudication_id: "ADJ-00000001", administrative_authority_changed: false, created_at: 102, economic_terms_consistent: true, evidence_hash: digest, evidence_sufficient: true, execution_id: "EXE-00000001", generation: 1, implementation_behavior_consistent: true, intent_satisfied: true, mandate_id: "MAN-00000001", prohibited_effect_present: false, scope_expanded: false, semantic_schema: "FIREWALL_MANDATE_V1", verdict: "EXECUTION_PERMITTED" }];
  if (functionName === "get_permits") return [{ adjudication_generation: 1, adjudication_id: "ADJ-00000001", calldata_digest: digest, chain_id: 61997, execution_bundle_hash: digest, execution_id: "EXE-00000001", expires_at: 86520, implementation_hashes_digest: digest, issued_at: 120, mandate_id: "MAN-00000001", mandate_version: 1, permit_binding_hash: digest, permit_id: "PRM-00000001", proposal_hash: digest, semantic_schema: "FIREWALL_MANDATE_V1", status: "ACTIVE", target_code_hashes_digest: digest, targets_digest: digest, values_digest: digest }];
  if (functionName === "get_permit_status") return "EXPIRED";
  throw new Error(`unexpected method ${functionName}`);
}

describe("canonical GenLayer reader", () => {
  it("requires the pinned production read configuration", () => {
    expect(canonicalConfigFromEnv({ FIREWALL_CONTRACT_ADDRESS: CANONICAL_CONTRACT_ADDRESS, FIREWALL_CHAIN_ID: String(CANONICAL_CHAIN_ID), FIREWALL_RPC_URL: CANONICAL_RPC_URL })).toEqual({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL });
    expect(() => canonicalConfigFromEnv({})).toThrow("CANONICAL_CONFIG_INVALID");
  });

  it("reads and normalizes every required public view without writing", async () => {
    const calls: string[] = [];
    const reader = new GenLayerCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL }, async ({ functionName }) => { calls.push(functionName); return rawState(functionName); });
    const model = await reader.read(200);
    expect(model.status).toBe("READY");
    expect(model.semanticSchema).toBe("FIREWALL_MANDATE_V1");
    expect(model.mandates).toHaveLength(1);
    expect(model.executions).toHaveLength(1);
    expect(model.evidence).toHaveLength(1);
    expect(model.adjudications).toHaveLength(1);
    expect(model.permits).toHaveLength(1);
    expect(model.permitStatuses["PRM-00000001"]).toBe("EXPIRED");
    expect(calls).toEqual(expect.arrayContaining(["get_mandates", "get_executions", "get_evidence", "get_adjudications", "get_permits", "get_permit_status", "get_semantic_schema", "get_semantic_keys"]));
  });
});
