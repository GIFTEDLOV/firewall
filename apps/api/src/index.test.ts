import { describe, expect, it } from "vitest";
import { hashUtf8 } from "@firewall/shared";
import { createEmptyCanonicalReader, createFirewallApi } from "./index.js";

describe("Firewall API boundary", () => {
  it("stores workflow drafts while keeping canonical read authority separate", async () => {
    const api = createFirewallApi({ canonical: createEmptyCanonicalReader() });
    const text = "Upgrade TreasuryVault with batching";
    const mandate = api.service.createMandate({ adapter: "MANUAL_CANONICAL", proposal: { governanceSystem: "MANUAL_CANONICAL", governanceChainId: 61127, governanceContract: "0x1111111111111111111111111111111111111111", proposalExternalId: "local-1", proposalHash: `0x${"aa".repeat(32)}`, proposalSource: "https://operator.example/local-1", proposalText: text, proposalTextSha256: hashUtf8(text), proposalTextBytes: new TextEncoder().encode(text).byteLength }, mandateVersion: 1, constraints: { allowedTargets: [], forbiddenTargets: [], allowedValueTransfer: "NONE", maximumValue: "0", allowedSelectors: [], prohibitedCapabilities: [], protectedEconomicTerms: [], protectedAdminAuthorities: [], protectedOwnership: true, protectedUpgradeScope: true } });
    api.service.saveMandate(mandate);
    const model = await api.getCanonicalReadModel();
    expect(model.mandates).toHaveLength(0);
    expect(model.localDrafts[0]?.mandateId).toBe("MAN-00000001");
    expect(api.authority).toBe("CANONICAL_CONTRACT_ONLY");
  });
});
