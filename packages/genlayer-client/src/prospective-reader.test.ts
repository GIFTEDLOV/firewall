import { describe, expect, it } from "vitest";
import { parseProspectiveIntent } from "./prospective-reader.js";

const hash = `0x${"11".repeat(32)}`;
const safe = "0x9387e30C1b1a864686Df80d46786C4F29fe735ba";
const guard = "0x2e8cafa2053502cf29516f6e1d47cd59a8b9a6b4";

function intent(value: unknown) {
  return {
    intent_id: hash, mandate_id: "MAN3-00000001", creator: "0x33653e6e86807e41682d3346cdf648d6653384b1",
    chain_id: 11155111, safe, safe_nonce: 2, target: guard, value, calldata: "0x8da5cb5b", calldata_hash: hash,
    operation: 0, guard, guard_code_hash: hash, target_code_hash: hash, safe_deployment_tx: hash,
    evidence_block: 1, execution_deadline: 1792367480, permit_expiry: 1792370480, intent_hash: hash,
    state: "INTENT_COMMITTED", authenticated_evidence: "", evidence_hash: new Uint8Array(), adjudication_id: "",
  };
}

describe("prospective intent canonical decoding", () => {
  it("normalizes a zero u256 returned as a JavaScript number without losing precision", () => {
    expect(parseProspectiveIntent(intent(0)).value).toBe("0");
  });

  it("preserves decimal string and bigint values exactly", () => {
    expect(parseProspectiveIntent(intent("9007199254740993")).value).toBe("9007199254740993");
    expect(parseProspectiveIntent(intent(9007199254740993n)).value).toBe("9007199254740993");
  });

  it("rejects unsafe, negative, and malformed numeric values", () => {
    expect(() => parseProspectiveIntent(intent(Number.MAX_SAFE_INTEGER + 1))).toThrow("PROSPECTIVE_READ_INVALID:value");
    expect(() => parseProspectiveIntent(intent(-1))).toThrow("PROSPECTIVE_READ_INVALID:value");
    expect(() => parseProspectiveIntent(intent("0x00"))).toThrow("PROSPECTIVE_READ_INVALID:value");
  });
});
