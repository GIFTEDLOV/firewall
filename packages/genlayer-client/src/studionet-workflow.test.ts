import { beforeEach, describe, expect, it, vi } from "vitest";
import { studionet } from "genlayer-js/chains";
import type { StudionetWalletSession } from "./studionet-workflow.js";
import { listRecoverableStudionetWrites, resumeFirewallV2Write, submitFirewallV2Write } from "./studionet-workflow.js";

const account = "0x33653e6e86807e41682d3346cdf648d6653384b1" as const;

function mockSession(input: { readonly canonicalReadReady?: boolean; readonly gasPrice?: string; readonly feeManagerConfigured?: boolean } = {}) {
  let onSubmissionHash: (hash: `0x${string}`) => void = () => undefined;
  const writes = vi.fn(async () => {
    const hash = `0x${"11".repeat(32)}` as `0x${string}`;
    onSubmissionHash(hash);
    return hash;
  });
  const chain = Object.assign({}, studionet, input.feeManagerConfigured ? { feeManagerContract: { address: account } } : {});
  const client = {
    chain,
    getChainId: vi.fn(async () => 61999),
    request: vi.fn(async () => input.gasPrice ?? "0x0"),
    getBalance: vi.fn(async () => 5_000_000_000_000_000_000n),
    getTransactionCount: vi.fn(async () => 8n),
    estimateTransactionGas: vi.fn(async () => 500_000n),
    waitForTransactionReceipt: vi.fn(async () => ({ statusName: "FINALIZED" })),
    getTransaction: vi.fn(async () => ({ statusName: "FINALIZED", resultName: "MAJORITY_AGREE", txExecutionResultName: "FINISHED_WITH_RETURN" })),
    writeContract: writes,
  } as unknown as StudionetWalletSession["client"];
  return { session: { client, address: account, canonicalReadReady: input.canonicalReadReady ?? true, canonicalReadError: null, setSubmissionHashHandler: (handler) => { onSubmissionHash = handler; } } as StudionetWalletSession, writes };
}

function journal() {
  const data = new Map<string, string>();
  const localStorage = {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  return data;
}

describe("Studionet V2 write gate", () => {
  beforeEach(() => { journal(); });

  it("does not submit while canonical V2 views are unavailable", async () => {
    const { session, writes } = mockSession({ canonicalReadReady: false });
    await expect(submitFirewallV2Write({ session, method: "create_mandate", args: [], operationKey: "mandate:one", canonicalPostcondition: async () => true })).rejects.toThrow("CANONICAL_V2_READ_UNAVAILABLE");
    expect(writes).not.toHaveBeenCalled();
  });

  it("submits only on the stable Studionet nonpayable fee-free path", async () => {
    const data = journal();
    const { session, writes } = mockSession();
    const result = await submitFirewallV2Write({ session, method: "create_mandate", args: [1n], operationKey: "mandate:one", canonicalPostcondition: async () => true });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(result.preflight.protocolFeeMode).toBe("STABLE_STUDIONET_NONPAYABLE_NO_FEE_MANAGER");
    expect(result.preflight.estimatedFeeWei).toBe("0");
    const stored = JSON.parse(data.get(`firewall.studionet.write.${account}.mandate:one`) ?? "{}");
    expect(stored.stage).toBe("CANONICAL_SUCCESS");
    expect(stored.hash).toBe(`0x${"11".repeat(32)}`);
    expect(stored.protocolTransactionId).toBe(stored.hash);
    expect(stored.senderNonce).toBe("8");
  });

  it("keeps the fee gate closed when the chain exposes a fee manager", async () => {
    const { session, writes } = mockSession({ feeManagerConfigured: true });
    await expect(submitFirewallV2Write({ session, method: "create_mandate", args: [], operationKey: "mandate:fee-manager", canonicalPostcondition: async () => true })).rejects.toThrow("STUDIONET_PROTOCOL_FEE_MODE_UNVERIFIED");
    expect(writes).not.toHaveBeenCalled();
  });

  it("lists and resumes a saved submission without rebroadcasting", async () => {
    const data = journal();
    const { session, writes } = mockSession();
    data.set(`firewall.studionet.write.${account}.existing`, JSON.stringify({ operationKey: "existing", method: "authenticate_evidence", stage: "GENLAYER_ACCEPTED_APPEALABLE", chainId: 61999, contract: "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528", sender: account, hash: `0x${"22".repeat(32)}` }));
    const pending = listRecoverableStudionetWrites(account);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.hash).toBe(`0x${"22".repeat(32)}`);
    const result = await resumeFirewallV2Write({ session, operationKey: "existing", canonicalPostcondition: async () => true });
    expect(result.postcondition).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    expect(JSON.parse(data.get(`firewall.studionet.write.${account}.existing`) ?? "{}").stage).toBe("CANONICAL_SUCCESS");
  });
});
