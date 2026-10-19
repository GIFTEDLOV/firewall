import { describe, expect, it } from "vitest";
import { isDistinctSafeRelaySigner } from "./relay-identity.js";

describe("relay signer identity", () => {
  const owner = "0x00000000000000000000000000000000000000a1" as const;
  const relay = "0x00000000000000000000000000000000000000b2" as const;

  it("allows a separately held relay signer", () => {
    expect(isDistinctSafeRelaySigner(relay, [owner])).toBe(true);
  });

  it("rejects a relay signer that is also a Safe owner", () => {
    expect(isDistinctSafeRelaySigner(owner, [owner])).toBe(false);
  });
});
