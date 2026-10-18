import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient, decodeErrorResult, defineChain, encodeAbiParameters, encodeDeployData, encodeEventTopics,
  encodeFunctionData, hashTypedData, http, keccak256, parseEventLogs, zeroAddress,
  recoverTypedDataAddress, stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "..");
const JOURNAL_PATH = resolve(ROOT, "evidence/qualification/current/firewall-sepolia-transactions.json");
const SIGNED_TX_ROOT = resolve(process.env.LOCALAPPDATA ?? process.env.USERPROFILE ?? ROOT, "Firewall", "signed-transactions");
const ARTIFACT_PATH = resolve(ROOT, "artifacts/FirewallSafeGuard.artifact.json");
const GUARD_SOURCE_PATH = resolve(ROOT, "contracts/FirewallSafeGuard.sol");
const NETWORK = "ethereum-sepolia";
const CHAIN_ID = 11155111;
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const MAX_DEBIT_WEI = 1_000_000_000_000_000n;
const OWNER_ADDRESS = "0x33653e6e86807e41682d3346cdf648d6653384b1";
const SAFE_SINGLETON = "0x41675c099f32341bf84bfc5382af534df5c7461a";
const SAFE_FACTORY = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67";
const SAFE_REGISTRY = {
  [SAFE_SINGLETON.toLowerCase()]: "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4",
  [SAFE_FACTORY.toLowerCase()]: "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317",
};
const ZERO_HASH = `0x${"00".repeat(32)}`;
const SAFE_GUARD_STORAGE_SLOT = BigInt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8");
const SAFE_MODULE_SENTINEL = "0x0000000000000000000000000000000000000001";
const KEYCHAIN_SERVICE = "genlayer-cli";
const OWNER_KEYCHAIN_ACCOUNT = "account:firewall-only";
const RELAY_KEYCHAIN_ACCOUNT = "account:firewall-relay-qualification";
const ALLOWED = new Set([
  "preflight", "create-safe", "canary", "deploy-guard", "deploy-guard-revision", "transfer-guard-owner",
  "install-guard", "blocked-execution", "blocked-wrong-target", "blocked-wrong-calldata",
  "register-authorization", "authorized-execution", "replay-execution",
  "expired-authorization", "wrong-signer-authorization", "status",
]);

const chain = defineChain({
  id: CHAIN_ID,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC_URL, { timeout: 20_000 }) });
