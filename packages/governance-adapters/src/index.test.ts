import { describe, expect, it } from "vitest";
import { ManualCanonicalAdapter, OpenZeppelinGovernorAdapter, SafeAdapter, decodeMultiSend } from "./index.js";
import { hashUtf8 } from "@firewall/shared";

const address = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;

describe("governance adapters", () => {
  it("normalizes the complete Governor identity and rejects length mismatch", () => {
    const value = new OpenZeppelinGovernorAdapter().normalize({ chainId: 1, governor: address, proposalId: "7", targets: [address], values: ["0"], calldatas: ["0x12345678"], description: "Upgrade", proposalSource: "https://governance.example/7" });
    expect(value.provenance).toBe("GOVERNANCE_AUTHENTICATED");
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
    expect(safe.provenance).toBe("SAFE_AUTHENTICATED");
    const record = `00${"01".repeat(20)}${"00".repeat(32)}${("04").padStart(64, "0")}${"12345678"}`;
    expect(decodeMultiSend(`0x8d80ff0a${record}` as `0x${string}`)).toHaveLength(1);
    expect(() => decodeMultiSend("0x8d80ff0a00" as `0x${string}`)).toThrow("SAFE_MULTISEND_MALFORMED");
  });
});
