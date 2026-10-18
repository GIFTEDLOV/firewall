import { describe, expect, it, vi } from "vitest";
import { CANONICAL_CONTRACT_ADDRESS, CANONICAL_CHAIN_ID, CANONICAL_EVIDENCE_SCHEMA, CANONICAL_RPC_URL, CANONICAL_SEMANTIC_SCHEMA, CANONICAL_SOURCE_SHA256, GenLayerCanonicalReader, canonicalConfigFromEnv } from "./canonical-reader.js";
import { FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256 } from "./network-config.js";

const digest = "0x" + "11".repeat(32);
const expectedFacts = JSON.stringify({ schema: CANONICAL_EVIDENCE_SCHEMA, chain_id: 1, transaction_hash: "0x" + "22".repeat(32) });
const authenticatedFacts = JSON.stringify({ schema: CANONICAL_EVIDENCE_SCHEMA, chain_id: 1, finality: "HISTORICAL", receipt_status: "SUCCESS", execution_outcome: "SAFE_EXECUTION_SUCCESS" });

function rawState(functionName: string): unknown {
  if (functionName === "get_evidence_schema") return CANONICAL_EVIDENCE_SCHEMA;
  if (functionName === "get_semantic_schema") return CANONICAL_SEMANTIC_SCHEMA;
  if (functionName === "get_semantic_keys") return ["intent_satisfied", "scope_expanded", "prohibited_effect_present", "economic_terms_consistent", "administrative_authority_changed", "implementation_behavior_consistent", "evidence_sufficient"];
  if (functionName === "get_mandates") return [{ creator: CANONICAL_CONTRACT_ADDRESS, governance_chain_id: 1, governance_contract: CANONICAL_CONTRACT_ADDRESS, proposal_external_id: "proposal-1", proposal_hash: digest, proposal_source: "https://example.test/proposal-1", proposal_text: "No authority change.", proposal_text_sha256: digest, proposal_text_bytes: 19, mandate_version: 1, mandate_digest: digest, state: "MANDATE_FROZEN", frozen_at: 100, mandate_id: "MAN-00000001" }];
  if (functionName === "get_executions") return [{ execution_id: "EXE-00000001", mandate_id: "MAN-00000001", chain_id: 1, expected_facts: expectedFacts, source_a: "https://a.example.test/tx", source_b: "https://b.example.test/tx", state: "ADJUDICATED", evidence_json: authenticatedFacts, evidence_status: "VERIFIED_POST_EXECUTION", generation: 1 }];
  if (functionName === "get_adjudications") return [{ adjudication_id: "ADJ-00000001", execution_id: "EXE-00000001", generation: 1, intent_satisfied: true, scope_expanded: false, prohibited_effect_present: false, economic_terms_consistent: true, administrative_authority_changed: false, implementation_behavior_consistent: true, evidence_sufficient: true, verdict: "EXECUTION_PERMITTED" }];
  if (functionName === "get_permits") return [{ permit_id: "PRM-00000001", mandate_id: "MAN-00000001", mandate_version: 1, proposal_hash: digest, execution_id: "EXE-00000001", adjudication_id: "ADJ-00000001", generation: 1, issued_at: 120, expires_at: 86520, binding_hash: digest, status: "ACTIVE" }];
  if (functionName === "get_permit_status") return "EXPIRED";
  throw new Error(`unexpected method ${functionName}`);
}

