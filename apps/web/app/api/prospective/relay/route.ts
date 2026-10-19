import { createPublicClient, defineChain, http, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildProspectiveRelayAuthorization, isDistinctSafeRelaySigner } from "@firewall/safe-enforcement";
import { loadProspective } from "../../../prospective";
import { fail, ok } from "../../_lib/workflow";

export const dynamic = "force-dynamic";

const CHAIN_ID = 11155111;
const RPC_A = "https://sepolia.drpc.org";
const RPC_B = "https://sepolia.gateway.tenderly.co";
const SAFE_SINGLETON = "0x41675c099f32341bf84bfc5382af534df5c7461a" as const;
const SAFE_SINGLETON_CODE_HASH = "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4" as const;
const SENTINEL = "0x0000000000000000000000000000000000000001" as const;
const GUARD_SLOT = BigInt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8");
const safeAbi = [
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "masterCopy", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getModulesPaginated", stateMutability: "view", inputs: [{ name: "start", type: "address" }, { name: "pageSize", type: "uint256" }], outputs: [{ name: "array", type: "address[]" }, { name: "next", type: "address" }] },
] as const;
const guardAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "safe", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "authorizedRelayer", stateMutability: "view", inputs: [{ name: "relayer", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "permitRegistered", stateMutability: "view", inputs: [{ name: "permitId", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "intentRegistered", stateMutability: "view", inputs: [{ name: "intentId", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "revoked", stateMutability: "view", inputs: [{ name: "permitId", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "consumed", stateMutability: "view", inputs: [{ name: "permitId", type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;

function address(value: string | undefined, name: string): Address {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`PROSPECTIVE_RELAY_CONFIG_INVALID:${name}`);
  return value as Address;
}
function hash(value: string | undefined, name: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`PROSPECTIVE_RELAY_CONFIG_INVALID:${name}`);
  return value as Hex;
}
function stable(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function equal(left: unknown, right: unknown): boolean { return stable(left) === stable(right); }
function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

export async function GET() {
  // Status is a read-only operation and must remain available without loading
  // the relay signing secret. Only POST may require the private key.
  const required = ["FIREWALL_PROSPECTIVE_CONTRACT_ADDRESS", "FIREWALL_PROSPECTIVE_SOURCE_SHA256", "FIREWALL_PROTECTED_SAFE", "FIREWALL_GUARD_ADDRESS", "FIREWALL_GUARD_RUNTIME_CODE_HASH", "FIREWALL_RELAY_SIGNER_ADDRESS"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) return ok({ scope: "PROSPECTIVE_SAFE_ENFORCEMENT", state: "NOT_CONFIGURED", configured: false, missing, signatureAvailable: false, prospectiveExecutionSupported: false, reason: "No deployed V3 prospective contract and installed Guard configuration passed readback." });
  const canonical = await loadProspective();
  if (canonical.status !== "READY") return ok({ scope: "PROSPECTIVE_SAFE_ENFORCEMENT", state: "CANONICAL_V3_READ_UNAVAILABLE", configured: true, signatureAvailable: false, reason: canonical.error });
  const safe = process.env.FIREWALL_PROTECTED_SAFE!.toLowerCase();
  const guard = process.env.FIREWALL_GUARD_ADDRESS!.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const latestMandate = canonical.model.mandates.at(-1) ?? null;
  const latestIntent = canonical.model.intents.at(-1) ?? null;
  const latestAdjudication = canonical.model.adjudications.at(-1) ?? null;
  const latestPermit = canonical.model.permits.at(-1) ?? null;
  let evidenceSummary: { readonly providers: readonly string[]; readonly snapshotBlock: number | null; readonly evidenceHash: string; readonly futureReceiptClaimed: boolean } | null = null;
  if (latestIntent?.authenticatedEvidence) {
    try {
      const evidence = JSON.parse(latestIntent.authenticatedEvidence) as Record<string, unknown>;
      const pair = evidence.independently_authenticated as Record<string, unknown> | undefined;
      const providerA = pair?.provider_a as Record<string, unknown> | undefined;
      const providerB = pair?.provider_b as Record<string, unknown> | undefined;
      const snapshot = providerA?.snapshot as Record<string, unknown> | undefined;
      if (pair && providerA && providerB) evidenceSummary = {
        providers: [String(providerA.provider), String(providerB.provider)],
        snapshotBlock: Number.isSafeInteger(snapshot?.number) ? Number(snapshot?.number) : null,
        evidenceHash: latestIntent.evidenceHash,
        futureReceiptClaimed: pair.receipt_claimed_for_future_execution !== false,
      };
    } catch { /* malformed evidence is shown as unavailable and cannot be a permit candidate */ }
  }
  const canonicalRecords = {
    chainId: 61999,
    contract: canonical.model.config.contractAddress,
    sourceSha256: canonical.model.config.expectedSourceSha256,
    mandate: latestMandate ? { id: latestMandate.mandateId, state: latestMandate.state } : null,
    intent: latestIntent ? { id: latestIntent.intentId, state: latestIntent.state, chainId: latestIntent.chainId, safe: latestIntent.safe, safeNonce: latestIntent.safeNonce, target: latestIntent.target, value: latestIntent.value, operation: latestIntent.operation } : null,
    evidence: evidenceSummary,
    adjudication: latestAdjudication ? { id: latestAdjudication.adjudicationId, intentId: latestAdjudication.intentId, verdict: latestAdjudication.verdict, evidenceSufficient: latestAdjudication.evidenceSufficient } : null,
    permit: latestPermit ? { id: latestPermit.permitId, intentId: latestPermit.intentId, status: canonical.model.permitStatuses[latestPermit.permitId] ?? "UNKNOWN", expiresAt: latestPermit.expiresAt } : null,
  };
  const candidate = canonical.model.permits.find((permit) => {
    const intent = canonical.model.intents.find((item) => item.intentId.toLowerCase() === permit.intentId.toLowerCase());
    return permit.status === "ACTIVE" && canonical.model.permitStatuses[permit.permitId] === "ACTIVE"
      && permit.expiresAt > now && permit.executionDeadline > now && intent?.chainId === CHAIN_ID && intent.operation === 0
      && intent.safe.toLowerCase() === safe && intent.guard.toLowerCase() === guard;
  });
  if (!candidate) return ok({ scope: "PROSPECTIVE_SAFE_ENFORCEMENT", state: "NO_CANONICAL_PROSPECTIVE_PERMIT", configured: true, chainId: CHAIN_ID, safe, guard, canonicalPermitCount: canonical.model.permits.length, canonicalRecords, signatureAvailable: false, prospectiveExecutionSupported: false, reason: "No active canonical Studionet V3 permit is bound to this Ethereum Sepolia Safe and Guard." });
  const intent = canonical.model.intents.find((item) => item.intentId.toLowerCase() === candidate.intentId.toLowerCase())!;
  return ok({
    scope: "PROSPECTIVE_SAFE_ENFORCEMENT",
    state: "CANONICAL_PERMIT_CANDIDATE_REQUIRES_LIVE_SAFE_CHECK",
    configured: true,
    signatureAvailable: Boolean(process.env.FIREWALL_RELAY_PRIVATE_KEY),
    prospectiveExecutionSupported: false,
    chainId: CHAIN_ID,
    safe,
    guard,
    canonicalPermitCount: canonical.model.permits.length,
    canonicalRecords,
    prospectiveCall: { permitId: candidate.permitId, to: intent.target, value: intent.value, data: intent.calldata, operation: intent.operation },
    reason: process.env.FIREWALL_RELAY_PRIVATE_KEY
      ? "The canonical permit is active; the relay still must verify finalized Safe, Guard, nonce, module, code identity, and attestor conditions before signing."
      : "The canonical permit is active and readable; no relay signature can be issued until the server-only signing key is configured.",
  });
}

export async function POST(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody) || Object.keys(requestBody).length !== 1 || typeof (requestBody as Record<string, unknown>).permitId !== "string") return fail("PROSPECTIVE_RELAY_REQUEST_SCHEMA_INVALID", 400);
    const permitId = (requestBody as { permitId: string }).permitId;
    if (!/^PPR-[0-9]{8}$/.test(permitId)) return fail("PROSPECTIVE_PERMIT_ID_INVALID", 400);

    const safe = address(process.env.FIREWALL_PROTECTED_SAFE, "FIREWALL_PROTECTED_SAFE");
    const guard = address(process.env.FIREWALL_GUARD_ADDRESS, "FIREWALL_GUARD_ADDRESS");
    const relaySigner = address(process.env.FIREWALL_RELAY_SIGNER_ADDRESS, "FIREWALL_RELAY_SIGNER_ADDRESS");
    const expectedGuardCodeHash = hash(process.env.FIREWALL_GUARD_RUNTIME_CODE_HASH, "FIREWALL_GUARD_RUNTIME_CODE_HASH");
    const relayPrivateKey = process.env.FIREWALL_RELAY_PRIVATE_KEY;
    if (!relayPrivateKey || !/^0x[0-9a-fA-F]{64}$/.test(relayPrivateKey)) return fail("RELAY_SIGNING_KEY_NOT_CONFIGURED", 503);
    const relayAccount = privateKeyToAccount(relayPrivateKey as Hex);
    if (relayAccount.address.toLowerCase() !== relaySigner.toLowerCase()) return fail("RELAY_SIGNER_KEY_ADDRESS_MISMATCH", 503);
    if (process.env.FIREWALL_EVM_CHAIN_ID !== String(CHAIN_ID) || process.env.FIREWALL_EVM_RPC_URL !== RPC_A || process.env.FIREWALL_EVM_SECONDARY_RPC_URL !== RPC_B) return fail("PROSPECTIVE_EVM_NETWORK_CONFIGURATION_MISMATCH", 503);

    const canonical = await loadProspective();
    if (canonical.status !== "READY") return fail(`PROSPECTIVE_CANONICAL_READ_UNAVAILABLE:${canonical.error}`, 503);
    const permit = canonical.model.permits.find((item) => item.permitId === permitId);
    if (!permit || permit.status !== "ACTIVE" || canonical.model.permitStatuses[permitId] !== "ACTIVE") return fail("PROSPECTIVE_PERMIT_NOT_FINALIZED_ACTIVE_OR_CANONICAL", 409);
    const intent = canonical.model.intents.find((item) => item.intentId.toLowerCase() === permit.intentId.toLowerCase());
    if (!intent) return fail("PROSPECTIVE_INTENT_NOT_FOUND", 409);
    if (safe.toLowerCase() !== intent.safe.toLowerCase() || guard.toLowerCase() !== intent.guard.toLowerCase()) return fail("PROSPECTIVE_DEPLOYMENT_SAFE_OR_GUARD_MISMATCH", 409);

    const chain = defineChain({ id: CHAIN_ID, name: "Ethereum Sepolia", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_A, RPC_B] } }, blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } } });
    const clientA = createPublicClient({ chain, transport: http(RPC_A, { timeout: 12_000 }) });
    const clientB = createPublicClient({ chain, transport: http(RPC_B, { timeout: 12_000 }) });
    const clients = [clientA, clientB] as const;
    const chainIds = await Promise.all(clients.map((client) => client.getChainId()));
    if (chainIds.some((id) => id !== CHAIN_ID)) return fail("PROSPECTIVE_EVM_CHAIN_MISMATCH", 503);
    const heads = await Promise.all(clients.map((client) => client.getBlock({ blockTag: "latest" })));
    const headA = heads[0]!;
    const headB = heads[1]!;
    const commonNumber = headA.number < headB.number ? headA.number : headB.number;
    if (commonNumber === null) return fail("PROSPECTIVE_EVM_BLOCK_UNAVAILABLE", 503);
    const blocks = await Promise.all(clients.map((client) => client.getBlock({ blockNumber: commonNumber })));
    const blockA = blocks[0]!;
    const blockB = blocks[1]!;
    if (!blockA.hash || !blockB.hash || blockA.hash !== blockB.hash || blockA.timestamp !== blockB.timestamp) return fail("PROSPECTIVE_EVM_PROVIDER_BLOCK_DISAGREEMENT", 503);

    const state = await Promise.all(clients.map(async (client) => {
      const blockNumber = commonNumber;
      const [nonce, owners, threshold, implementation, modules, installedGuardStorage, safeCode, guardCode, singletonCode, targetCode, guardOwner, guardSafe, relayAllowed, permitRegistered, intentRegistered, revoked, consumed] = await Promise.all([
        client.readContract({ address: safe, abi: safeAbi, functionName: "nonce", blockNumber }),
        client.readContract({ address: safe, abi: safeAbi, functionName: "getOwners", blockNumber }),
        client.readContract({ address: safe, abi: safeAbi, functionName: "getThreshold", blockNumber }),
        client.readContract({ address: safe, abi: safeAbi, functionName: "masterCopy", blockNumber }),
        client.readContract({ address: safe, abi: safeAbi, functionName: "getModulesPaginated", args: [SENTINEL, 10n], blockNumber }),
        client.getStorageAt({ address: safe, slot: `0x${GUARD_SLOT.toString(16).padStart(64, "0")}`, blockNumber }),
        client.getCode({ address: safe, blockNumber }), client.getCode({ address: guard, blockNumber }), client.getCode({ address: SAFE_SINGLETON, blockNumber }), client.getCode({ address: intent.target, blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "owner", blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "safe", blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "authorizedRelayer", args: [relaySigner], blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "permitRegistered", args: [keccak256(new TextEncoder().encode(permitId))], blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "intentRegistered", args: [intent.intentId], blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "revoked", args: [keccak256(new TextEncoder().encode(permitId))], blockNumber }),
        client.readContract({ address: guard, abi: guardAbi, functionName: "consumed", args: [keccak256(new TextEncoder().encode(permitId))], blockNumber }),
      ]);
      if (!installedGuardStorage || installedGuardStorage.length < 42) throw new Error("SAFE_GUARD_STORAGE_INVALID");
      const installedGuard = `0x${installedGuardStorage.slice(-40)}`;
      const targetCodeHash = keccak256(targetCode ?? "0x");
      const guardCodeHash = keccak256(guardCode ?? "0x");
      return {
        nonce: nonce.toString(), owners: [...owners].map((value) => value.toLowerCase()).sort(), threshold: threshold.toString(),
        implementation: implementation.toLowerCase(), modules: { values: [...modules[0]].map((value) => value.toLowerCase()), next: modules[1].toLowerCase() },
        installedGuard: installedGuard.toLowerCase(), guardOwner: guardOwner.toLowerCase(), guardSafe: guardSafe.toLowerCase(),
        relayAllowed, permitRegistered, intentRegistered, revoked, consumed, targetCodeHash, guardCodeHash,
        implementationCodeHash: keccak256(singletonCode ?? "0x"),
        safeCodePresent: !!safeCode && safeCode !== "0x", guardCodePresent: !!guardCode && guardCode !== "0x",
      };
    }));
    if (!equal(state[0], state[1])) return fail("PROSPECTIVE_EVM_PROVIDER_STATE_DISAGREEMENT", 503);
    const actual = state[0]!;
    if (!actual.safeCodePresent || !actual.guardCodePresent || actual.guardCodeHash.toLowerCase() !== expectedGuardCodeHash.toLowerCase()) return fail("PROSPECTIVE_GUARD_CODE_UNVERIFIED", 409);
    if (actual.nonce !== String(intent.safeNonce) || actual.owners.length !== 1 || actual.owners[0] !== intent.creator.toLowerCase() || actual.threshold !== "1" || actual.implementation !== SAFE_SINGLETON || actual.implementationCodeHash.toLowerCase() !== SAFE_SINGLETON_CODE_HASH || actual.modules.values.length !== 0 || actual.modules.next !== SENTINEL || actual.installedGuard !== guard.toLowerCase() || actual.guardOwner !== safe.toLowerCase() || actual.guardSafe !== safe.toLowerCase() || !actual.relayAllowed) return fail("PROSPECTIVE_SAFE_GUARD_CONFIGURATION_MISMATCH", 409);
    if (actual.targetCodeHash.toLowerCase() !== intent.targetCodeHash.toLowerCase()) return fail("PROSPECTIVE_TARGET_CODE_IDENTITY_CHANGED", 409);
    if (actual.permitRegistered || actual.intentRegistered || actual.revoked || actual.consumed) return fail("PROSPECTIVE_GUARD_AUTHORIZATION_ALREADY_USED", 409);
    if (!isDistinctSafeRelaySigner(relaySigner, actual.owners as Address[])) return fail("UNSAFE_RELAY_SIGNER_IS_SAFE_OWNER", 409);

    const nowSeconds = blockA.timestamp;
    // Sepolia finality took 61 minutes for Guard installation. Registration
    // and the dependent Safe execution may each need a finality window, so
    // allow up to four hours while remaining strictly capped by both the
    // canonical permit expiry and its shorter execution deadline. The Guard
    // remains bound to one Safe nonce and consumes the authorization once.
    const candidates = [nowSeconds + 14_400n, BigInt(permit.expiresAt), BigInt(permit.executionDeadline)];
    const attestationExpiry = candidates.reduce((minimum, value) => value < minimum ? value : minimum);
    const relay = buildProspectiveRelayAuthorization(canonical.model, {
      permitId, guard, targetChainId: BigInt(CHAIN_ID), safe, to: intent.target,
      value: BigInt(intent.value), data: intent.calldata, operation: 0,
      safeNonce: BigInt(intent.safeNonce), nowSeconds, attestationExpiry,
    });
    const signature = await relayAccount.signTypedData(relay.typedData);
    return ok({
      scope: "FINALIZED_PROSPECTIVE_GENLAYER_PERMIT_RELAY_ATTESTATION",
      state: "ATTESTATION_SIGNED",
      chainId: CHAIN_ID,
      safe,
      guard,
      canonicalGenLayer: { chainId: 61999, contract: canonical.model.config.contractAddress, permitId, intentId: intent.intentId, adjudicationId: permit.adjudicationId, verdict: "PROSPECTIVE_AUTHORIZED", status: canonical.model.permitStatuses[permitId] },
      evm: { chainId: CHAIN_ID, commonBlockNumber: commonNumber.toString(), commonBlockHash: blockA.hash, safe, guard, nonce: intent.safeNonce, target: intent.target },
      relaySigner,
      safeOwners: actual.owners,
      safeThreshold: actual.threshold,
      safeOwnershipVerified: true,
      guardInstalledOnSafe: true,
      guardAdminTransferredToSafe: true,
      modulePathDisabled: true,
      relayAuthorized: actual.relayAllowed,
      relaySignerIsSafeOwner: false,
      prospectiveExecutionSupported: true,
      prospectiveCall: { permitId, to: intent.target, value: intent.value, data: intent.calldata, operation: intent.operation },
      authorization: jsonSafe(relay.authorization),
      signature,
      trustAssumption: "The relay is trusted to sign only after reading a finalized canonical Studionet V3 permit and independently checking the matching Safe, Guard, nonce, target code and disabled module path against Ethereum Sepolia dRPC and Tenderly at one identical block. Ethereum Sepolia cannot verify GenLayer finality directly. The Safe Guard accepts this explicit attestor signature as the cross-chain trust boundary.",
      registration: "The returned signature is submitted to Guard.registerAuthorization; the Safe owner still separately signs Safe.execTransaction.",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "PROSPECTIVE_RELAY_ATTESTATION_FAILED", 400);
  }
}
