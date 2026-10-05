import { describe, expect, it } from "vitest";
import { authenticateEvidenceBundle, evidenceFailureStatus } from "./index.js";

describe("evidence binding", () => {
  it("hashes and authenticates evidence without treating a URL as identity", () => {
    const bundle = authenticateEvidenceBundle({
      evidenceId: "EVD-00000001",
      mandateId: "MAN-00000001",
      executionId: "EXE-00000001",
      proposalIdentityHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      entries: [{
        evidenceId: "proposal-text",
        authorityType: "GOVERNANCE_CONTRACT",
        authorityId: "governor:0x1111111111111111111111111111111111111111",
        sourceUri: "https://example.com/proposal",
        sourceHost: "example.com",
        chainId: 1,
        proposalIdentityHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        executionId: "EXE-00000001",
        contentSha256: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        exactByteLength: 12,
        codeHash: null,
        implementationAddress: null,
        implementationCodeHash: null,
        blockNumber: null,
        blockHash: null,
        abiProvenance: { source: "GOVERNANCE_IMPORT", sourceUrl: null, abiSha256: null },
        capturedAt: "2026-10-05T00:00:00.000Z",
        freshnessExpiresAt: null,
        schemaVersion: "FIREWALL_EVIDENCE_V1",
        role: "PROPOSAL",
        contentType: "text/plain",
      }],
      schemaVersion: "FIREWALL_EVIDENCE_V1",
    });
    expect(bundle.status).toBe("AUTHENTICATED");
    expect(bundle.bundleHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(evidenceFailureStatus({ sourceAvailable: false, contentMatches: true })).toBe("SOURCE_UNAVAILABLE");
    expect(evidenceFailureStatus({ sourceAvailable: true, contentMatches: false })).toBe("EVIDENCE_MISMATCH");
  });
});