describe("canonical GenLayer V2 reader", () => {
  it("defaults an unset application config to Studionet and requires an explicit alias for the shared 4221 chain ID", () => {
    expect(canonicalConfigFromEnv({ FIREWALL_CONTRACT_ADDRESS: CANONICAL_CONTRACT_ADDRESS, FIREWALL_CHAIN_ID: String(CANONICAL_CHAIN_ID), FIREWALL_RPC_URL: CANONICAL_RPC_URL })).toEqual({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL, networkAlias: "studionet", expectedSourceSha256: CANONICAL_SOURCE_SHA256 });
    expect(canonicalConfigFromEnv({})).toEqual({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL, networkAlias: "studionet", expectedSourceSha256: CANONICAL_SOURCE_SHA256 });
    expect(() => canonicalConfigFromEnv({ FIREWALL_RPC_URL: "https://studio-dev.genlayer.com/api" })).toThrow();
    expect(() => canonicalConfigFromEnv({ FIREWALL_CHAIN_ID: "4221", FIREWALL_RPC_URL: "https://rpc-bradbury.genlayer.com", FIREWALL_BRADBURY_CONTRACT_ADDRESS: CANONICAL_CONTRACT_ADDRESS })).toThrow("GENLAYER_NETWORK_ALIAS_REQUIRED_FOR_SHARED_CHAIN_ID");
  });

  it("binds a Bradbury configuration to its exact RPC, deployment address, and alias", () => {
    expect(canonicalConfigFromEnv({ FIREWALL_NETWORK_ALIAS: "testnet-bradbury", FIREWALL_BRADBURY_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111" })).toEqual({
      contractAddress: "0x1111111111111111111111111111111111111111",
      chainId: 4221,
      rpcUrl: "https://rpc-bradbury.genlayer.com",
      networkAlias: "testnet-bradbury",
      expectedSourceSha256: expect.any(String),
    });
    expect(() => canonicalConfigFromEnv({ FIREWALL_NETWORK_ALIAS: "testnet-bradbury", FIREWALL_CHAIN_ID: "4221", FIREWALL_RPC_URL: "https://rpc-asimov.genlayer.com", FIREWALL_BRADBURY_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111" })).toThrow("CANONICAL_CONFIG_NETWORK_RPC_MISMATCH");
  });

  it("allows only the pinned Sepolia candidate source for an alternate Studionet contract", () => {
    expect(canonicalConfigFromEnv({
      FIREWALL_NETWORK_ALIAS: "studionet",
      FIREWALL_STUDIONET_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
      FIREWALL_CONTRACT_SOURCE_SHA256: FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256,
    })).toMatchObject({ contractAddress: "0x1111111111111111111111111111111111111111", expectedSourceSha256: FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256, chainId: 61999, rpcUrl: "https://studio.genlayer.com/api" });
    expect(() => canonicalConfigFromEnv({ FIREWALL_NETWORK_ALIAS: "studionet", FIREWALL_STUDIONET_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111" })).toThrow("GENLAYER_CONTRACT_DOES_NOT_MATCH_NETWORK_MANIFEST");
  });

  it("reads the deployed V2 view shapes and derives evidence only from the authenticated execution record", async () => {
    const calls: string[] = [];
    const reader = new GenLayerCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL }, async ({ functionName }) => { calls.push(functionName); return rawState(functionName); });
    const model = await reader.read();
    expect(model.status).toBe("READY");
    expect(model.evidenceSchema).toBe(CANONICAL_EVIDENCE_SCHEMA);
    expect(model.semanticSchema).toBe(CANONICAL_SEMANTIC_SCHEMA);
    expect(model.mandates[0]?.mandateId).toBe("MAN-00000001");
    expect(model.executions[0]?.expectedFacts).toBe(expectedFacts);
    expect(model.evidence[0]?.factsJson).toBe(authenticatedFacts);
    expect(model.adjudications[0]?.verdict).toBe("EXECUTION_PERMITTED");
    expect(model.permits[0]?.bindingHash).toBe(digest);
    expect(model.permitStatuses["PRM-00000001"]).toBe("EXPIRED");
    expect(calls).toEqual(expect.arrayContaining(["get_evidence_schema", "get_mandates", "get_executions", "get_adjudications", "get_permits", "get_permit_status", "get_semantic_schema", "get_semantic_keys"]));
    expect(calls).not.toContain("get_evidence");
  });

  it("rejects a stored evidence object that is not bound to the execution's schema and chain", async () => {
    const reader = new GenLayerCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL }, async ({ functionName }) => {
      const value = rawState(functionName);
      if (functionName !== "get_executions") return value;
      return [{ ...(value as Record<string, unknown>[])[0], evidence_json: JSON.stringify({ schema: "WRONG", chain_id: 1 }) }];
    });
    await expect(reader.read()).rejects.toThrow("CANONICAL_READ_INVALID:evidence_binding");
  });

  it("runs deployed bytecode and schema verification before trusting canonical reads", async () => {
    const verifyDeployment = vi.fn(async () => undefined);
    const reader = new GenLayerCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL }, async ({ functionName }) => rawState(functionName), verifyDeployment);
    await reader.read();
    expect(verifyDeployment).toHaveBeenCalledOnce();
  });

  it("serializes canonical view calls to avoid concurrent RPC reads", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const reader = new GenLayerCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL }, async ({ functionName }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return rawState(functionName);
    });
    await reader.read();
    expect(maxInFlight).toBe(1);
  });
});
