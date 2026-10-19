import { describe, expect, it } from "vitest";
import { ManualCanonicalAdapter, OpenZeppelinGovernorAdapter, SafeAdapter, SAFE_TX_TYPES, decodeMultiSend, safeTransactionHashFor, verifyGovernorProposal, verifySafeTransactionBundle } from "./index.js";
import { hashUtf8 } from "@firewall/shared";
import { privateKeyToAccount } from "viem/accounts";

const address = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;

describe("governance adapters", () => {
  it("normalizes the complete Governor identity and rejects length mismatch", () => {
    const value = new OpenZeppelinGovernorAdapter().normalize({ chainId: 1, governor: address, proposalId: "7", targets: [address], values: ["0"], calldatas: ["0x12345678"], description: "Upgrade", proposalSource: "https://governance.example/7" });
    expect(value.provenance).toBe("GOVERNANCE_UNVERIFIED");
    expect(value.proposalTextBytes).toBe(7);
    expect(() => new OpenZeppelinGovernorAdapter().normalize({ chainId: 1, governor: address, proposalId: "7", targets: [address], values: [], calldatas: ["0x12345678"], description: "Upgrade", proposalSource: "https://governance.example/7" })).toThrow("GOVERNOR_ARRAY_LENGTH_MISMATCH");
  });

  it("labels manual imports unverified and binds exact text bytes/hash", () => {
    const adapter = new ManualCanonicalAdapter();
    const text = "Manual mandate";
    const result = adapter.normalize({ governanceSystem: "MANUAL_CANONICAL", governanceChainId: 1, governanceContract: address, proposalExternalId: "manual", proposalHash: hash, proposalSource: "https://operator.example/manual", proposalTextSha256: hashUtf8(text), proposalTextBytes: new TextEncoder().encode(text).byteLength, proposalText: text });
    expect(result.provenance).toBe("MANUAL_UNVERIFIED");
    expect(() => adapter.normalize({ ...result, proposalTextSha256: hash })).toThrow("MANUAL_PROPOSAL_CONTENT_BINDING_MISMATCH");
  });

  it("normalizes Safe and decodes valid MultiSend records", () => {
    const safe = new SafeAdapter().normalize({ chainId: 1, safe: address, externalId: "safe-1", transactions: [{ to: address, value: "0", data: "0x12345678", operation: 0, nonce: 1 }], proposalSource: "https://safe.example/tx/1" });
    expect(safe.provenance).toBe("SAFE_UNVERIFIED");
    const record = `00${"01".repeat(20)}${"00".repeat(32)}${("04").padStart(64, "0")}${"12345678"}`;
    expect(decodeMultiSend(`0x8d80ff0a${record}` as `0x${string}`)).toHaveLength(1);
    expect(() => decodeMultiSend("0x8d80ff0a00" as `0x${string}`)).toThrow("SAFE_MULTISEND_MALFORMED");
  });

  it("only promotes Governor and Safe provenance after chain facts verify", async () => {
    const governorInput = { chainId: 1, governor: address, proposalId: "7", targets: [address] as const, values: ["0"] as const, calldatas: ["0x12345678"] as const, description: "Upgrade", proposalSource: "https://governance.example/7" };
    const governor = await verifyGovernorProposal(governorInput, { getChainId: async () => 1, getCode: async () => "0x6000", readContract: async () => 7n });
    expect(governor.provenance).toBe("GOVERNANCE_AUTHENTICATED");
    await expect(verifyGovernorProposal(governorInput, { getChainId: async () => 5, getCode: async () => "0x6000", readContract: async () => 7n })).rejects.toThrow("GOVERNOR_CHAIN_ID_MISMATCH");
    const signer = privateKeyToAccount("0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce036f9a2c1e5c84a5b4d6d");
    const unsignedSafeInput = { chainId: 1, safe: address, externalId: "safe-1", transactions: [{ to: address, value: "0", data: "0x12345678" as `0x${string}`, operation: 0 as const, nonce: 4 }], proposalSource: "https://safe.example/tx/1" };
    const safeHash = safeTransactionHashFor(1, address, unsignedSafeInput.transactions[0]!);
    const signature = await signer.signTypedData({ domain: { chainId: 1, verifyingContract: address }, types: SAFE_TX_TYPES, primaryType: "SafeTx", message: { to: address, value: 0n, data: "0x12345678", operation: 0, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: "0x0000000000000000000000000000000000000000", refundReceiver: "0x0000000000000000000000000000000000000000", nonce: 4n } });
    expect(safeHash).toMatch(/^0x[0-9a-f]{64}$/);
    const safeInput = { ...unsignedSafeInput, transactions: [{ ...unsignedSafeInput.transactions[0]!, signatures: [signature] }] };
    const safe = await verifySafeTransactionBundle(safeInput, { getChainId: async () => 1, getCode: async () => "0x6000", readContract: async () => 4n, getSafeNonce: async () => 4, getSafeOwners: async () => [signer.address], getSafeThreshold: async () => 1 });
    expect(safe.provenance).toBe("SAFE_AUTHENTICATED");
    await expect(verifySafeTransactionBundle(unsignedSafeInput, { getChainId: async () => 1, getCode: async () => "0x6000", readContract: async () => 4n, getSafeNonce: async () => 4, getSafeOwners: async () => [signer.address], getSafeThreshold: async () => 1 })).rejects.toThrow("SAFE_CONFIRMATION_EVIDENCE_REQUIRED");
    await expect(verifySafeTransactionBundle(safeInput, { getChainId: async () => 1, getCode: async () => "0x6000", readContract: async () => 4n, getSafeNonce: async () => 5, getSafeOwners: async () => [signer.address], getSafeThreshold: async () => 1 })).rejects.toThrow("SAFE_NONCE_MISMATCH");
  });
});