const safeFactoryAbi = [
  { type: "function", name: "createProxyWithNonce", stateMutability: "nonpayable", inputs: [{ name: "_singleton", type: "address" }, { name: "initializer", type: "bytes" }, { name: "saltNonce", type: "uint256" }], outputs: [{ name: "proxy", type: "address" }] },
  { type: "event", name: "ProxyCreation", anonymous: false, inputs: [{ name: "proxy", type: "address", indexed: true }, { name: "singleton", type: "address", indexed: false }] },
];
const safeAbi = [
  { type: "function", name: "setup", stateMutability: "nonpayable", inputs: [{ name: "_owners", type: "address[]" }, { name: "_threshold", type: "uint256" }, { name: "to", type: "address" }, { name: "data", type: "bytes" }, { name: "fallbackHandler", type: "address" }, { name: "paymentToken", type: "address" }, { name: "payment", type: "uint256" }, { name: "paymentReceiver", type: "address" }], outputs: [] },
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getStorageAt", stateMutability: "view", inputs: [{ name: "offset", type: "uint256" }, { name: "length", type: "uint256" }], outputs: [{ type: "bytes" }] },
  { type: "function", name: "masterCopy", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getModulesPaginated", stateMutability: "view", inputs: [{ name: "start", type: "address" }, { name: "pageSize", type: "uint256" }], outputs: [{ name: "array", type: "address[]" }, { name: "next", type: "address" }] },
  { type: "function", name: "setGuard", stateMutability: "nonpayable", inputs: [{ name: "guard", type: "address" }], outputs: [] },
  { type: "function", name: "getTransactionHash", stateMutability: "view", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "_nonce", type: "uint256" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "execTransaction", stateMutability: "payable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "signatures", type: "bytes" }], outputs: [{ type: "bool" }] },
  { type: "event", name: "ExecutionSuccess", anonymous: false, inputs: [{ name: "txHash", type: "bytes32", indexed: true }, { name: "payment", type: "uint256", indexed: false }] },
  { type: "event", name: "ExecutionFailure", anonymous: false, inputs: [{ name: "txHash", type: "bytes32", indexed: true }, { name: "payment", type: "uint256", indexed: false }] },
];
const guardAdminAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "safe", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "authorizedRelayer", stateMutability: "view", inputs: [{ name: "relayer", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transferOwnership", stateMutability: "nonpayable", inputs: [{ name: "nextOwner", type: "address" }], outputs: [] },
];
const safeTxTypes = { SafeTx: [
  { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" },
  { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" },
  { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" },
] };
const authorizationTypes = { PermitAuthorization: [
  { name: "permitId", type: "bytes32" }, { name: "intentId", type: "bytes32" }, { name: "mandateId", type: "bytes32" },
  { name: "executionId", type: "bytes32" }, { name: "proposalHash", type: "bytes32" }, { name: "executionBundleHash", type: "bytes32" },
  { name: "targetChainId", type: "uint256" }, { name: "safe", type: "address" }, { name: "to", type: "address" },
  { name: "value", type: "uint256" }, { name: "dataHash", type: "bytes32" }, { name: "operation", type: "uint8" },
  { name: "safeNonce", type: "uint256" }, { name: "targetsDigest", type: "bytes32" }, { name: "valuesDigest", type: "bytes32" },
  { name: "calldataDigest", type: "bytes32" }, { name: "codeFactsDigest", type: "bytes32" }, { name: "implementationFactsDigest", type: "bytes32" },
  { name: "targetCodeHash", type: "bytes32" }, { name: "implementationAddress", type: "address" }, { name: "implementationCodeHash", type: "bytes32" },
  { name: "batchStructureHash", type: "bytes32" }, { name: "adjudicationId", type: "bytes32" },
  { name: "adjudicationGeneration", type: "uint256" }, { name: "executionDeadline", type: "uint256" },
  { name: "expiresAt", type: "uint256" }, { name: "canonicalPermitHash", type: "bytes32" },
] };

const requireFromCli = createRequire("C:/Users/DELL/AppData/Roaming/npm/node_modules/genlayer/dist/index.js");
const keytar = requireFromCli("keytar");
const now = () => new Date().toISOString();
const hexHash = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;
const stable = (value) => {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

function saveJournal(journal) {
  mkdirSync(dirname(JOURNAL_PATH), { recursive: true });
  const temporary = `${JOURNAL_PATH}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  renameSync(temporary, JOURNAL_PATH);
}

function signedTransactionPath(hash) {
  return resolve(SIGNED_TX_ROOT, `${hash.toLowerCase()}.hex`);
}

function persistSignedTransaction(hash, signed) {
  mkdirSync(SIGNED_TX_ROOT, { recursive: true });
  const path = signedTransactionPath(hash);
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8").trim();
    if (keccak256(existing).toLowerCase() !== hash.toLowerCase()) throw new Error("PERSISTED_SIGNED_TRANSACTION_HASH_MISMATCH");
    return path;
  }
  // The signed transaction is an approved, single-use broadcast artifact, not
  // a private key. Keep it under this Windows user's LocalAppData profile;
  // Windows applies the profile ACL, while the journal stores only its hash.
  writeFileSync(path, `${signed}\n`, { encoding: "utf8", flag: "wx" });
  if (keccak256(readFileSync(path, "utf8").trim()).toLowerCase() !== hash.toLowerCase()) throw new Error("SIGNED_TRANSACTION_DURABLE_WRITE_VERIFICATION_FAILED");
  return path;
}

function loadPersistedSignedTransaction(hash) {
  const path = signedTransactionPath(hash);
  if (!existsSync(path)) return null;
  const signed = readFileSync(path, "utf8").trim();
  if (keccak256(signed).toLowerCase() !== hash.toLowerCase()) throw new Error("PERSISTED_SIGNED_TRANSACTION_HASH_MISMATCH");
  return signed;
}

function loadJournal() {
  if (!existsSync(JOURNAL_PATH)) return null;
  const value = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  if (value.network !== NETWORK || value.chainId !== CHAIN_ID || value.rpcUrl !== RPC_URL || value.owner?.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) throw new Error("SEPOLIA_JOURNAL_NETWORK_OR_SIGNER_MISMATCH");
  return value;
}

async function loadAccounts(journal) {
  const ownerKey = await keytar.getPassword(KEYCHAIN_SERVICE, OWNER_KEYCHAIN_ACCOUNT);
  if (!ownerKey || !/^0x[0-9a-fA-F]{64}$/.test(ownerKey)) throw new Error("UNLOCKED_SEPOLIA_OWNER_KEY_NOT_AVAILABLE_IN_WINDOWS_CREDENTIAL_STORE");
  const owner = privateKeyToAccount(ownerKey);
  if (owner.address.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) throw new Error("AUTHORIZED_SAFE_OWNER_ADDRESS_MISMATCH");
  ownerKey.replace(/./g, "\0");
  let relayKey = await keytar.getPassword(KEYCHAIN_SERVICE, RELAY_KEYCHAIN_ACCOUNT);
  if (!relayKey) {
    relayKey = generatePrivateKey();
    await keytar.setPassword(KEYCHAIN_SERVICE, RELAY_KEYCHAIN_ACCOUNT, relayKey);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(relayKey)) throw new Error("RELAY_SIGNER_KEYCHAIN_RECORD_INVALID");
  const relay = privateKeyToAccount(relayKey);
  if (relay.address.toLowerCase() === owner.address.toLowerCase()) throw new Error("RELAY_SIGNER_MUST_DIFFER_FROM_SAFE_OWNER");
  if (journal?.relaySigner && journal.relaySigner.toLowerCase() !== relay.address.toLowerCase()) throw new Error("RELAY_SIGNER_JOURNAL_MISMATCH");
  return { owner, relay, relayKey };
}

async function codeHash(address) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") return null;
  return keccak256(code).toLowerCase();
}

async function checkNetworkAndRegistry() {
  const [chainId, latestBlock, finalizedBlock, ownerBalance, latestNonce, pendingNonce, gasPrice, fees] = await Promise.all([
    publicClient.getChainId(), publicClient.getBlock({ blockTag: "latest" }), publicClient.getBlock({ blockTag: "finalized" }),
    publicClient.getBalance({ address: OWNER_ADDRESS }), publicClient.getTransactionCount({ address: OWNER_ADDRESS, blockTag: "latest" }),
    publicClient.getTransactionCount({ address: OWNER_ADDRESS, blockTag: "pending" }), publicClient.getGasPrice(), publicClient.estimateFeesPerGas(),
  ]);
  if (chainId !== CHAIN_ID || publicClient.chain.id !== CHAIN_ID || RPC_URL !== "https://ethereum-sepolia-rpc.publicnode.com") throw new Error("SEPOLIA_CHAIN_OR_RPC_MISMATCH");
  if (latestNonce !== pendingNonce) throw new Error("OWNER_PENDING_NONCE_REQUIRES_READ_ONLY_RECONCILIATION");
  if (!finalizedBlock.hash || !latestBlock.hash || latestBlock.number < finalizedBlock.number) throw new Error("SEPOLIA_FINALITY_TAG_UNAVAILABLE");
  const contracts = {};
  for (const [address, expected] of Object.entries(SAFE_REGISTRY)) {
    const actual = await codeHash(address);
    contracts[address] = { expectedRuntimeCodeHash: expected, actualRuntimeCodeHash: actual, matches: actual === expected };
    if (actual !== expected) throw new Error("SAFE_REGISTRY_RUNTIME_CODE_MISMATCH");
  }
  return {
    checkedAt: now(), network: NETWORK, chainId, rpcUrl: RPC_URL,
    latestBlock: { number: latestBlock.number.toString(), hash: latestBlock.hash },
    finalizedBlock: { number: finalizedBlock.number.toString(), hash: finalizedBlock.hash },
    owner: OWNER_ADDRESS, ownerBalanceWei: ownerBalance.toString(), latestNonce, pendingNonce,
    gasPriceWei: gasPrice.toString(), maxFeePerGasWei: (fees.maxFeePerGas ?? gasPrice).toString(),
    maxPriorityFeePerGasWei: (fees.maxPriorityFeePerGas ?? 0n).toString(), safeRegistry: contracts,
    maxAggregateDebitWei: MAX_DEBIT_WEI.toString(),
  };
}

function newJournal(preflight, relayAddress) {
  return {
    version: 1,
    network: NETWORK,
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    owner: OWNER_ADDRESS,
    relaySigner: relayAddress,
    safeSingleton: SAFE_SINGLETON,
    safeFactory: SAFE_FACTORY,
    safe: null,
    guard: null,
    guardSourceSha256: null,
    initialOwnerBalanceWei: preflight.ownerBalanceWei,
    ownerNonce: preflight.latestNonce,
    maxAggregateDebitWei: MAX_DEBIT_WEI.toString(),
    totalActualDebitWei: "0",
    preflight,
    transactions: {},
    checkpoint: "READ_ONLY_PREFLIGHT_COMPLETE_NO_EVM_WRITE",
    updatedAt: now(),
  };
}

async function refreshCheckpoint(journal, status) {
  journal.checkpoint = status;
  journal.updatedAt = now();
  saveJournal(journal);
}

function artifactAndHash() {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const source = readFileSync(GUARD_SOURCE_PATH);
  const actualSourceHash = createHash("sha256").update(source).digest("hex");
  if (artifact.sourceSha256 !== actualSourceHash || artifact.contract !== "FirewallSafeGuard" || !artifact.abi || !artifact.creationBytecode) throw new Error("GUARD_ARTIFACT_SOURCE_PARITY_FAILED");
  return { artifact, actualSourceHash };
}

async function safeCallDetails(safe, owner, target, value = 0n, data = "0x", nonceOverride = null) {
  const nonce = nonceOverride === null ? await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }) : BigInt(nonceOverride);
  const message = { to: target, value, data, operation: 0, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: zeroAddress, refundReceiver: zeroAddress, nonce };
  const domain = { chainId: CHAIN_ID, verifyingContract: safe };
  const localHash = hashTypedData({ domain, types: safeTxTypes, primaryType: "SafeTx", message });
  const onchainHash = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getTransactionHash", args: [target, value, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce] });
  if (localHash.toLowerCase() !== onchainHash.toLowerCase()) throw new Error("SAFE_EIP712_HASH_MISMATCH");
  const signatures = await owner.signTypedData({ domain, types: safeTxTypes, primaryType: "SafeTx", message });
  const dataToSafe = encodeFunctionData({ abi: safeAbi, functionName: "execTransaction", args: [target, value, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, signatures] });
  return { safeNonce: nonce.toString(), target, value: value.toString(), data, safeTxHash: onchainHash, dataToSafe };
}

async function durableSafeCallDetails(journal, owner, entry, target, value = 0n, data = "0x") {
  journal.safeCalls ??= {};
  const existing = journal.safeCalls[entry];
  if (existing) {
    if (existing.target.toLowerCase() !== target.toLowerCase() || existing.valueWei !== value.toString() || existing.data.toLowerCase() !== data.toLowerCase()) throw new Error(`SAFE_CALL_JOURNAL_BINDING_MISMATCH:${entry}`);
    const details = await safeCallDetails(journal.safe, owner, target, value, data, BigInt(existing.safeNonce));
    if (details.safeTxHash.toLowerCase() !== existing.safeTxHash.toLowerCase()) throw new Error(`SAFE_CALL_JOURNAL_HASH_MISMATCH:${entry}`);
    return details;
  }
  const details = await safeCallDetails(journal.safe, owner, target, value, data);
  journal.safeCalls[entry] = { safeNonce: details.safeNonce, target, valueWei: value.toString(), data, safeTxHash: details.safeTxHash, savedAt: now() };
  saveJournal(journal);
  return details;
}

function prospectiveAttestationPath() {
  return resolve(ROOT, "evidence/qualification/current/prospective-relay-attestation.json");
}

function textHash(value) { return keccak256(stringToHex(value)); }

function executionKey(authorization) {
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "uint256" }],
    [authorization.targetChainId, authorization.safe, authorization.to, authorization.value, authorization.dataHash, authorization.operation, authorization.safeNonce],
  ));
}

function normalizeAuthorization(raw) {
  if (!raw || typeof raw !== "object") throw new Error("RELAY_AUTHORIZATION_OBJECT_MISSING");
  const authorization = { ...raw };
  for (const key of ["targetChainId", "value", "safeNonce", "adjudicationGeneration", "executionDeadline", "expiresAt"]) {
    if (authorization[key] === undefined || !/^\d+$/.test(String(authorization[key]))) throw new Error(`RELAY_AUTHORIZATION_INTEGER_INVALID:${key}`);
    authorization[key] = BigInt(authorization[key]);
  }
  if (!Number.isInteger(authorization.operation)) throw new Error("RELAY_AUTHORIZATION_OPERATION_INVALID");
  return authorization;
}

function findRevertData(error) {
  const pending = [error];
  const seen = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (!current || (typeof current !== "object" && typeof current !== "function") || seen.has(current)) continue;
    seen.add(current);
    for (const key of ["data", "returnData", "revertData"]) {
      const value = current[key];
      if (typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value)) return value;
    }
    if (current.cause) pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }
  return null;
}

async function requireExpectedRevert(call, guardAbi, expectedNames, label) {
  try {
    await call();
    throw new Error(`${label}_SIMULATION_DID_NOT_REVERT`);
  } catch (error) {
    if (error instanceof Error && error.message === `${label}_SIMULATION_DID_NOT_REVERT`) throw error;
    const data = findRevertData(error);
    if (!data) throw new Error(`${label}_SIMULATION_REVERT_DATA_UNAVAILABLE`);
    let decoded;
    try { decoded = decodeErrorResult({ abi: guardAbi, data }); }
    catch { throw new Error(`${label}_SIMULATION_REVERT_NOT_FROM_GUARD`); }
    if (!expectedNames.includes(decoded.errorName)) throw new Error(`${label}_SIMULATION_UNEXPECTED_GUARD_ERROR:${decoded.errorName}`);
    return decoded.errorName;
  }
}

async function readProspectiveAttestation(journal, owner, relay, activeGuard, expectedState) {
  const path = prospectiveAttestationPath();
  if (!existsSync(path)) throw new Error("FINALIZED_CANONICAL_PROSPECTIVE_RELAY_ATTESTATION_FILE_MISSING");
  const response = JSON.parse(readFileSync(path, "utf8"));
  if (response.state !== "ATTESTATION_SIGNED" || response.prospectiveExecutionSupported !== true || response.chainId !== CHAIN_ID) throw new Error("PROSPECTIVE_RELAY_ATTESTATION_STATE_INVALID");
  if (response.canonicalGenLayer?.chainId !== 61999 || response.canonicalGenLayer?.contract !== process.env.FIREWALL_PROSPECTIVE_CONTRACT_ADDRESS || response.canonicalGenLayer?.status !== "ACTIVE") throw new Error("CANONICAL_GENLAYER_PERMIT_REFERENCE_MISMATCH");
  const permitId = response.canonicalGenLayer.permitId;
  const intentId = response.canonicalGenLayer.intentId;
  const adjudicationId = response.canonicalGenLayer.adjudicationId;
  if (typeof permitId !== "string" || !/^PPR-[0-9]{8}$/.test(permitId) || !/^0x[0-9a-f]{64}$/i.test(String(intentId)) || typeof adjudicationId !== "string") throw new Error("CANONICAL_PROSPECTIVE_PERMIT_IDENTIFIERS_INVALID");
  if (response.safe?.toLowerCase() !== journal.safe.toLowerCase() || response.guard?.toLowerCase() !== activeGuard.toLowerCase() || response.relaySigner?.toLowerCase() !== relay.address.toLowerCase()) throw new Error("RELAY_ATTESTATION_SAFE_GUARD_SIGNER_MISMATCH");
  const authorization = normalizeAuthorization(response.authorization);
  const call = response.prospectiveCall;
  if (!call || typeof call.data !== "string" || typeof response.signature !== "string") throw new Error("RELAY_ATTESTATION_CALL_OR_SIGNATURE_MISSING");
  if (authorization.targetChainId !== BigInt(CHAIN_ID) || authorization.safe.toLowerCase() !== journal.safe.toLowerCase() || authorization.to.toLowerCase() !== call.to?.toLowerCase() || authorization.value !== BigInt(call.value) || authorization.dataHash.toLowerCase() !== keccak256(call.data).toLowerCase() || authorization.operation !== call.operation || authorization.permitId.toLowerCase() !== textHash(permitId).toLowerCase() || authorization.intentId.toLowerCase() !== intentId.toLowerCase() || authorization.adjudicationId.toLowerCase() !== textHash(adjudicationId).toLowerCase() || authorization.targetCodeHash.toLowerCase() !== journal.activeGuardRuntimeCodeHash.toLowerCase() || authorization.implementationAddress.toLowerCase() !== zeroAddress.toLowerCase() || authorization.implementationCodeHash.toLowerCase() !== ZERO_HASH.toLowerCase() || authorization.canonicalPermitHash.toLowerCase() === ZERO_HASH.toLowerCase()) throw new Error("RELAY_AUTHORIZATION_BINDING_MISMATCH");
  const recovered = await recoverTypedDataAddress({
    domain: { name: "FirewallSafeGuard", version: "1", chainId: BigInt(CHAIN_ID), verifyingContract: activeGuard },
    types: authorizationTypes,
    primaryType: "PermitAuthorization",
    message: authorization,
    signature: response.signature,
  });
  if (recovered.toLowerCase() !== relay.address.toLowerCase()) throw new Error("RELAY_AUTHORIZATION_SIGNATURE_RECOVERY_MISMATCH");
  const [guardOwner, guardSafe, relayAllowed, installedWord, nonce, code, permitRegistered, intentRegistered, revoked, consumed] = await Promise.all([
    publicClient.readContract({ address: activeGuard, abi: guardAdminAbi, functionName: "owner" }),
    publicClient.readContract({ address: activeGuard, abi: guardAdminAbi, functionName: "safe" }),
    publicClient.readContract({ address: activeGuard, abi: guardAdminAbi, functionName: "authorizedRelayer", args: [relay.address] }),
    publicClient.readContract({ address: journal.safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] }),
    publicClient.readContract({ address: journal.safe, abi: safeAbi, functionName: "nonce" }),
    publicClient.getCode({ address: activeGuard }),
    publicClient.readContract({ address: activeGuard, abi: artifactAndHash().artifact.abi, functionName: "permitRegistered", args: [authorization.permitId] }),
    publicClient.readContract({ address: activeGuard, abi: artifactAndHash().artifact.abi, functionName: "intentRegistered", args: [authorization.intentId] }),
    publicClient.readContract({ address: activeGuard, abi: artifactAndHash().artifact.abi, functionName: "revoked", args: [authorization.permitId] }),
    publicClient.readContract({ address: activeGuard, abi: artifactAndHash().artifact.abi, functionName: "consumed", args: [authorization.permitId] }),
  ]);
  const installed = `0x${installedWord.slice(-40)}`;
  if (guardOwner.toLowerCase() !== journal.safe.toLowerCase() || guardSafe.toLowerCase() !== journal.safe.toLowerCase() || !relayAllowed || installed.toLowerCase() !== activeGuard.toLowerCase() || !code || code === "0x" || keccak256(code).toLowerCase() !== journal.activeGuardRuntimeCodeHash.toLowerCase()) throw new Error("LIVE_SAFE_GUARD_IDENTITY_MISMATCH");
  if (expectedState === "UNREGISTERED") {
    if (BigInt(nonce) !== authorization.safeNonce || permitRegistered || intentRegistered || revoked || consumed) throw new Error("SAFE_OR_GUARD_STATE_NOT_READY_FOR_AUTHORIZATION");
    if (authorization.executionDeadline <= BigInt(Math.floor(Date.now() / 1000)) || authorization.expiresAt <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("PROSPECTIVE_RELAY_AUTHORIZATION_EXPIRED");
  } else if (expectedState === "REGISTERED") {
    if (BigInt(nonce) !== authorization.safeNonce || !permitRegistered || !intentRegistered || revoked || consumed) throw new Error("SAFE_OR_GUARD_STATE_NOT_READY_FOR_EXECUTION");
  } else if (expectedState === "CONSUMED") {
    if (BigInt(nonce) !== authorization.safeNonce + 1n || !permitRegistered || !intentRegistered || revoked || !consumed) throw new Error("SAFE_OR_GUARD_STATE_NOT_READY_FOR_REPLAY_TEST");
  }
  return { response, authorization, call, permitId, intentId, adjudicationId, key: executionKey(authorization) };
}

async function sendOwnerTransaction(journal, owner, entry, to, data, { expectedRevert = false, expectedExecution = "SUCCESS", explicitGas = null, afterFinalized } = {}) {
  const old = journal.transactions[entry];
  const argsHash = hexHash(stable({ to: to ?? null, data, value: "0" }));
  if (old) {
    if (old.argumentsSha256 !== argsHash || old.signer.toLowerCase() !== owner.address.toLowerCase()) throw new Error(`JOURNAL_OPERATION_MISMATCH:${entry}`);
    if (old.finalizedAt && old.canonicalReadback) return old;
    if (old.submissionHash) return await recoverOrTrackExisting(journal, owner, entry, to, data, afterFinalized);
    throw new Error(`SUBMISSION_STATUS_UNCERTAIN_NO_AUTOMATIC_RESUBMIT:${entry}`);
  }

  const preflight = await checkNetworkAndRegistry();
  const expectedNonce = BigInt(journal.ownerNonce);
  if (BigInt(preflight.latestNonce) !== expectedNonce || BigInt(preflight.pendingNonce) !== expectedNonce) throw new Error(`OWNER_NONCE_CHANGED:${entry}`);
  const feeData = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(preflight.gasPriceWei);
  if (typeof maxFeePerGas !== "bigint" || maxFeePerGas <= 0n) throw new Error("FEE_QUOTE_INVALID");
  let gas;
  if (explicitGas !== null) gas = explicitGas;
  else {
    if (expectedRevert) throw new Error("EXPECTED_REVERT_REQUIRES_SIMULATION_AND_EXPLICIT_GAS");
    gas = await publicClient.estimateGas({ account: owner, from: owner.address, to, data, value: 0n });
    gas = (gas * 125n + 99n) / 100n;
  }
  const estimatedFeeWei = gas * maxFeePerGas;
  const totalAfterEstimate = BigInt(journal.totalActualDebitWei) + estimatedFeeWei;
  if (totalAfterEstimate > MAX_DEBIT_WEI || BigInt(preflight.ownerBalanceWei) < estimatedFeeWei) throw new Error("SPENDING_CAP_OR_BALANCE_PREFLIGHT_FAILED");

  const unsigned = {
    account: owner, chainId: CHAIN_ID, type: "eip1559", nonce: expectedNonce, gas,
    maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n,
    to: to ?? undefined, data, value: 0n,
  };
  const signed = await owner.signTransaction(unsigned);
  const submissionHash = keccak256(signed);
  const record = {
    network: NETWORK, chainId: CHAIN_ID, contract: to ?? null, signer: owner.address,
    nonce: expectedNonce.toString(), method: entry,
    argumentsSha256: argsHash, submissionHash, status: "HASH_PERSISTED_BEFORE_BROADCAST",
    consensusStatus: "EVM_RECEIPT_PENDING", executionOutcome: "PENDING",
    canonicalReadback: null, transactionTo: to ?? null, transactionData: data,
    estimatedGas: gas.toString(), maxFeePerGasWei: maxFeePerGas.toString(),
    maxPriorityFeePerGasWei: (feeData.maxPriorityFeePerGas ?? 0n).toString(),
    estimatedFeeWei: estimatedFeeWei.toString(), actualFeeWei: null, valueTransferredWei: "0",
    expectedExecution,
    submittedAt: now(), receipt: null, finalizedAt: null,
  };
  journal.transactions[entry] = record;
  journal.updatedAt = now();
  saveJournal(journal);
  persistSignedTransaction(submissionHash, signed);
  try {
    const sentHash = await publicClient.sendRawTransaction({ serializedTransaction: signed });
    if (sentHash.toLowerCase() !== submissionHash.toLowerCase()) throw new Error("SIGNED_TRANSACTION_HASH_MISMATCH");
    record.status = "SUBMITTED_TRACKING_SAME_HASH";
    record.submissionAcceptedHash = sentHash;
    record.submittedAt = now();
    saveJournal(journal);
  } catch {
    record.status = "SUBMISSION_OUTCOME_UNCERTAIN_TRACKING_SAME_HASH_NO_REBROADCAST";
    record.submissionError = "RPC submission response unavailable; polling only the hash persisted before network send.";
    saveJournal(journal);
  }
  return await trackExisting(journal, owner, entry, afterFinalized);
}

async function recoverOrTrackExisting(journal, owner, entry, requestedTo, requestedData, afterFinalized) {
  const record = journal.transactions[entry];
  if (!record?.submissionHash) throw new Error(`PERSISTED_TRANSACTION_HASH_MISSING:${entry}`);
  if (record.finalizedAt && record.canonicalReadback) return record;
  const requestedArgsHash = hexHash(stable({ to: requestedTo ?? null, data: requestedData, value: "0" }));
  if (record.argumentsSha256 !== requestedArgsHash || record.signer.toLowerCase() !== owner.address.toLowerCase()) throw new Error(`JOURNAL_OPERATION_MISMATCH:${entry}`);

  // First reconcile by the already-persisted transaction hash. Never create a
  // replacement transaction merely because a receipt or terminal request timed out.
  let knownTransaction = null;
  let knownReceipt = null;
  try { knownTransaction = await publicClient.getTransaction({ hash: record.submissionHash }); } catch { /* provider reports unknown hash */ }
  try { knownReceipt = await publicClient.getTransactionReceipt({ hash: record.submissionHash }); } catch { /* provider reports no receipt */ }
  if (knownTransaction || knownReceipt) return await trackExisting(journal, owner, entry, afterFinalized);

  const latestNonce = await publicClient.getTransactionCount({ address: owner.address, blockTag: "latest" });
  const pendingNonce = await publicClient.getTransactionCount({ address: owner.address, blockTag: "pending" });
  const expectedNonce = BigInt(record.nonce);
  if (BigInt(latestNonce) !== expectedNonce || BigInt(pendingNonce) !== expectedNonce) {
    throw new Error(`UNRESOLVED_EXISTING_HASH_NONCE_CONFLICT_STOP:${entry}:${record.submissionHash}`);
  }

  let signed = loadPersistedSignedTransaction(record.submissionHash);
  if (!signed) {
    const txTo = record.transactionTo === undefined ? requestedTo ?? null : record.transactionTo;
    const txData = record.transactionData ?? requestedData;
    const gas = BigInt(record.estimatedGas);
    const maxFeePerGas = BigInt(record.maxFeePerGasWei);
    const feeCandidates = record.maxPriorityFeePerGasWei !== undefined
      ? [BigInt(record.maxPriorityFeePerGasWei)]
      : Array.from({ length: Number(maxFeePerGas < 1024n ? maxFeePerGas + 1n : 0n) }, (_, index) => BigInt(index));
    if (feeCandidates.length === 0) throw new Error(`SIGNED_TRANSACTION_RECOVERY_FIELDS_MISSING_STOP:${entry}`);
    for (const maxPriorityFeePerGas of feeCandidates) {
      const candidate = await owner.signTransaction({
        account: owner, chainId: CHAIN_ID, type: "eip1559", nonce: expectedNonce,
        gas, maxFeePerGas, maxPriorityFeePerGas,
        to: txTo ?? undefined, data: txData, value: 0n,
      });
      if (keccak256(candidate).toLowerCase() === record.submissionHash.toLowerCase()) {
        signed = candidate;
        record.transactionTo = txTo;
        record.transactionData = txData;
        record.maxPriorityFeePerGasWei = maxPriorityFeePerGas.toString();
        record.signedTransactionRecoveredAt = now();
        saveJournal(journal);
        persistSignedTransaction(record.submissionHash, signed);
        break;
      }
    }
  }
  if (!signed) throw new Error(`EXACT_SIGNED_TRANSACTION_HASH_RECONSTRUCTION_FAILED_STOP:${entry}`);

  // Reconcile once more immediately before sending. This path is used only
  // when the persisted hash is absent and both canonical and pending nonces
  // still equal the recorded nonce; it can only submit the exact same hash.
  try { knownTransaction = await publicClient.getTransaction({ hash: record.submissionHash }); } catch { knownTransaction = null; }
  try { knownReceipt = await publicClient.getTransactionReceipt({ hash: record.submissionHash }); } catch { knownReceipt = null; }
  if (knownTransaction || knownReceipt) return await trackExisting(journal, owner, entry, afterFinalized);
  const [latestBeforeSend, pendingBeforeSend] = await Promise.all([
    publicClient.getTransactionCount({ address: owner.address, blockTag: "latest" }),
    publicClient.getTransactionCount({ address: owner.address, blockTag: "pending" }),
  ]);
  if (BigInt(latestBeforeSend) !== expectedNonce || BigInt(pendingBeforeSend) !== expectedNonce) throw new Error(`UNRESOLVED_EXISTING_HASH_NONCE_CONFLICT_STOP:${entry}:${record.submissionHash}`);
  try {
    const sentHash = await publicClient.sendRawTransaction({ serializedTransaction: signed });
    if (sentHash.toLowerCase() !== record.submissionHash.toLowerCase()) throw new Error("SIGNED_TRANSACTION_HASH_MISMATCH");
    record.status = "SUBMITTED_TRACKING_RECOVERED_EXACT_HASH";
    record.submissionAcceptedHash = sentHash;
    record.recoveredAndSubmittedAt = now();
  } catch {
    record.status = "SUBMISSION_OUTCOME_UNCERTAIN_TRACKING_SAME_HASH_NO_REPLACEMENT";
  }
  record.lastPollAt = now();
  saveJournal(journal);
  return await trackExisting(journal, owner, entry, afterFinalized);
}

async function waitForReceipt(hash) {
  let pause = 4_000;
  for (;;) {
    try {
      const [receipt, transaction] = await Promise.all([
        publicClient.getTransactionReceipt({ hash }), publicClient.getTransaction({ hash }),
      ]);
      return { receipt, transaction };
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, pause));
      pause = Math.min(30_000, Math.floor(pause * 1.5));
    }
  }
}

async function trackExisting(journal, owner, entry, afterFinalized) {
  const record = journal.transactions[entry];
  if (!record?.submissionHash) throw new Error(`PERSISTED_TRANSACTION_HASH_MISSING:${entry}`);
  if (record.finalizedAt && record.canonicalReadback) return record;
  let pause = 4_000;
  for (;;) {
    try {
      const { receipt, transaction } = await waitForReceipt(record.submissionHash);
      if (receipt.transactionHash.toLowerCase() !== record.submissionHash.toLowerCase()) throw new Error("RECEIPT_TRANSACTION_HASH_MISMATCH");
      const status = receipt.status;
      const finalized = await publicClient.getBlock({ blockTag: "finalized" });
      const canonicalBlock = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      if (canonicalBlock.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
        record.status = "REORG_DETECTED_TRACKING_SAME_HASH";
        record.lastPollAt = now();
        saveJournal(journal);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, pause));
        pause = Math.min(30_000, Math.floor(pause * 1.5));
        continue;
      }
      record.receipt = {
        transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash, status: status === "success" ? "SUCCESS" : "REVERTED",
        gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
        logCount: receipt.logs.length,
      };
      record.actualFeeWei = (receipt.gasUsed * receipt.effectiveGasPrice).toString();
      record.valueTransferredWei = transaction.value.toString();
      record.lastPollAt = now();
      if (BigInt(finalized.number) < receipt.blockNumber) {
        record.status = "MINED_WAITING_FOR_FINALIZED_TAG";
        journal.updatedAt = now(); saveJournal(journal);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, pause));
        pause = Math.min(30_000, Math.floor(pause * 1.5));
        continue;
      }
      const expectedRevert = String(record.expectedExecution ?? "").startsWith("REVERTED_");
      if (receipt.status === "reverted" && !expectedRevert) {
        record.status = "FINALIZED_UNEXPECTED_EXECUTION_REVERT_STOP";
        record.consensusStatus = "FINALIZED_EVM_REVERTED";
        record.executionOutcome = "UNEXPECTED_REVERT";
        record.finalizedAt = now();
        saveJournal(journal);
        throw new Error(`FINALIZED_EVM_REVERTED_STOP:${entry}:${record.submissionHash}`);
      }
      if (receipt.status === "success" && expectedRevert) {
        record.status = "FINALIZED_UNEXPECTED_SUCCESS_STOP";
        record.consensusStatus = "FINALIZED_EVM_SUCCESS";
        record.executionOutcome = "UNAUTHORIZED_CALL_WAS_NOT_BLOCKED";
        record.finalizedAt = now(); saveJournal(journal);
        throw new Error(`UNAUTHORIZED_CALL_WAS_NOT_BLOCKED_STOP:${entry}`);
      }
      const fee = BigInt(record.actualFeeWei);
      const spent = BigInt(journal.totalActualDebitWei) + fee + BigInt(record.valueTransferredWei);
      if (spent > MAX_DEBIT_WEI) {
        record.status = "FINALIZED_SPENDING_CAP_BREACHED_STOP";
        record.executionOutcome = "SPEND_CAP_BREACHED";
        saveJournal(journal);
        throw new Error("FINALIZED_SPENDING_CAP_BREACHED_STOP");
      }
      let readback;
      try {
        readback = afterFinalized ? await afterFinalized(receipt, transaction) : { finalizedBlock: finalized.number.toString(), canonicalBlockHash: canonicalBlock.hash };
      } catch (error) {
        record.status = "FINALIZED_CANONICAL_READBACK_FAILED_STOP";
        record.readbackError = error instanceof Error ? error.message.split("\n", 1)[0] : "CANONICAL_READBACK_FAILED";
        record.finalizedAt = now();
        saveJournal(journal);
        throw new Error(`FINALIZED_CANONICAL_READBACK_FAILED_STOP:${record.readbackError}`);
      }
      record.canonicalReadback = readback;
      record.consensusStatus = "FINALIZED_CANONICAL_EVM_RECEIPT";
      record.executionOutcome = record.expectedExecution === "REVERTED_GUARD_BLOCK" ? "REJECTED_BY_INSTALLED_GUARD" : expectedRevert ? "REJECTED_BY_GUARD_RULE" : "SUCCESS";
      record.status = expectedRevert ? "FINALIZED_REJECTED_CANONICAL_READBACK" : "FINALIZED_SUCCESS_CANONICAL_READBACK";
      record.finalizedAt = now();
      journal.totalActualDebitWei = spent.toString();
      journal.ownerNonce = (BigInt(record.nonce) + 1n).toString();
      journal.updatedAt = now();
      saveJournal(journal);
      process.stdout.write(`${JSON.stringify({ operation: entry, status: record.status, transaction: record.submissionHash, execution: record.executionOutcome, actualFeeWei: record.actualFeeWei, valueWei: record.valueTransferredWei, canonicalReadback: record.canonicalReadback })}\n`);
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      if (/^(?:FINALIZED_EVM_REVERTED_STOP|UNAUTHORIZED_CALL_WAS_NOT_BLOCKED_STOP|FINALIZED_SPENDING_CAP_BREACHED_STOP|FINALIZED_CANONICAL_READBACK_FAILED_STOP):?/.test(message)) throw error;
      record.lastPollError = "RPC_READ_UNAVAILABLE_TRACKING_SAME_HASH";
      record.lastPollAt = now(); saveJournal(journal);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, pause));
      pause = Math.min(30_000, Math.floor(pause * 1.5));
    }
  }
}

async function assertSafeIdentity(safe, owner) {
  const [owners, threshold, nonce, implementation, code, modules] = await Promise.all([
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" }),
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getThreshold" }),
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "masterCopy" }),
    publicClient.getCode({ address: safe }),
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getModulesPaginated", args: [SAFE_MODULE_SENTINEL, 10n] }),
  ]);
  if (!code || code === "0x" || owners.length !== 1 || owners[0].toLowerCase() !== owner.toLowerCase() || threshold !== 1n || implementation.toLowerCase() !== SAFE_SINGLETON.toLowerCase() || modules[0].length !== 0 || modules[1].toLowerCase() !== SAFE_MODULE_SENTINEL.toLowerCase()) throw new Error("SAFE_OWNER_THRESHOLD_IMPLEMENTATION_OR_MODULE_READBACK_FAILED");
  return { safe, owners, threshold: threshold.toString(), nonce: nonce.toString(), implementation, modulePathDisabled: true, codeHash: keccak256(code) };
}

async function main() {
  const action = process.argv[2] ?? "preflight";
  if (!ALLOWED.has(action)) throw new Error("ACTION_NOT_IN_EXPLICIT_PUBLIC_WRITE_ALLOWLIST");
  let journal = loadJournal();
  const { owner, relay, relayKey } = await loadAccounts(journal);
  if (journal && journal.relaySigner.toLowerCase() !== relay.address.toLowerCase()) throw new Error("RELAY_SIGNER_CHANGED_SINCE_PREFLIGHT");
  const preflight = await checkNetworkAndRegistry();
  if (!journal) {
    journal = newJournal(preflight, relay.address);
    if (BigInt(preflight.ownerBalanceWei) < 1_000_000_000_000n) throw new Error("SEPOLLIA_BALANCE_TOO_LOW_FOR_QUALIFICATION");
    saveJournal(journal);
  } else {
    journal.preflight = preflight;
    journal.updatedAt = now();
    saveJournal(journal);
  }
  if (action === "preflight") {
    const guard = artifactAndHash();
    const approval = {
      spendAuthorization: "User authorized testnet enforcement qualification; internal safety cap remains 0.001 ETH.",
      network: NETWORK, chainId: CHAIN_ID, rpcUrl: RPC_URL, owner: owner.address, relaySigner: relay.address,
      safeCreation: "one user-controlled 1-of-1 Safe proxy using registry-verified Safe 1.4.1 singleton",
      requiredTransactions: ["Safe proxy creation", "zero-value owner-signed canary", "Guard deployment", "Guard ownership transfer to that Safe", "Guard installation through that Safe", "no-permit blocked call", "candidate permit registration", "authorized call", "wrong-target and wrong-calldata rejections", "expired authorization rejection", "replay rejection"],
      maxAggregateDebitWei: MAX_DEBIT_WEI.toString(), maxAggregateDebitEth: "0.001",
      currentOwnerBalanceWei: preflight.ownerBalanceWei, currentOwnerNonce: preflight.latestNonce,
      actualDebitSoFarWei: journal.totalActualDebitWei, pendingNonce: preflight.pendingNonce,
      guardSourceSha256: guard.actualSourceHash, guardArtifactCompiler: guard.artifact.compiler,
      registryCodeHashesVerified: Object.values(preflight.safeRegistry).every((item) => item.matches),
      contractWritesAllowed: true, deploymentMethodsAllowed: false,
      status: "READY_FOR_EXPLICIT_ALLOWLISTED_SAFE_QUALIFICATION_WRITES",
    };
    journal.approvalAndPreflight = approval;
    journal.checkpoint = approval.status;
    saveJournal(journal);
    console.log(JSON.stringify(approval, null, 2));
    return;
  }

  if (action === "status") {
    const records = Object.values(journal.transactions);
    console.log(JSON.stringify({ status: journal.checkpoint, safe: journal.safe, historicalGuard: journal.guard, activeGuard: journal.activeGuard ?? journal.guard, relaySigner: journal.relaySigner, ownerNonce: preflight.latestNonce, pendingNonce: preflight.pendingNonce, totalActualDebitWei: journal.totalActualDebitWei, maxAggregateDebitWei: journal.maxAggregateDebitWei, transactionCount: records.length, transactions: records.map(({ method, nonce, submissionHash, status, executionOutcome, actualFeeWei, canonicalReadback }) => ({ method, nonce, submissionHash, status, executionOutcome, actualFeeWei, canonicalReadback })) }, null, 2));
    return;
  }

  if (action === "create-safe") {
    if (journal.safe) throw new Error("SAFE_ALREADY_RECORDED_NO_SECOND_SAFE_CREATION");
    if (preflight.latestNonce !== preflight.pendingNonce || BigInt(preflight.latestNonce) !== BigInt(journal.ownerNonce)) throw new Error("OWNER_NONCE_MISMATCH_BEFORE_SAFE_CREATION");
    const setup = encodeFunctionData({ abi: safeAbi, functionName: "setup", args: [[owner.address], 1n, zeroAddress, "0x", zeroAddress, zeroAddress, 0n, zeroAddress] });
    const saltNonce = journal.safeCreationSaltNonce
      ? BigInt(journal.safeCreationSaltNonce)
      : BigInt(`0x${randomBytes(16).toString("hex")}`);
    const data = encodeFunctionData({ abi: safeFactoryAbi, functionName: "createProxyWithNonce", args: [SAFE_SINGLETON, setup, saltNonce] });
    journal.safeCreationSaltNonce = saltNonce.toString(); saveJournal(journal);
    await sendOwnerTransaction(journal, owner, "create_safe", SAFE_FACTORY, data, {
      afterFinalized: async (receipt) => {
        const matches = parseEventLogs({ abi: safeFactoryAbi, logs: receipt.logs, eventName: "ProxyCreation" });
        if (matches.length !== 1 || matches[0].args.singleton.toLowerCase() !== SAFE_SINGLETON.toLowerCase()) throw new Error("SAFE_PROXY_CREATION_EVENT_IDENTITY_FAILED");
        const safe = matches[0].args.proxy;
        const identity = await assertSafeIdentity(safe, owner.address);
        journal.safe = safe;
        saveJournal(journal);
        return { ...identity, createdBy: SAFE_FACTORY, creationEvent: "ProxyCreation", creationSaltNonce: saltNonce.toString() };
      },
    });
    await refreshCheckpoint(journal, "USER_CONTROLLED_SAFE_FINALIZED_AND_VERIFIED");
    return;
  }

  if (!journal.safe) throw new Error("SAFE_CREATION_MUST_FINALIZE_BEFORE_THIS_ACTION");
  const safe = journal.safe;
  const identity = await assertSafeIdentity(safe, owner.address);

  if (action === "canary") {
    if (journal.transactions.canary?.finalizedAt && journal.transactions.canary.canonicalReadback) return journal.transactions.canary;
    if (journal.transactions.canary) return await trackExisting(journal, owner, "canary", async (receipt) => {
      const success = parseEventLogs({ abi: safeAbi, logs: receipt.logs, eventName: "ExecutionSuccess" });
      if (success.length !== 1) throw new Error("SAFE_CANARY_EXECUTION_SUCCESS_EVENT_MISSING");
      const fresh = await assertSafeIdentity(safe, owner.address);
      return { ...fresh, executionSuccessEvent: true };
    });
    const details = await safeCallDetails(safe, owner, relay.address, 0n, "0x");
    const record = await sendOwnerTransaction(journal, owner, "canary", safe, details.dataToSafe, {
      afterFinalized: async (receipt) => {
        const success = parseEventLogs({ abi: safeAbi, logs: receipt.logs, eventName: "ExecutionSuccess" });
        if (success.length !== 1) throw new Error("SAFE_CANARY_EXECUTION_SUCCESS_EVENT_MISSING");
        const fresh = await assertSafeIdentity(safe, owner.address);
        const nonce = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" });
        if (BigInt(nonce) !== BigInt(details.safeNonce) + 1n) throw new Error("SAFE_CANARY_NONCE_READBACK_FAILED");
        return { ...fresh, safeTransactionHash: details.safeTxHash, canaryTarget: relay.address, canaryValueWei: "0", canaryCalldata: "0x", canaryOperation: 0, executionSuccessEvent: true };
      },
    });
    record.safeTransaction = { nonce: details.safeNonce, target: relay.address, valueWei: "0", calldata: "0x", operation: 0, hash: details.safeTxHash };
    saveJournal(journal);
    await refreshCheckpoint(journal, "SAFE_CANARY_FINALIZED_SUCCESS_AND_CANONICAL_READBACK");
    return;
  }

  const { artifact, actualSourceHash } = artifactAndHash();
  if (action === "deploy-guard" || action === "deploy-guard-revision") {
    const revision = action === "deploy-guard-revision";
    const journalKey = revision ? "deploy_guard_revision" : "deploy_guard";
    if (revision) {
      const qualificationPath = resolve(ROOT, "evidence/qualification/current/safe_guard_official_fork.json");
      if (!existsSync(qualificationPath)) throw new Error("MATCHING_OFFICIAL_SAFE_FORK_QUALIFICATION_REQUIRED_BEFORE_GUARD_REVISION_DEPLOYMENT");
      const qualification = JSON.parse(readFileSync(qualificationPath, "utf8"));
      if (qualification.status !== "PASS_LOCAL_OFFICIAL_SAFE_FORK_ONLY" || qualification.guardSourceSha256 !== actualSourceHash || qualification.safeHookNonceSemantics !== "Safe v1.4.1 increments nonce before guard check; authorization uses nonce-1") throw new Error("OFFICIAL_SAFE_FORK_PROOF_SOURCE_OR_NONCE_SEMANTICS_MISMATCH");
    }
    if (!revision && journal.guard) throw new Error("GUARD_ALREADY_RECORDED_NO_SECOND_DEPLOYMENT");
    if (revision && journal.activeGuard) throw new Error("ACTIVE_GUARD_REVISION_ALREADY_RECORDED_NO_SECOND_DEPLOYMENT");
    if (journal.transactions[journalKey]?.submissionHash) {
      await trackExisting(journal, owner, journalKey, async (receipt) => {
        if (!receipt.contractAddress) throw new Error("GUARD_DEPLOYMENT_ADDRESS_MISSING");
        const address = receipt.contractAddress;
        const [code, configuredSafe, ownerOnGuard, relayAllowed] = await Promise.all([
          publicClient.getCode({ address }),
          publicClient.readContract({ address, abi: artifact.abi, functionName: "safe" }),
          publicClient.readContract({ address, abi: artifact.abi, functionName: "owner" }),
          publicClient.readContract({ address, abi: artifact.abi, functionName: "authorizedRelayer", args: [relay.address] }),
        ]);
        if (!code || code === "0x" || configuredSafe.toLowerCase() !== safe.toLowerCase() || ownerOnGuard.toLowerCase() !== owner.address.toLowerCase() || !relayAllowed) throw new Error("DEPLOYED_GUARD_CONSTRUCTOR_READBACK_FAILED");
        if (revision) {
          journal.activeGuard = address;
          journal.activeGuardSourceSha256 = actualSourceHash;
          journal.activeGuardRuntimeCodeHash = keccak256(code);
          journal.guardRevisions = [...(journal.guardRevisions ?? []), { address, sourceSha256: actualSourceHash, runtimeCodeHash: keccak256(code) }];
        } else {
          journal.guard = address;
          journal.guardSourceSha256 = actualSourceHash;
          journal.guardRuntimeCodeHash = keccak256(code);
        }
        saveJournal(journal);
        return { guard: address, sourceSha256: actualSourceHash, runtimeCodeHash: keccak256(code), safe: configuredSafe, initialOwner: ownerOnGuard, relaySigner: relay.address, relayAuthorized: relayAllowed, revision };
      });
      await refreshCheckpoint(journal, revision ? "GUARD_REVISION_DEPLOYMENT_RECOVERED_FINALIZED" : "GUARD_DEPLOYMENT_RECOVERED_FINALIZED");
      return journal.transactions[journalKey];
    }
    const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.creationBytecode, args: [safe, relay.address] });
    const record = await sendOwnerTransaction(journal, owner, journalKey, null, data, {
      afterFinalized: async (receipt) => {
        if (!receipt.contractAddress) throw new Error("GUARD_DEPLOYMENT_ADDRESS_MISSING");
        const address = receipt.contractAddress;
        const [code, configuredSafe, ownerOnGuard, relayAllowed] = await Promise.all([
          publicClient.getCode({ address }),
          publicClient.readContract({ address, abi: artifact.abi, functionName: "safe" }),
          publicClient.readContract({ address, abi: artifact.abi, functionName: "owner" }),
          publicClient.readContract({ address, abi: artifact.abi, functionName: "authorizedRelayer", args: [relay.address] }),
        ]);
        if (!code || code === "0x" || configuredSafe.toLowerCase() !== safe.toLowerCase() || ownerOnGuard.toLowerCase() !== owner.address.toLowerCase() || !relayAllowed) throw new Error("DEPLOYED_GUARD_CONSTRUCTOR_READBACK_FAILED");
        if (revision) {
          journal.activeGuard = address;
          journal.activeGuardSourceSha256 = actualSourceHash;
          journal.activeGuardRuntimeCodeHash = keccak256(code);
          journal.guardRevisions = [...(journal.guardRevisions ?? []), { address, sourceSha256: actualSourceHash, runtimeCodeHash: keccak256(code) }];
        } else {
          journal.guard = address;
          journal.guardSourceSha256 = actualSourceHash;
          journal.guardRuntimeCodeHash = keccak256(code);
        }
        saveJournal(journal);
        return { guard: address, sourceSha256: actualSourceHash, runtimeCodeHash: keccak256(code), safe: configuredSafe, initialOwner: ownerOnGuard, relaySigner: relay.address, relayAuthorized: relayAllowed, revision };
      },
    });
    await refreshCheckpoint(journal, revision ? "GUARD_REVISION_DEPLOYMENT_FINALIZED_SOURCE_AND_CONSTRUCTOR_VERIFIED" : "GUARD_DEPLOYMENT_FINALIZED_SOURCE_AND_CONSTRUCTOR_VERIFIED");
    return record;
  }

  const activeGuard = journal.activeGuard ?? journal.guard;
  if (!activeGuard) throw new Error("GUARD_DEPLOYMENT_MUST_FINALIZE_BEFORE_THIS_ACTION");
  if (action === "transfer-guard-owner") {
    const data = encodeFunctionData({ abi: artifact.abi, functionName: "transferOwnership", args: [safe] });
    await sendOwnerTransaction(journal, owner, "transfer_guard_owner", activeGuard, data, {
      afterFinalized: async () => {
        const guardOwner = await publicClient.readContract({ address: activeGuard, abi: guardAdminAbi, functionName: "owner" });
        if (guardOwner.toLowerCase() !== safe.toLowerCase()) throw new Error("GUARD_OWNER_NOT_TRANSFERRED_TO_SAFE");
        return { guard: activeGuard, owner: guardOwner, safeOwnsGuardAdministration: true };
      },
    });
    await refreshCheckpoint(journal, "GUARD_ADMINISTRATION_TRANSFERRED_TO_SAFE");
    return;
  }

  if (action === "install-guard") {
    const ownerOnGuard = await publicClient.readContract({ address: activeGuard, abi: guardAdminAbi, functionName: "owner" });
    if (ownerOnGuard.toLowerCase() !== safe.toLowerCase()) throw new Error("GUARD_MUST_BE_SAFE_OWNED_BEFORE_INSTALL");
    if (journal.transactions.install_guard?.finalizedAt && journal.transactions.install_guard.canonicalReadback) return journal.transactions.install_guard;
    const details = await durableSafeCallDetails(journal, owner, "install_guard", safe, 0n, encodeFunctionData({ abi: safeAbi, functionName: "setGuard", args: [activeGuard] }));
    await sendOwnerTransaction(journal, owner, "install_guard", safe, details.dataToSafe, {
      afterFinalized: async (receipt) => {
        const success = parseEventLogs({ abi: safeAbi, logs: receipt.logs, eventName: "ExecutionSuccess" });
        const guardWord = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] });
        const installedGuard = `0x${guardWord.slice(-40)}`;
        const fresh = await assertSafeIdentity(safe, owner.address);
        if (success.length !== 1 || installedGuard.toLowerCase() !== activeGuard.toLowerCase()) throw new Error("SAFE_GUARD_INSTALLATION_READBACK_FAILED");
        return { ...fresh, installedGuard, installationSafeTxHash: details.safeTxHash, executionSuccessEvent: true };
      },
    });
    await refreshCheckpoint(journal, "GUARD_INSTALLED_FINALIZED_SAFE_OWNED_AND_MODULE_PATH_DISABLED");
    return;
  }

  if (action === "register-authorization") {
    const guardAbi = artifact.abi;
    const attestation = await readProspectiveAttestation(journal, owner, relay, activeGuard, "UNREGISTERED");
    const data = encodeFunctionData({ abi: guardAbi, functionName: "registerAuthorization", args: [attestation.authorization, attestation.response.signature] });
    await sendOwnerTransaction(journal, owner, "register_authorization", activeGuard, data, {
      afterFinalized: async (receipt) => {
        const events = parseEventLogs({ abi: guardAbi, logs: receipt.logs, eventName: "AuthorizationRegistered" });
        const [permitRegistered, intentRegistered, revoked, consumed, registered] = await Promise.all([
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "permitRegistered", args: [attestation.authorization.permitId] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "intentRegistered", args: [attestation.authorization.intentId] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "revoked", args: [attestation.authorization.permitId] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "consumed", args: [attestation.authorization.permitId] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "authorizations", args: [attestation.key] }),
        ]);
        const values = Array.isArray(registered) ? registered : Object.values(registered ?? {});
        const storedPermitId = values[0];
        if (events.length !== 1 || events[0].args.permitId.toLowerCase() !== attestation.authorization.permitId.toLowerCase() || events[0].args.intentId.toLowerCase() !== attestation.authorization.intentId.toLowerCase() || events[0].args.signer.toLowerCase() !== relay.address.toLowerCase() || !permitRegistered || !intentRegistered || revoked || consumed || String(storedPermitId).toLowerCase() !== attestation.authorization.permitId.toLowerCase()) throw new Error("ONCHAIN_PROSPECTIVE_AUTHORIZATION_READBACK_FAILED");
        journal.prospectivePermit = attestation.permitId;
        journal.prospectiveIntent = attestation.intentId;
        return { guard: activeGuard, safe, permitId: attestation.permitId, intentId: attestation.intentId, relaySigner: relay.address, executionKey: attestation.key, permitRegistered, intentRegistered, consumed, revoked, authorizationEvent: true, canonicalGenLayer: attestation.response.canonicalGenLayer };
      },
    });
    await refreshCheckpoint(journal, "CANONICAL_PROSPECTIVE_PERMIT_ATTESTATION_REGISTERED_ON_GUARD");
    return;
  }

  if (action === "authorized-execution") {
    if (journal.transactions.authorized_execution?.finalizedAt && journal.transactions.authorized_execution.canonicalReadback) return journal.transactions.authorized_execution;
    const guardAbi = artifact.abi;
    const attestation = await readProspectiveAttestation(journal, owner, relay, activeGuard, "REGISTERED");
    const details = await durableSafeCallDetails(journal, owner, "authorized_execution", attestation.authorization.to, attestation.authorization.value, attestation.call.data);
    if (BigInt(details.safeNonce) !== attestation.authorization.safeNonce) throw new Error("AUTHORIZED_SAFE_NONCE_MISMATCH");
    await sendOwnerTransaction(journal, owner, "authorized_execution", safe, details.dataToSafe, {
      afterFinalized: async (receipt) => {
        const execution = parseEventLogs({ abi: safeAbi, logs: receipt.logs, eventName: "ExecutionSuccess" });
        const [nonce, installedWord, consumed, permitRegistered, revoked] = await Promise.all([
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "consumed", args: [attestation.authorization.permitId] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "permitRegistered", args: [attestation.authorization.permitId] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "revoked", args: [attestation.authorization.permitId] }),
        ]);
        const installed = `0x${installedWord.slice(-40)}`;
        if (execution.length !== 1 || BigInt(nonce) !== attestation.authorization.safeNonce + 1n || installed.toLowerCase() !== activeGuard.toLowerCase() || !consumed || !permitRegistered || revoked) throw new Error("AUTHORIZED_SAFE_EXECUTION_OR_PERMIT_CONSUMPTION_READBACK_FAILED");
        return { safe, guard: activeGuard, installedGuard: installed, permitId: attestation.permitId, intentId: attestation.intentId, safeNonceBefore: details.safeNonce, safeNonceAfter: nonce.toString(), safeTransactionHash: details.safeTxHash, target: details.target, valueWei: details.value, calldata: details.data, operation: 0, executionSuccessEvent: true, permitConsumed: consumed, permitRegistered, receiptStatus: "SUCCESS" };
      },
    });
    journal.transactions.authorized_execution.safeTransaction = { nonce: details.safeNonce, target: details.target, valueWei: details.value, calldata: details.data, operation: 0, hash: details.safeTxHash };
    saveJournal(journal);
    await refreshCheckpoint(journal, "AUTHORIZED_PROSPECTIVE_SAFE_EXECUTION_FINALIZED_WITH_GUARD_INSTALLED");
    return;
  }

  if (action === "blocked-wrong-target" || action === "blocked-wrong-calldata") {
    const entry = action === "blocked-wrong-target" ? "blocked_wrong_target" : "blocked_wrong_calldata";
    if (journal.transactions[entry]?.finalizedAt && journal.transactions[entry].canonicalReadback) return journal.transactions[entry];
    const guardAbi = artifact.abi;
    const attestation = await readProspectiveAttestation(journal, owner, relay, activeGuard, "REGISTERED");
    const target = action === "blocked-wrong-target" ? owner.address : activeGuard;
    const data = action === "blocked-wrong-target" ? "0x" : "0x";
    const details = await durableSafeCallDetails(journal, owner, entry, target, 0n, data);
    if (BigInt(details.safeNonce) !== attestation.authorization.safeNonce) throw new Error("ADVERSARIAL_SAFE_NONCE_CHANGED_BEFORE_REJECTION_TEST");
    const observedError = await requireExpectedRevert(
      () => publicClient.call({ account: owner.address, to: safe, data: details.dataToSafe }),
      guardAbi, ["AuthorizationMissing", "AuthorizationMismatch"], `SAFE_${entry.toUpperCase()}`,
    );
    await sendOwnerTransaction(journal, owner, entry, safe, details.dataToSafe, {
      expectedRevert: true, expectedExecution: "REVERTED_GUARD_BLOCK", explicitGas: 750_000n,
      afterFinalized: async () => {
        const [nonce, installedWord, consumed] = await Promise.all([
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "consumed", args: [attestation.authorization.permitId] }),
        ]);
        const installed = `0x${installedWord.slice(-40)}`;
        if (BigInt(nonce) !== attestation.authorization.safeNonce || installed.toLowerCase() !== activeGuard.toLowerCase() || consumed) throw new Error("ADVERSARIAL_SAFE_REJECTION_STATE_CHANGED");
        return { safe, guard: activeGuard, installedGuard: installed, permitId: attestation.permitId, reason: action === "blocked-wrong-target" ? "WRONG_TARGET" : "WRONG_CALLDATA", observedGuardError: observedError, attemptedTarget: target, attemptedCalldata: data, safeNonceUnchanged: true, canonicalPermitRemainsRegistered: true, permitConsumed: false };
      },
    });
    await refreshCheckpoint(journal, action === "blocked-wrong-target" ? "WRONG_TARGET_REJECTED_BY_INSTALLED_GUARD" : "WRONG_CALLDATA_REJECTED_BY_INSTALLED_GUARD");
    return;
  }

  if (action === "replay-execution") {
    if (journal.transactions.replay_execution?.finalizedAt && journal.transactions.replay_execution.canonicalReadback) return journal.transactions.replay_execution;
    const guardAbi = artifact.abi;
    const attestation = await readProspectiveAttestation(journal, owner, relay, activeGuard, "CONSUMED");
    const details = await durableSafeCallDetails(journal, owner, "replay_execution", attestation.authorization.to, attestation.authorization.value, attestation.call.data);
    if (BigInt(details.safeNonce) !== attestation.authorization.safeNonce + 1n) throw new Error("REPLAY_SAFE_NONCE_NOT_INCREMENTED");
    const observedError = await requireExpectedRevert(
      () => publicClient.call({ account: owner.address, to: safe, data: details.dataToSafe }),
      guardAbi, ["AuthorizationMissing", "AuthorizationAlreadyConsumed", "AuthorizationMismatch"], "SAFE_REPLAY",
    );
    await sendOwnerTransaction(journal, owner, "replay_execution", safe, details.dataToSafe, {
      expectedRevert: true, expectedExecution: "REVERTED_GUARD_BLOCK", explicitGas: 750_000n,
      afterFinalized: async () => {
        const [nonce, installedWord, consumed] = await Promise.all([
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] }),
          publicClient.readContract({ address: activeGuard, abi: guardAbi, functionName: "consumed", args: [attestation.authorization.permitId] }),
        ]);
        const installed = `0x${installedWord.slice(-40)}`;
        if (BigInt(nonce) !== attestation.authorization.safeNonce + 1n || installed.toLowerCase() !== activeGuard.toLowerCase() || !consumed) throw new Error("REPLAY_REJECTION_STATE_CHANGED");
        return { safe, guard: activeGuard, installedGuard: installed, permitId: attestation.permitId, attemptedSafeNonce: details.safeNonce, authorizedSafeNonce: attestation.authorization.safeNonce.toString(), safeNonceUnchanged: true, permitStillConsumed: consumed, observedGuardError: observedError };
      },
    });
    await refreshCheckpoint(journal, "REPLAY_REJECTED_BY_INSTALLED_GUARD_ON_PUBLIC_CHAIN");
    return;
  }

  if (action === "blocked-execution") {
    const guardWord = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] });
    if (`0x${guardWord.slice(-40)}`.toLowerCase() !== activeGuard.toLowerCase()) throw new Error("GUARD_NOT_CANONICALLY_INSTALLED");
    if (journal.transactions.blocked_execution?.finalizedAt && journal.transactions.blocked_execution.canonicalReadback) return journal.transactions.blocked_execution;
    const details = await safeCallDetails(safe, owner, owner.address, 0n, "0x");
    try {
      await publicClient.call({ account: owner.address, to: safe, data: details.dataToSafe });
      throw new Error("UNAUTHORIZED_SAFE_CALL_SIMULATION_DID_NOT_REVERT");
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED_SAFE_CALL_SIMULATION_DID_NOT_REVERT") throw error;
    }
    const journalEntry = journal.transactions.blocked_execution;
    if (journalEntry) return await trackExisting(journal, owner, "blocked_execution", async () => {
      const [nonce, installed] = await Promise.all([
        publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
        publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] }),
      ]);
      if (BigInt(nonce) !== BigInt(details.safeNonce) || `0x${installed.slice(-40)}`.toLowerCase() !== activeGuard.toLowerCase()) throw new Error("BLOCKED_CALL_CANONICAL_NONCE_OR_GUARD_MISMATCH");
      return { safe, installedGuard: `0x${installed.slice(-40)}`, safeNonceUnchanged: true, attemptedTarget: owner.address, reason: "NO_CANONICAL_PERMIT_AUTHORIZATION_REGISTERED" };
    });
    await sendOwnerTransaction(journal, owner, "blocked_execution", safe, details.dataToSafe, {
      expectedRevert: true,
      expectedExecution: "REVERTED_GUARD_BLOCK",
      explicitGas: 750_000n,
      afterFinalized: async () => {
        const [nonce, installed] = await Promise.all([
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
          publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [SAFE_GUARD_STORAGE_SLOT, 1n] }),
        ]);
        if (BigInt(nonce) !== BigInt(details.safeNonce) || `0x${installed.slice(-40)}`.toLowerCase() !== activeGuard.toLowerCase()) throw new Error("BLOCKED_CALL_CANONICAL_NONCE_OR_GUARD_MISMATCH");
        return { safe, installedGuard: `0x${installed.slice(-40)}`, safeNonceUnchanged: true, attemptedTarget: owner.address, reason: "NO_CANONICAL_PERMIT_AUTHORIZATION_REGISTERED" };
      },
    });
    await refreshCheckpoint(journal, "NO_PERMIT_SAFE_CALL_BLOCKED_BY_LIVE_GUARD");
    return;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message.split("\n", 1)[0] : "UNKNOWN";
  console.error(JSON.stringify({ status: "SEPOLIA_QUALIFICATION_STOPPED", error: message, journal: JOURNAL_PATH }));
  process.exitCode = 1;
});
