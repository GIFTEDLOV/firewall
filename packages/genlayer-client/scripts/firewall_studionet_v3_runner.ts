import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { abi, createClient, type GenLayerTransaction } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { encodeFunctionData, keccak256, stringToHex, zeroAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createProspectiveReader, type ProspectiveCanonicalModel } from "../src/prospective-reader.js";
import { verifyFinalizedConsensus } from "../src/finalized-consensus.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE_PATH = resolve(ROOT, process.env.FIREWALL_V3_SOURCE_PATH ?? "contracts/firewall_v3_prospective.py");
const SCHEMA_PATH = resolve(ROOT, process.env.FIREWALL_V3_SCHEMA_PATH ?? "artifacts/firewall_v3_prospective.schema.json");
const JOURNAL_PATH = resolve(ROOT, process.env.FIREWALL_V3_JOURNAL_PATH ?? "evidence/qualification/current/firewall-studionet-v3-transactions.json");
const LOCK_PATH = resolve(ROOT, "evidence/qualification/current/firewall-studionet-signer.run.lock");
const SOURCE_SHA256 = process.env.FIREWALL_V3_SOURCE_SHA256 ?? "f4f789babfe21deeaead970e3d3fea7e2db88effa62cc85840a4b292a10dd97a";
const NETWORK = "studionet" as const;
const CHAIN_ID = 61999;
const EVM_CHAIN_ID = 11155111;
const RPC = "https://studio.genlayer.com/api";
const SIGNER_ADDRESS = "0x33653e6e86807e41682d3346cdf648d6653384b1";
const CONSENSUS = "0xb7278a61aa25c888815afc32ad3cc52ff24fe575";
const V2_ADDRESS = "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528";
const V2_SOURCE_SHA256 = "b52a0221795a14f7bf8b916ac7d7c0753e3dabf4fb9436e8803197cd61b05163";
const SAFE = "0x9387e30C1b1a864686Df80d46786C4F29fe735ba" as const;
const SAFE_DEPLOYMENT_TX = "0xa1554d38879c0da9f38897cc6ea31b97a0299e927b2911306e694e9a7092f605" as const;
const GUARD = "0x2e8cafa2053502cf29516f6e1d47cd59a8b9a6b4" as const;
const GUARD_RUNTIME_CODE_HASH = "0x3f016a7156a3e5e0caeb61ea5311fb7952973f25cb807afeff4bf789927735f8" as const;
const RELAY_ADDRESS = "0x86eeE74900DfD0418462808aE4E53047dED4583a";
const SAFE_SINGLETON = "0x41675c099f32341bf84bfc5382af534df5c7461a";
const SAFE_FACTORY = "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67";
const SAFE_GUARD_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SAFE_MODULE_SENTINEL = "0x0000000000000000000000000000000000000001";
const OWNER_SELECTOR = "0x8da5cb5b" as const;
const SDK_SERVICE = "genlayer-cli";
const SDK_ACCOUNT = "account:firewall-only";
const MAX_ESTIMATED_EVM_FEE_WEI = 1_000_000_000_000_000n;
// The hosted Studionet `gen_call` quota observed during V3 qualification is
// 500 requests/hour. Keep all calls to the shared RPC below that ceiling.
const STUDIONET_RPC_MIN_INTERVAL_MS = 8_000;

const chain = studionet as unknown as Exclude<NonNullable<Parameters<typeof createClient>[0]>["chain"], undefined>;
const requireCli = createRequire("C:/Users/DELL/AppData/Roaming/npm/node_modules/genlayer/dist/index.js");
const keytar = requireCli("keytar") as { getPassword(service: string, account: string): Promise<string | null> };
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const stable = (value: unknown): string => {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const jsonSafe = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
};

function installStudionetRpcRateLimit(): void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(RPC)) return originalFetch(input, init);
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolveQueue) => { release = resolveQueue; });
    await previous;
    try {
      const waitMs = Math.max(0, nextRequestAt - Date.now());
      if (waitMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
      nextRequestAt = Date.now() + STUDIONET_RPC_MIN_INTERVAL_MS;
      return await originalFetch(input, init);
    } finally {
      release();
    }
  };
}

type Step = {
  key: string;
  method: string;
  argumentsSha256: string;
  args?: unknown;
  senderNonce: string;
  estimatedGas?: string;
  estimatedEvmFeeWei?: string;
  evmSubmissionHash?: Hex;
  genlayerTransactionId?: Hex;
  status: string;
  submittedAt?: string;
  lastPollAt?: string;
  lastPollError?: string;
  actualEvmFeeWei?: string;
  evmHashRelationship?: string;
  genBalanceBeforeWei?: string;
  genBalanceAfterWei?: string;
  observedGenBalanceDeltaWei?: string;
  feeAccounting?: Record<string, unknown> | null;
  outerEvmReceipt?: Record<string, unknown>;
  consensus?: Record<string, unknown>;
  canonicalReadback?: Record<string, unknown>;
  reconciledAsNonCommittingContractError?: boolean;
  reconciledPriorStatus?: string;
};
type Journal = {
  schema: "FIREWALL_STUDIONET_PROSPECTIVE_V3_QUALIFICATION_V1";
  network: typeof NETWORK;
  chainId: number;
  rpcUrl: string;
  sdkVersion: "1.1.8";
  signer: string;
  initialBalanceWei: string;
  sourceSha256: string;
  schemaSha256: string;
  contractAddress: string | null;
  status: string;
  preflight: Record<string, unknown>;
  mandateId?: string;
  proposalExternalId?: string;
  intentId?: Hex;
  intentArgs?: unknown[];
  adjudicationId?: string;
  permitId?: string;
  safeAddress: string;
  guardAddress: string;
  safeNonceBeforeInstallation?: string;
  intendedExecutionNonce?: string;
  steps: Step[];
  updatedAt: string;
  finalCanonicalReadback?: Record<string, unknown>;
};

function save(journal: Journal): void {
  journal.updatedAt = now();
  mkdirSync(dirname(JOURNAL_PATH), { recursive: true });
  const temporary = `${JOURNAL_PATH}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(jsonSafe(journal), null, 2)}\n`, "utf8");
  renameSync(temporary, JOURNAL_PATH);
}
function load(): Journal | null {
  try {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as Journal;
    if (journal.schema !== "FIREWALL_STUDIONET_PROSPECTIVE_V3_QUALIFICATION_V1" || journal.network !== NETWORK || journal.chainId !== CHAIN_ID || journal.rpcUrl !== RPC || journal.signer.toLowerCase() !== SIGNER_ADDRESS.toLowerCase()) throw new Error("V3_JOURNAL_NETWORK_OR_SIGNER_MISMATCH");
    if (journal.sourceSha256 !== SOURCE_SHA256) throw new Error("V3_JOURNAL_SOURCE_HASH_MISMATCH");
    return journal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function acquireRunLock(): void {
  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  const payload = JSON.stringify({ pid: process.pid, startedAt: now(), journal: JOURNAL_PATH });
  try {
    const descriptor = openSync(LOCK_PATH, "wx");
    writeFileSync(descriptor, `${payload}\n`, "utf8");
    closeSync(descriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let prior: { pid?: number } = {};
    try { prior = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as { pid?: number }; } catch { /* leave malformed lock for manual reconciliation */ }
    if (!Number.isInteger(prior.pid) || Number(prior.pid) <= 0) throw new Error("V3_RUNNER_LOCK_UNREADABLE_RECONCILE_BEFORE_RETRY");
    try {
      process.kill(Number(prior.pid), 0);
      throw new Error("V3_RUNNER_ALREADY_ACTIVE_REFUSE_PARALLEL_WRITES");
    } catch (probeError) {
      if (probeError instanceof Error && probeError.message === "V3_RUNNER_ALREADY_ACTIVE_REFUSE_PARALLEL_WRITES") throw probeError;
      if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw new Error("V3_RUNNER_LOCK_OWNER_STATE_UNCERTAIN_REFUSE_WRITES");
      rmSync(LOCK_PATH);
      const descriptor = openSync(LOCK_PATH, "wx");
      writeFileSync(descriptor, `${payload}\n`, "utf8");
      closeSync(descriptor);
    }
  }
  const release = () => {
    try {
      const current = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as { pid?: number };
      if (current.pid === process.pid) rmSync(LOCK_PATH);
    } catch { /* retain unreadable lock for safe manual reconciliation */ }
  };
  process.on("exit", release);
  process.once("SIGINT", () => { release(); process.exit(130); });
  process.once("SIGTERM", () => { release(); process.exit(143); });
}
function stepFor(journal: Journal, key: string): Step | undefined {
  const matches = journal.steps.filter((item) => item.key === key);
  if (matches.length > 1) throw new Error(`V3_DUPLICATE_STEP:${key}`);
  return matches[0];
}

function numericConsensusResult(transaction: GenLayerTransaction): string | null {
  const raw = transaction as unknown as Record<string, unknown>;
  const value = transaction.resultName ?? raw.result_name ?? raw.result;
  if (typeof value === "string") return value;
  const map: Record<string, string> = { "0": "IDLE", "1": "AGREE", "2": "DISAGREE", "3": "TIMEOUT", "4": "DETERMINISTIC_VIOLATION", "5": "NO_MAJORITY", "6": "MAJORITY_AGREE", "7": "MAJORITY_DISAGREE" };
  return map[String(value)] ?? null;
}
function transactionSummary(transaction: GenLayerTransaction): Record<string, unknown> {
  const raw = transaction as unknown as Record<string, unknown>;
  const consensus = raw.consensus_data && typeof raw.consensus_data === "object" ? raw.consensus_data as Record<string, unknown> : {};
  const validators = Array.isArray(consensus.validators) ? consensus.validators as Record<string, unknown>[] : [];
  const votes = consensus.votes && typeof consensus.votes === "object" ? consensus.votes as Record<string, unknown> : {};
  const leaders = Array.isArray(consensus.leader_receipt) ? consensus.leader_receipt as Record<string, unknown>[] : [];
  return {
    status: transaction.statusName ?? null,
    consensus: numericConsensusResult(transaction),
    resultCode: raw.result ?? null,
    execution: transaction.txExecutionResultName ?? null,
    voteCount: Object.keys(votes).length,
    agreeVotes: Object.values(votes).filter((vote) => vote === "agree").length,
    validatorRecords: validators.map((validator) => ({ vote: validator.vote ?? null, execution: validator.execution_result ?? null })),
    leaderReceipts: leaders.map((receipt) => {
      const result = receipt.result && typeof receipt.result === "object" ? receipt.result as Record<string, unknown> : {};
      return { mode: receipt.mode ?? null, execution: receipt.execution_result ?? null, resultStatus: result.status ?? (typeof receipt.result === "string" ? receipt.result : null) };
    }),
  };
}
function leaderReturned(transaction: GenLayerTransaction): boolean {
  const raw = transaction as unknown as Record<string, unknown>;
  const consensus = raw.consensus_data && typeof raw.consensus_data === "object" ? raw.consensus_data as Record<string, unknown> : {};
  const leaders = Array.isArray(consensus.leader_receipt) ? consensus.leader_receipt as Record<string, unknown>[] : [];
  return leaders.some((receipt) => {
    if (receipt.mode !== "leader" || receipt.execution_result !== "SUCCESS") return false;
    const result = receipt.result && typeof receipt.result === "object" ? receipt.result as Record<string, unknown> : {};
    return result.status === "return" || receipt.result === "return";
  });
}
async function createClients() {
  const key = await keytar.getPassword(SDK_SERVICE, SDK_ACCOUNT);
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("STUDIONET_SIGNER_NOT_UNLOCKED_IN_WINDOWS_CREDENTIAL_STORE");
  const account = privateKeyToAccount(key as Hex);
  key.replace(/./g, "\0");
  if (account.address.toLowerCase() !== SIGNER_ADDRESS.toLowerCase()) throw new Error("STUDIONET_SIGNER_IDENTITY_MISMATCH");
  const client = createClient({ chain, endpoint: RPC, account: account as never });
  return { account, client };
}

async function schemaParity(client: ReturnType<typeof createClient>, source: string, expectedSource: string) {
  const schema = await client.getContractSchemaForCode(source);
  const artifact = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as unknown;
  if (stable(schema) !== stable(artifact)) throw new Error("V3_LOCAL_SCHEMA_ARTIFACT_PARITY_FAILED");
  const methods = Object.keys(schema.methods).sort();
  const expectedMethods = ["adjudicate_prospective_intent", "authenticate_prospective_intent", "commit_prospective_intent", "create_mandate", "freeze_mandate", "get_adjudications", "get_intents", "get_mandates", "get_permit_status", "get_permits", "get_schema", "issue_prospective_permit"].sort();
  if (JSON.stringify(methods) !== JSON.stringify(expectedMethods) || schema.ctor.params.length !== 0) throw new Error("V3_LOCAL_SCHEMA_INTERFACE_MISMATCH");
  const schemaSha256 = sha256(stable(schema));
  if (expectedSource !== SOURCE_SHA256) throw new Error("V3_SOURCE_HASH_PIN_MISMATCH");
  return { schema, schemaSha256, methodNames: methods };
}

async function canonicalReader(address: string) {
  return createProspectiveReader({ contractAddress: address as `0x${string}`, chainId: CHAIN_ID, rpcUrl: RPC, expectedSourceSha256: SOURCE_SHA256 }).read();
}

async function readDeployedContract(client: ReturnType<typeof createClient>, address: string, schema: Awaited<ReturnType<typeof schemaParity>>["schema"]) {
  const code = await client.getContractCode(address as `0x${string}`);
  const sourceHash = sha256(new TextEncoder().encode(code));
  if (sourceHash !== SOURCE_SHA256) throw new Error("V3_DEPLOYED_SOURCE_HASH_MISMATCH");
  const actualSchema = await client.getContractSchema(address as `0x${string}`);
  if (stable(actualSchema) !== stable(schema)) throw new Error("V3_DEPLOYED_ABI_SCHEMA_MISMATCH");
  const declared = await client.readContract({ address: address as `0x${string}`, functionName: "get_schema", args: [] });
  if (declared !== "FIREWALL_PROSPECTIVE_INTENT_V3") throw new Error("V3_DEPLOYED_CONTRACT_SCHEMA_LABEL_MISMATCH");
  return { sourceSha256: sourceHash, schemaSha256: sha256(stable(actualSchema)), methodNames: Object.keys(actualSchema.methods).sort(), contractAddress: address };
}

async function preflight(client: ReturnType<typeof createClient>, accountAddress: string, source: string, schemaInfo: Awaited<ReturnType<typeof schemaParity>>) {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID || client.chain.id !== CHAIN_ID || RPC !== "https://studio.genlayer.com/api") throw new Error("STUDIONET_CHAIN_OR_RPC_MISMATCH");
  const consensus = client.chain.consensusMainContract;
  const add = consensus?.abi?.find((item) => item.type === "function" && item.name === "addTransaction");
  const feeManager = (client.chain as unknown as { feeManagerContract?: { address?: string } | null }).feeManagerContract;
  if (!consensus?.address || consensus.address.toLowerCase() !== CONSENSUS || !add || add.stateMutability !== "nonpayable" || add.inputs.length !== 5) throw new Error("STUDIONET_STABLE_CONSENSUS_INTERFACE_MISMATCH");
  if (feeManager?.address) throw new Error("STUDIONET_FEE_MANAGER_POLICY_CHANGED_REVIEW_REQUIRED");
  const [latestNonce, pendingNonce, balance, gasPrice] = await Promise.all([
    client.getTransactionCount({ address: accountAddress as `0x${string}`, blockTag: "latest" }),
    client.getTransactionCount({ address: accountAddress as `0x${string}`, blockTag: "pending" }),
    client.getBalance({ address: accountAddress as `0x${string}` }),
    client.request({ method: "eth_gasPrice" }) as Promise<Hex>,
  ]);
  if (BigInt(latestNonce) !== BigInt(pendingNonce)) throw new Error("STUDIONET_SIGNER_HAS_PENDING_TRANSACTION_RECONCILE_FIRST");
  if (balance <= 0n) throw new Error("STUDIONET_SIGNER_HAS_NO_GEN_BALANCE");
  const constructor = abi.calldata.encode(abi.calldata.makeCalldataObject(undefined, [], undefined));
  const inner = abi.transactions.serialize([source, constructor, false]);
  const deployArgs = [accountAddress, zeroAddress, client.chain.defaultNumberOfInitialValidators, client.chain.defaultConsensusMaxRotations, inner];
  const deployData = encodeFunctionData({ abi: consensus.abi, functionName: "addTransaction", args: deployArgs as never });
  const estimatedGas = await client.estimateTransactionGas({ from: accountAddress as `0x${string}`, to: consensus.address, data: deployData, value: 0n });
  if (estimatedGas <= 0n) throw new Error("STUDIONET_SDK_DEPLOYMENT_GAS_ESTIMATE_INVALID");
  const estimatedEvmFeeWei = estimatedGas * BigInt(gasPrice);
  if (estimatedEvmFeeWei > MAX_ESTIMATED_EVM_FEE_WEI) throw new Error("STUDIONET_ESTIMATED_EVM_FEE_CAP_EXCEEDED");
  const v2Code = await client.getContractCode(V2_ADDRESS as `0x${string}`);
  if (sha256(new TextEncoder().encode(v2Code)) !== V2_SOURCE_SHA256) throw new Error("HISTORICAL_V2_SOURCE_PARITY_FAILED");
  const knownStableTx = await client.getTransaction({ hash: "0x2581e9381dbe3f51d618086549349c0c8508d3ab651e436c73b8666688ffaede" });
  const knownStableReceipt = await client.request({ method: "eth_getTransactionReceipt", params: ["0x2581e9381dbe3f51d618086549349c0c8508d3ab651e436c73b8666688ffaede"] } as never) as Record<string, unknown>;
  if (knownStableTx.statusName !== "FINALIZED" || numericConsensusResult(knownStableTx) !== "MAJORITY_AGREE" || !leaderReturned(knownStableTx) || knownStableReceipt.status !== "0x1" || knownStableReceipt.effectiveGasPrice !== "0x0") throw new Error("PREVIOUS_STABLE_SDK_STUDIONET_WRITE_NOT_RECONCILED");
  const history = await client.request({ method: "sim_getTransactionsForAddress", params: [accountAddress] } as never) as unknown;
  if (!Array.isArray(history)) throw new Error("STUDIONET_SIGNER_TRANSACTION_HISTORY_UNAVAILABLE");
  const historySummary = history.map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { hash: item.hash ?? item.tx_id ?? item.txId ?? null, from: item.from ?? item.from_address ?? item.sender ?? null, to: item.to ?? item.to_address ?? item.recipient ?? null, nonce: item.nonce ?? null };
  });
  return {
    sdkVersion: "genlayer-js@1.1.8", chainId, rpcUrl: RPC, signer: accountAddress, consensus: consensus.address,
    consensusMethod: { name: add.name, stateMutability: add.stateMutability, inputs: add.inputs.map((input) => input.type) },
    feeManagerAddress: feeManager?.address ?? null, protocolFeeEstimate: "not exposed by this stable Studionet chain configuration; native SDK deployContract/writeContract are used without RC fee arguments",
    gasPriceWei: BigInt(gasPrice).toString(), latestNonce: BigInt(latestNonce).toString(), pendingNonce: BigInt(pendingNonce).toString(),
    balanceWei: balance.toString(), estimatedDeployGas: estimatedGas.toString(), estimatedEvmFeeWei: estimatedEvmFeeWei.toString(),
    sourceSha256: SOURCE_SHA256, schemaSha256: schemaInfo.schemaSha256, methods: schemaInfo.methodNames,
    priorStableSdkTransaction: { txId: "0x2581e9381dbe3f51d618086549349c0c8508d3ab651e436c73b8666688ffaede", status: knownStableTx.statusName, consensus: numericConsensusResult(knownStableTx), executionReturned: leaderReturned(knownStableTx), outerReceiptStatus: knownStableReceipt.status, gasUsed: knownStableReceipt.gasUsed, effectiveGasPrice: knownStableReceipt.effectiveGasPrice, deployedRecipient: knownStableTx.recipient },
    signerHistory: historySummary,
    maxEstimatedEvmFeeWei: MAX_ESTIMATED_EVM_FEE_WEI.toString(), protocolFeeAccounting: "Record live GEN balance deltas and transaction fee fields after each finality; no unsupported fee quote is invented.",
  };
}

async function resumePreflight(client: ReturnType<typeof createClient>, accountAddress: string) {
  const [chainId, latestNonce, pendingNonce, balance, gasPrice] = await Promise.all([
    client.getChainId(),
    client.getTransactionCount({ address: accountAddress as `0x${string}`, blockTag: "latest" }),
    client.getTransactionCount({ address: accountAddress as `0x${string}`, blockTag: "pending" }),
    client.getBalance({ address: accountAddress as `0x${string}` }),
    client.request({ method: "eth_gasPrice" }) as Promise<Hex>,
  ]);
  if (chainId !== CHAIN_ID || client.chain.id !== CHAIN_ID || RPC !== "https://studio.genlayer.com/api") throw new Error("STUDIONET_CHAIN_OR_RPC_MISMATCH");
  if (BigInt(latestNonce) !== BigInt(pendingNonce)) throw new Error("STUDIONET_SIGNER_HAS_PENDING_TRANSACTION_RECONCILE_FIRST");
  if (balance <= 0n) throw new Error("STUDIONET_SIGNER_HAS_NO_GEN_BALANCE");
  const consensus = client.chain.consensusMainContract;
  if (!consensus?.address || consensus.address.toLowerCase() !== CONSENSUS) throw new Error("STUDIONET_STABLE_CONSENSUS_INTERFACE_MISMATCH");
  return { checkedAt: now(), chainId, rpcUrl: RPC, signer: accountAddress, latestNonce: latestNonce.toString(), pendingNonce: pendingNonce.toString(), balanceWei: balance.toString(), gasPriceWei: BigInt(gasPrice).toString(), consensus: consensus.address, protocolFeeEstimate: "not exposed by stable Studionet RPC; native SDK path retained" };
}

async function createEvidenceBlock() {
  const chainId = EVM_CHAIN_ID;
  const safeAbi = [
    { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
    { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    { type: "function", name: "masterCopy", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    { type: "function", name: "getModulesPaginated", stateMutability: "view", inputs: [{ name: "start", type: "address" }, { name: "pageSize", type: "uint256" }], outputs: [{ name: "array", type: "address[]" }, { name: "next", type: "address" }] },
  ] as const;
  const evmChain = {
    id: chainId, name: "Ethereum Sepolia", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://sepolia.drpc.org", "https://ethereum-sepolia-rpc.publicnode.com"] } },
  } as const;
  const { createPublicClient, defineChain, http } = await import("viem");
  const defined = defineChain(evmChain);
  const clients = [
    createPublicClient({ chain: defined, transport: http("https://sepolia.drpc.org", { timeout: 15_000 }) }),
    createPublicClient({ chain: defined, transport: http("https://ethereum-sepolia-rpc.publicnode.com", { timeout: 15_000 }) }),
  ] as const;
  const ids = await Promise.all(clients.map((client) => client.getChainId()));
  if (ids.some((id) => id !== chainId)) throw new Error("SEPOLIA_PROVIDER_CHAIN_ID_MISMATCH");
  const heads = await Promise.all(clients.map((client) => client.getBlock({ blockTag: "latest" })));
  const headNumbers = heads.map((block) => block.number);
  if (headNumbers.some((number) => number === null)) throw new Error("SEPOLIA_PROVIDER_HEAD_UNAVAILABLE");
  const commonNumber = headNumbers.reduce((minimum, number) => number! < minimum ? number! : minimum, headNumbers[0]!);
  const snapshotBlockNumber = commonNumber > 2n ? commonNumber - 2n : commonNumber;
  const [blocks, state] = await Promise.all([
    Promise.all(clients.map((client) => client.getBlock({ blockNumber: snapshotBlockNumber }))),
    Promise.all(clients.map(async (client, providerIndex) => {
      const blockNumber = snapshotBlockNumber;
      const [safeCode, guardCode, safeNonce, owners, threshold, implementation, modules, guardSlot, targetCode, deployment] = await Promise.all([
        client.getCode({ address: SAFE, blockNumber }), client.getCode({ address: GUARD, blockNumber }),
        client.readContract({ address: SAFE, abi: safeAbi, functionName: "nonce", blockNumber }),
        client.readContract({ address: SAFE, abi: safeAbi, functionName: "getOwners", blockNumber }),
        client.readContract({ address: SAFE, abi: safeAbi, functionName: "getThreshold", blockNumber }),
        client.readContract({ address: SAFE, abi: safeAbi, functionName: "masterCopy", blockNumber }),
        client.readContract({ address: SAFE, abi: safeAbi, functionName: "getModulesPaginated", args: [SAFE_MODULE_SENTINEL, 10n], blockNumber }),
        client.getStorageAt({ address: SAFE, slot: SAFE_GUARD_SLOT, blockNumber }),
        client.getCode({ address: GUARD, blockNumber }),
        client.getTransaction({ hash: SAFE_DEPLOYMENT_TX }),
      ]);
      const deploymentReceipt = providerIndex === 0
        ? await client.getTransactionReceipt({ hash: SAFE_DEPLOYMENT_TX })
        : await fetchBlockscoutSafeDeploymentReceipt(deployment);
      return { safeCode, guardCode, safeNonce: String(safeNonce), owners: [...owners].map((value) => value.toLowerCase()).sort(), threshold: String(threshold), implementation: implementation.toLowerCase(), modules: { addresses: [...modules[0]].map((value) => value.toLowerCase()), next: modules[1].toLowerCase() }, guardSlot: guardSlot?.toLowerCase() ?? null, targetCode, deployment, deploymentReceipt: { status: deploymentReceipt.status, transactionHash: deploymentReceipt.transactionHash, blockNumber: deploymentReceipt.blockNumber, blockHash: deploymentReceipt.blockHash, to: deploymentReceipt.to, logs: deploymentReceipt.logs.map((log) => ({ address: log.address, topics: [...log.topics], data: log.data })) } };
    })),
  ]);
  if (!blocks[0]?.hash || blocks[0].hash !== blocks[1]?.hash || blocks[0].timestamp !== blocks[1].timestamp) throw new Error("SEPOLIA_PROVIDER_COMMON_BLOCK_DISAGREEMENT");
  const [left, right] = state;
  const normalizedState = (value: (typeof state)[number]) => ({
    safeCode: value.safeCode, guardCode: value.guardCode, safeNonce: value.safeNonce, owners: value.owners,
    threshold: value.threshold, implementation: value.implementation, modules: value.modules, guardSlot: value.guardSlot,
    targetCode: value.targetCode,
    deployment: { hash: value.deployment.hash?.toLowerCase(), to: value.deployment.to?.toLowerCase(), blockNumber: String(value.deployment.blockNumber), blockHash: value.deployment.blockHash?.toLowerCase() },
    deploymentReceipt: {
      status: String(value.deploymentReceipt.status).toLowerCase(),
      transactionHash: String(value.deploymentReceipt.transactionHash).toLowerCase(),
      blockNumber: String(value.deploymentReceipt.blockNumber), blockHash: String(value.deploymentReceipt.blockHash).toLowerCase(),
      to: String(value.deploymentReceipt.to).toLowerCase(),
      logs: value.deploymentReceipt.logs.map((log) => ({ address: log.address.toLowerCase(), topics: log.topics.map((topic) => topic.toLowerCase()), data: log.data.toLowerCase() })).sort((a, b) => stable(a).localeCompare(stable(b))),
    },
  });
  if (stable(normalizedState(left)) !== stable(normalizedState(right))) {
    const a = normalizedState(left);
    const b = normalizedState(right);
    const mismatched = Object.keys(a).filter((key) => stable(a[key as keyof typeof a]) !== stable(b[key as keyof typeof b]));
    throw new Error(`SEPOLIA_PROVIDER_SAFE_STATE_DISAGREEMENT:${mismatched.join(",")}`);
  }
  const account = SIGNER_ADDRESS.toLowerCase();
  if (!left.safeCode || left.safeCode === "0x" || !left.guardCode || left.guardCode === "0x" || !left.targetCode || left.targetCode === "0x") throw new Error("SEPOLIA_SAFE_GUARD_OR_TARGET_CODE_MISSING");
  if (keccak256(left.guardCode as Hex).toLowerCase() !== GUARD_RUNTIME_CODE_HASH.toLowerCase()) throw new Error("SEPOLIA_GUARD_RUNTIME_CODE_HASH_MISMATCH");
  if (left.owners.length !== 1 || left.owners[0] !== account || left.threshold !== "1" || left.implementation !== SAFE_SINGLETON || left.modules.addresses.length !== 0 || left.modules.next !== SAFE_MODULE_SENTINEL) throw new Error("SEPOLIA_SAFE_OWNER_IMPLEMENTATION_OR_MODULE_STATE_MISMATCH");
  const currentGuard = left.guardSlot ? `0x${left.guardSlot.slice(-40)}`.toLowerCase() : "";
  if (currentGuard !== `0x${"00".repeat(20)}` && currentGuard !== GUARD.toLowerCase()) throw new Error("SEPOLIA_SAFE_HAS_UNEXPECTED_GUARD");
  const safeNonce = BigInt(left.safeNonce);
  const intendedNonce = currentGuard === GUARD.toLowerCase() ? safeNonce : safeNonce + 1n;
  if (left.deployment.hash?.toLowerCase() !== SAFE_DEPLOYMENT_TX.toLowerCase() || left.deployment.to?.toLowerCase() !== SAFE_FACTORY || left.deploymentReceipt.status !== "success" || left.deploymentReceipt.transactionHash?.toLowerCase() !== SAFE_DEPLOYMENT_TX.toLowerCase()) throw new Error("SEPOLIA_SAFE_DEPLOYMENT_PROVENANCE_INVALID");
  const guardCodeHash = keccak256(left.guardCode as Hex);
  return {
    blockNumber: snapshotBlockNumber.toString(), blockHash: blocks[0].hash, blockTimestamp: blocks[0].timestamp.toString(),
    safe: SAFE, guard: GUARD, safeNonceBeforeInstallation: safeNonce.toString(), intendedExecutionNonce: intendedNonce.toString(),
    guardInstalledAtSnapshot: currentGuard === GUARD.toLowerCase(), owners: left.owners, threshold: left.threshold,
    implementation: left.implementation, enabledModules: left.modules.addresses, guardCodeHash, targetCodeHash: keccak256(left.targetCode as Hex),
    safeDeploymentTx: SAFE_DEPLOYMENT_TX, deploymentBlockNumber: left.deploymentReceipt.blockNumber?.toString(), deploymentBlockHash: left.deploymentReceipt.blockHash,
    providerAgreement: true, providers: ["DRPC_SEPOLIA", "PUBLICNODE_SEPOLIA+BLOCKSCOUT_SEPOLIA"],
  };
}

async function fetchBlockscoutSafeDeploymentReceipt(deployment: { hash: Hex; to: Hex; blockNumber: bigint; blockHash: Hex }) {
  const base = "https://eth-sepolia.blockscout.com/api/v2";
  const getJson = async (path: string) => {
    const response = await fetch(`${base}${path}`, { headers: { Accept: "application/json", "Accept-Encoding": "identity" } });
    if (!response.ok) throw new Error(`BLOCKSCOUT_SEPOLIA_HTTP_${response.status}`);
    return await response.json() as Record<string, unknown>;
  };
  const [transaction, logsPage, block] = await Promise.all([
    getJson(`/transactions/${SAFE_DEPLOYMENT_TX}`),
    getJson(`/transactions/${SAFE_DEPLOYMENT_TX}/logs`),
    getJson(`/blocks/${deployment.blockNumber.toString()}`),
  ]);
  const to = transaction.to as Record<string, unknown> | null;
  const logs = logsPage.items;
  if (
    String(transaction.hash).toLowerCase() !== SAFE_DEPLOYMENT_TX.toLowerCase() || transaction.status !== "ok" || transaction.result !== "success" ||
    Number(transaction.block_number) !== Number(deployment.blockNumber) || String(to?.hash).toLowerCase() !== SAFE_FACTORY ||
    String(block.hash).toLowerCase() !== deployment.blockHash.toLowerCase() || Number(block.height) !== Number(deployment.blockNumber) ||
    !Array.isArray(logs)
  ) throw new Error("BLOCKSCOUT_SEPOLIA_SAFE_DEPLOYMENT_PROVENANCE_MISMATCH");
  const factoryLog = logs.find((entry) => {
    const log = entry as Record<string, unknown>;
    const address = log.address as Record<string, unknown> | undefined;
    const topics = Array.isArray(log.topics) ? log.topics.filter((topic): topic is string => typeof topic === "string") : [];
    return String(address?.hash).toLowerCase() === SAFE_FACTORY && topics[0]?.toLowerCase() === "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235" &&
      topics[1]?.toLowerCase() === `0x${SAFE.slice(2).toLowerCase().padStart(64, "0")}` && String(log.data).toLowerCase() === `0x${SAFE_SINGLETON.slice(2).toLowerCase().padStart(64, "0")}` &&
      String(log.block_hash).toLowerCase() === deployment.blockHash.toLowerCase() && String(log.transaction_hash).toLowerCase() === SAFE_DEPLOYMENT_TX.toLowerCase();
  });
  if (!factoryLog) throw new Error("BLOCKSCOUT_SEPOLIA_SAFE_FACTORY_EVENT_MISSING");
  const receiptLogs = logs.map((entry) => {
    const log = entry as Record<string, unknown>;
    const address = log.address as Record<string, unknown> | undefined;
    const topics = Array.isArray(log.topics) ? log.topics.filter((topic): topic is string => typeof topic === "string") : [];
    return { address: String(address?.hash), topics, data: String(log.data) };
  });
  return { status: "success" as const, transactionHash: SAFE_DEPLOYMENT_TX, blockNumber: deployment.blockNumber, blockHash: deployment.blockHash, to: SAFE_FACTORY, logs: receiptLogs };
}

function numericFeeAccounting(transaction: GenLayerTransaction): Record<string, unknown> | null {
  const raw = transaction as unknown as Record<string, unknown>;
  const source = raw.fees && typeof raw.fees === "object" ? raw.fees as Record<string, unknown> : raw.feeAccounting && typeof raw.feeAccounting === "object" ? raw.feeAccounting as Record<string, unknown> : null;
  if (!source) return null;
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => /fee|gas|price|amount|refund|charged|used/i.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")));
}

async function trackStep(journal: Journal, client: ReturnType<typeof createClient>, key: string): Promise<Step> {
  const step = stepFor(journal, key);
  if (!step) throw new Error(`V3_TRACK_STEP_MISSING:${key}`);
  const txHash = step.genlayerTransactionId ?? step.evmSubmissionHash;
  if (!txHash) throw new Error(`V3_TRACK_HASH_MISSING_NO_REBROADCAST:${key}`);
  let delay = 5_000;
  for (;;) {
    const current = stepFor(journal, key)!;
    try {
      let receipt: Record<string, unknown> | null = null;
      const receiptLookupHash = current.evmSubmissionHash ?? current.genlayerTransactionId;
      if (receiptLookupHash) {
        const result = await client.request({ method: "eth_getTransactionReceipt", params: [receiptLookupHash] } as never) as unknown;
        if (result && typeof result === "object") receipt = result as Record<string, unknown>;
      }
      if (receipt) {
        if (typeof receipt.transactionHash !== "string" || receipt.transactionHash.toLowerCase() !== receiptLookupHash?.toLowerCase()) throw new Error("V3_OUTER_RECEIPT_HASH_IDENTITY_MISMATCH");
        if (!current.evmSubmissionHash && current.genlayerTransactionId) {
          current.evmSubmissionHash = current.genlayerTransactionId;
          current.evmHashRelationship = "GENLAYER_TX_ID_EQUALS_EVM_RECEIPT_HASH_VERIFIED";
        }
        current.outerEvmReceipt = jsonSafe(receipt) as Record<string, unknown>;
        if (receipt.status === "0x0") {
          current.status = "OUTER_EVM_REVERTED_STOP";
          save(journal);
          throw new Error(`V3_OUTER_EVM_TRANSACTION_REVERTED:${key}`);
        }
        if (typeof receipt.gasUsed === "string" && typeof receipt.effectiveGasPrice === "string") current.actualEvmFeeWei = (BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)).toString();
      }
      const transaction = await client.getTransaction({ hash: txHash as `0x${string}` });
      const summary = transactionSummary(transaction);
      current.consensus = summary;
      current.feeAccounting = numericFeeAccounting(transaction);
      current.lastPollAt = now();
      current.lastPollError = undefined;
      current.status = `TRACKING_${String(summary.status ?? "UNKNOWN")}`;
      save(journal);
      const status = String(summary.status ?? "").toUpperCase();
      if (status === "FINALIZED") {
        const validatorState = verifyFinalizedConsensus(transaction);
        const success = summary.consensus === "MAJORITY_AGREE" && leaderReturned(transaction) && validatorState.valid;
        current.status = success ? "GENLAYER_FINALIZED_SUCCESS" : "GENLAYER_FINALIZED_CONSENSUS_OR_EXECUTION_FAILED_STOP";
        current.consensus = { ...summary, validatorState };
        const balanceAfter = await client.getBalance({ address: SIGNER_ADDRESS as `0x${string}` });
        current.genBalanceAfterWei = balanceAfter.toString();
        if (current.genBalanceBeforeWei) current.observedGenBalanceDeltaWei = (BigInt(current.genBalanceBeforeWei) - balanceAfter).toString();
        save(journal);
        if (!success) throw new Error(`V3_FINALIZED_CONSENSUS_OR_EXECUTION_FAILED:${key}`);
        return current;
      }
      if (status === "CANCELED" || status === "VALIDATORS_TIMEOUT" || status === "LEADER_TIMEOUT") {
        current.status = `GENLAYER_TERMINAL_${status}_STOP`;
        save(journal);
        throw new Error(`V3_GENLAYER_TERMINAL_${status}:${key}`);
      }
      delay = status === "ACCEPTED" || status.includes("APPEAL") ? 15_000 : 5_000;
    } catch (error) {
      if (error instanceof Error && /^(?:V3_OUTER_EVM_TRANSACTION_REVERTED|V3_FINALIZED_CONSENSUS_OR_EXECUTION_FAILED|V3_GENLAYER_TERMINAL_)/.test(error.message)) throw error;
      current.lastPollAt = now();
      current.lastPollError = "RPC_STATUS_UNAVAILABLE_TRACK_SAME_HASH";
      save(journal);
      delay = Math.min(30_000, Math.floor(delay * 1.5));
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  }
}

async function runWrite(input: {
  journal: Journal;
  client: ReturnType<typeof createClient>;
  account: ReturnType<typeof privateKeyToAccount>;
  key: string;
  method: string;
  args: unknown[];
  address: string;
  postcondition: (model: ProspectiveCanonicalModel) => Record<string, unknown> | null;
  readModel: () => Promise<ProspectiveCanonicalModel>;
  source?: string;
}) {
  const isDeployment = input.key === "deployment";
  const model = isDeployment ? null : await input.readModel();
  const already = isDeployment ? null : input.postcondition(model!);
  if (already) {
    const existing = stepFor(input.journal, input.key);
    if (existing?.evmSubmissionHash || existing?.genlayerTransactionId) {
      const resumed = await trackStep(input.journal, input.client, input.key);
      resumed.canonicalReadback = already;
      resumed.status = "CANONICAL_READBACK_CONFIRMED";
      save(input.journal);
      return resumed;
    }
    if (existing) {
      existing.status = "CANONICAL_STATE_EXISTS_HASH_RECOVERY_REQUIRED_NO_WRITE";
      existing.canonicalReadback = already;
      save(input.journal);
      throw new Error(`V3_STATE_ALREADY_EXISTS_WITHOUT_TRANSACTION_HASH:${input.key}`);
    }
    throw new Error(`V3_CANONICAL_STATE_ALREADY_EXISTS_TRANSACTION_RECOVERY_REQUIRED:${input.key}`);
  }
  let step = stepFor(input.journal, input.key);
  if (step?.evmSubmissionHash || step?.genlayerTransactionId) {
    step = await trackStep(input.journal, input.client, input.key);
  } else {
    const [latest, pending, balance, gasPrice] = await Promise.all([
      input.client.getTransactionCount({ address: input.account.address, blockTag: "latest" }),
      input.client.getTransactionCount({ address: input.account.address, blockTag: "pending" }),
      input.client.getBalance({ address: input.account.address }),
      input.client.request({ method: "eth_gasPrice" }) as Promise<Hex>,
    ]);
    if (BigInt(latest) !== BigInt(pending)) throw new Error(`V3_NONCE_UNRESOLVED_STOP:${input.key}`);
    if (step && BigInt(step.senderNonce) !== BigInt(latest)) throw new Error(`V3_PREPARED_OPERATION_NONCE_CHANGED_STOP:${input.key}`);
    if (BigInt(balance) <= 0n) throw new Error(`V3_SIGNER_BALANCE_EMPTY_STOP:${input.key}`);
    const consensus = input.client.chain.consensusMainContract;
    if (!consensus?.address || consensus.address.toLowerCase() !== CONSENSUS) throw new Error("V3_CONSENSUS_NETWORK_CHANGED_STOP");
    let payload: Hex;
    if (input.key === "deployment") {
      const source = input.source;
      if (!source) throw new Error("V3_DEPLOYMENT_SOURCE_MISSING");
      const constructor = abi.calldata.encode(abi.calldata.makeCalldataObject(undefined, [], undefined));
      payload = abi.transactions.serialize([source, constructor, false]);
    } else {
      payload = abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject(input.method, input.args as never[], undefined)), false]);
    }
    const contractTarget = input.key === "deployment" ? zeroAddress : input.address;
    const addArgs = [input.account.address, contractTarget, input.client.chain.defaultNumberOfInitialValidators, input.client.chain.defaultConsensusMaxRotations, payload];
    const encoded = encodeFunctionData({ abi: consensus.abi, functionName: "addTransaction", args: addArgs as never });
    const estimatedGas = await input.client.estimateTransactionGas({ from: input.account.address, to: consensus.address, data: encoded, value: 0n });
    const estimatedEvmFeeWei = estimatedGas * BigInt(gasPrice);
    if (estimatedGas <= 0n || estimatedEvmFeeWei > MAX_ESTIMATED_EVM_FEE_WEI) throw new Error(`V3_FEE_OR_GAS_PREFLIGHT_FAILED:${input.key}`);
    const argsHash = `0x${sha256(stable(input.key === "deployment" ? [SOURCE_SHA256, []] : input.args))}`;
    const prepared = step ?? {
      key: input.key, method: input.method, argumentsSha256: argsHash,
      args: jsonSafe(input.key === "deployment" ? [] : input.args), senderNonce: BigInt(latest).toString(), status: "PREPARED_NO_BROADCAST",
    };
    if (prepared.argumentsSha256 !== argsHash) throw new Error(`V3_JOURNAL_ARGUMENTS_MISMATCH:${input.key}`);
    prepared.senderNonce = BigInt(latest).toString();
    prepared.estimatedGas = estimatedGas.toString();
    prepared.estimatedEvmFeeWei = estimatedEvmFeeWei.toString();
    prepared.genBalanceBeforeWei = balance.toString();
    prepared.status = "PREPARED_STABLE_SDK_NATIVE_SUBMISSION";
    if (!step) input.journal.steps.push(prepared);
    save(input.journal);

    const mutable = input.client as unknown as { sendRawTransaction?: (value: { serializedTransaction: Hex }) => Promise<Hex> };
    if (typeof mutable.sendRawTransaction !== "function") throw new Error("V3_STABLE_SDK_RAW_TRANSACTION_HOOK_UNAVAILABLE");
    const originalSend = mutable.sendRawTransaction.bind(input.client);
    let active = true;
    mutable.sendRawTransaction = async ({ serializedTransaction }) => {
      if (!active) throw new Error("V3_RAW_SEND_OUTSIDE_OPERATION_CONTEXT");
      const outerHash = keccak256(serializedTransaction);
      const current = stepFor(input.journal, input.key)!;
      if (current.evmSubmissionHash && current.evmSubmissionHash.toLowerCase() !== outerHash.toLowerCase()) throw new Error("V3_OUTER_SUBMISSION_HASH_CONFLICT");
      current.evmSubmissionHash = outerHash;
      current.status = "OUTER_EVM_HASH_DURABLY_PERSISTED_BEFORE_SEND";
      save(input.journal);
      return originalSend({ serializedTransaction });
    };
    let transactionId: Hex;
    try {
      const writer = input.client as unknown as {
        deployContract(args: { code: string; args: unknown[]; leaderOnly?: boolean }): Promise<Hex>;
        writeContract(args: { address: `0x${string}`; functionName: string; args: unknown[]; value: bigint }): Promise<Hex>;
      };
      transactionId = input.key === "deployment"
        ? await writer.deployContract({ code: input.source!, args: [], leaderOnly: false })
        : await writer.writeContract({ address: input.address as `0x${string}`, functionName: input.method, args: input.args, value: 0n });
    } catch (error) {
      active = false;
      const current = stepFor(input.journal, input.key)!;
      if (current.evmSubmissionHash) {
        current.status = "SUBMITTED_OUTCOME_UNCERTAIN_RESUME_SAME_HASH";
        save(input.journal);
        step = await trackStep(input.journal, input.client, input.key);
      } else {
        current.status = "NOT_SUBMITTED_BEFORE_SDK_BROADCAST";
        save(input.journal);
        throw error;
      }
      const confirmed = isDeployment ? null : await input.readModel();
      const readback = isDeployment ? { stableSdkDeploymentTransactionTracked: true } : input.postcondition(confirmed!);
      if (!readback) throw new Error(`V3_CANONICAL_POSTCONDITION_NOT_MET:${input.key}`);
      step.canonicalReadback = readback;
      step.status = "CANONICAL_READBACK_CONFIRMED";
      save(input.journal);
      return step;
    } finally {
      active = false;
      mutable.sendRawTransaction = originalSend;
    }
    const current = stepFor(input.journal, input.key)!;
    if (current.genlayerTransactionId && current.genlayerTransactionId.toLowerCase() !== transactionId.toLowerCase()) throw new Error("V3_PROTOCOL_TRANSACTION_ID_CONFLICT");
    current.genlayerTransactionId = transactionId;
    if (current.evmSubmissionHash && current.evmSubmissionHash.toLowerCase() === transactionId.toLowerCase()) current.evmHashRelationship = "GENLAYER_TX_ID_EQUALS_EVM_SIGNED_TRANSACTION_HASH";
    current.submittedAt = now();
    current.status = "GENLAYER_CONSENSUS_PENDING_TRACKING_SAME_HASH";
    save(input.journal);
    step = await trackStep(input.journal, input.client, input.key);
  }
  const finalModel = isDeployment ? null : await input.readModel();
  const readback = isDeployment ? { stableSdkDeploymentTransactionTracked: true } : input.postcondition(finalModel!);
  if (!readback) {
    step.status = "FINALIZED_SUCCESS_CANONICAL_READBACK_MISMATCH_STOP";
    save(input.journal);
    throw new Error(`V3_CANONICAL_POSTCONDITION_FAILED:${input.key}`);
  }
  step.canonicalReadback = readback;
  step.status = "CANONICAL_READBACK_CONFIRMED";
  save(input.journal);
  return step;
}

async function main() {
  const action = process.argv[2] ?? "preflight";
  if (!["preflight", "run", "resume", "status"].includes(action)) throw new Error("USAGE: firewall_studionet_v3_runner.ts <preflight|run|resume|status>");
  const sourceBytes = readFileSync(SOURCE_PATH);
  const source = sourceBytes.toString("utf8");
  const sourceHash = sha256(sourceBytes);
  if (sourceHash !== SOURCE_SHA256) throw new Error("V3_SOURCE_DOES_NOT_MATCH_PINNED_SHA256");
  const existing = load();
  if (action === "status") {
    if (!existing) throw new Error("V3_QUALIFICATION_JOURNAL_NOT_CREATED");
    const live = existing.contractAddress ? await canonicalReader(existing.contractAddress) : null;
    const currentIntent = live && existing.intentId ? live.intents.find((item) => item.intentId.toLowerCase() === existing.intentId!.toLowerCase()) : null;
    console.log(JSON.stringify({ status: existing.status, contractAddress: existing.contractAddress, sourceSha256: existing.sourceSha256, permitId: existing.permitId, finalCanonicalReadback: existing.finalCanonicalReadback, canonicalState: live ? { sourceSha256: live.sourceSha256, intent: currentIntent ? { intentId: currentIntent.intentId, state: currentIntent.state, evidenceHash: currentIntent.evidenceHash, authenticatedEvidenceLength: currentIntent.authenticatedEvidence.length, adjudicationId: currentIntent.adjudicationId } : null, adjudications: live.adjudications.length, permits: live.permits.length } : null, steps: existing.steps.map(({ key, method, status, evmSubmissionHash, genlayerTransactionId, consensus, canonicalReadback }) => ({ key, method, status, evmSubmissionHash, genlayerTransactionId, consensus, canonicalReadback })) }, null, 2));
    return;
  }
  if (action === "run" || action === "resume") acquireRunLock();
  installStudionetRpcRateLimit();
  const { account, client } = await createClients();
  let existingRunReport: Awaited<ReturnType<typeof resumePreflight>> | null = null;
  if (existing && action !== "preflight") {
    if (action === "resume" || action === "run") {
      const pending = existing.steps.find((step) => step.status.includes("PENDING") || step.status.includes("TRACKING") || step.status.includes("UNCERTAIN") || step.status.includes("SUBMITTED"));
      if (pending?.evmSubmissionHash || pending?.genlayerTransactionId) await trackStep(existing, client, pending.key);
      else if (pending) throw new Error(`V3_PREPARED_OPERATION_HAS_NO_HASH_RECONCILE_NONCE:${pending.key}`);
      if (action === "resume") {
        console.log(JSON.stringify({ status: existing.status, contractAddress: existing.contractAddress, steps: existing.steps.map(({ key, status, evmSubmissionHash, genlayerTransactionId }) => ({ key, status, evmSubmissionHash, genlayerTransactionId })) }, null, 2));
        return;
      }
    }
    // Reconcile and finalize the already-submitted transaction before checking
    // latest/pending nonce equality. A submitted transaction is expected to
    // make those nonces differ; refusing first would prevent safe recovery.
    existingRunReport = await resumePreflight(client, account.address);
  } else if (action === "resume") {
    throw new Error("V3_QUALIFICATION_JOURNAL_NOT_CREATED");
  }
  const schemaInfo = await schemaParity(client, source, sourceHash);
  const chainReport = action === "preflight" || !existing
    ? await preflight(client, account.address, source, schemaInfo)
    : existingRunReport!;
  if (action === "preflight") {
    const evmPreflight = await createEvidenceBlock();
    console.log(JSON.stringify({ status: "STUDIONET_STABLE_SDK_V3_PREFLIGHT_READY_NO_WRITE", ...chainReport, sepoliaSafePreflight: evmPreflight, currentV3Journal: existing ? { status: existing.status, contractAddress: existing.contractAddress, steps: existing.steps.map(({ key, method, status, evmSubmissionHash, genlayerTransactionId }) => ({ key, method, status, evmSubmissionHash, genlayerTransactionId })) } : null }, null, 2));
    return;
  }
  let journal = existing;
  if (!journal) {
    journal = {
      schema: "FIREWALL_STUDIONET_PROSPECTIVE_V3_QUALIFICATION_V1", network: NETWORK, chainId: CHAIN_ID, rpcUrl: RPC,
      sdkVersion: "1.1.8", signer: account.address, initialBalanceWei: String(chainReport.balanceWei), sourceSha256: SOURCE_SHA256,
      schemaSha256: schemaInfo.schemaSha256, contractAddress: null, status: "PREFLIGHT_COMPLETE_NO_PUBLIC_WRITE",
      preflight: chainReport, safeAddress: SAFE, guardAddress: GUARD, steps: [], updatedAt: now(),
    };
    save(journal);
  } else {
    journal.preflight = chainReport;
    save(journal);
  }

  journal.status = "V3_PUBLIC_QUALIFICATION_IN_PROGRESS";
  save(journal);

  // Reconcile the prior alternate V2 candidate deployment by hash; it is a
  // different source and is never treated as V3 or reused for prospective permits.
  if (journal.contractAddress) await readDeployedContract(client, journal.contractAddress, schemaInfo.schema);
  if (!journal.contractAddress) {
    const deploy = await runWrite({ journal, client, account, key: "deployment", method: "deployContract", args: [], address: zeroAddress, source, readModel: async () => { throw new Error("V3_DEPLOYMENT_HAS_NO_CONTRACT_MODEL"); }, postcondition: () => null });
    const transactionId = deploy.genlayerTransactionId ?? deploy.evmSubmissionHash;
    if (!transactionId) throw new Error("V3_DEPLOYMENT_TRANSACTION_ID_MISSING");
    const tx = await client.getTransaction({ hash: transactionId });
    const contractAddress = tx.recipient ?? (tx as unknown as Record<string, unknown>).to_address;
    if (typeof contractAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress) || contractAddress.toLowerCase() === zeroAddress.toLowerCase()) throw new Error("V3_DEPLOYMENT_CONTRACT_ADDRESS_MISSING");
    journal.contractAddress = contractAddress;
    save(journal);
    const parity = await readDeployedContract(client, contractAddress, schemaInfo.schema);
    deploy.canonicalReadback = parity;
    deploy.status = "DEPLOYMENT_SOURCE_SCHEMA_AND_ADDRESS_CANONICAL_READBACK_CONFIRMED";
    save(journal);
  }

  const contractAddress = journal.contractAddress;
  if (!contractAddress) throw new Error("V3_DEPLOYMENT_ADDRESS_UNAVAILABLE");
  const reader = () => canonicalReader(contractAddress);
  const proposalExternalId = journal.proposalExternalId ?? `FIREWALL-SEPOLIA-PROSPECTIVE-${new Date().toISOString().slice(0, 10)}-${randomBytes(4).toString("hex")}`;
  const initialModel = await reader();
  if (initialModel.status !== "READY" || initialModel.source !== "LIVE_CANONICAL" || initialModel.config.expectedSourceSha256 !== SOURCE_SHA256) throw new Error("V3_CANONICAL_READER_SOURCE_OR_NETWORK_MISMATCH");

  let mandate = journal.mandateId ? initialModel.mandates.find((item) => item.mandateId === journal.mandateId) : initialModel.mandates.find((item) => item.proposalExternalId === proposalExternalId);
  if (!mandate) {
    const mandateText = `Authorize one exact prospective call only: after the controlled 1-of-1 Ethereum Sepolia Safe installs the already deployed Firewall Guard through its owner-authorized setGuard operation, the Safe may make one zero-value CALL at the resulting exact nonce to ${GUARD}. The calldata is the four-byte owner() selector; it reads the Guard owner and has no asset or configuration effect. Do not authorize any transfer, different target or calldata, delegatecall, owner or threshold change, module activation, Guard removal, replay, or other Safe action. The installation is a separate owner-signed setup step; this mandate covers only the later exact Safe call, which requires a finalized canonical permit and relay attestation.`;
    journal.proposalExternalId = proposalExternalId;
    save(journal);
    const created = await runWrite({ journal, client, account, key: "create_mandate", method: "create_mandate", args: [proposalExternalId, mandateText], address: contractAddress, readModel: reader, postcondition: (model) => {
      const item = model.mandates.find((value) => value.proposalExternalId === proposalExternalId);
      return item ? { mandateId: item.mandateId, state: item.state, proposalHash: item.proposalHash } : null;
    } });
    const canonical = await reader();
    mandate = canonical.mandates.find((item) => item.proposalExternalId === proposalExternalId);
    if (!mandate) throw new Error("V3_MANDATE_READBACK_MISSING");
    journal.mandateId = mandate.mandateId;
    created.canonicalReadback = { mandateId: mandate.mandateId, state: mandate.state, proposalHash: mandate.proposalHash };
    save(journal);
  }
  if (!journal.mandateId) journal.mandateId = mandate.mandateId;
  if (mandate.state === "MANDATE_DRAFT") {
    await runWrite({ journal, client, account, key: "freeze_mandate", method: "freeze_mandate", args: [mandate.mandateId], address: contractAddress, readModel: reader, postcondition: (model) => {
      const item = model.mandates.find((value) => value.mandateId === mandate!.mandateId);
      return item?.state === "MANDATE_FROZEN" ? { mandateId: item.mandateId, state: item.state, frozenAt: item.frozenAt } : null;
    } });
  } else if (mandate.state !== "MANDATE_FROZEN") throw new Error("V3_MANDATE_NOT_FROZEN_OR_DRAFT_STOP");

  let model = await reader();
  let intent = journal.intentId ? model.intents.find((item) => item.intentId === journal!.intentId) : undefined;
  if (!intent && model.intents.some((item) => item.safe.toLowerCase() === SAFE.toLowerCase() && item.safeNonce === Number(journal.intendedExecutionNonce ?? -1))) throw new Error("V3_SAFE_NONCE_ALREADY_COMMITTED_TO_OTHER_INTENT_RECOVER_BEFORE_WRITE");
  if (!intent) {
    let args: unknown[];
    let intentId: Hex;
    if (journal.intentId && Array.isArray(journal.intentArgs)) {
      intentId = journal.intentId;
      const saved = [...journal.intentArgs];
      for (const index of [2, 4, 6, 8, 12, 13, 14]) saved[index] = BigInt(String(saved[index]));
      args = saved;
    } else {
      if (journal.intentId || journal.intentArgs) throw new Error("V3_PERSISTED_INTENT_INPUTS_INCOMPLETE_NO_REWRITE");
      const evidenceBlock = await createEvidenceBlock();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const intendedExecutionNonce = evidenceBlock.intendedExecutionNonce;
      intentId = keccak256(stringToHex(`FIREWALL_PROSPECTIVE_SAFE_INTENT_V3|${SAFE.toLowerCase()}|${intendedExecutionNonce}|${randomBytes(24).toString("hex")}`));
      const executionDeadline = nowSeconds + 18_000;
      const permitExpiry = nowSeconds + 21_000;
      args = [
        mandate.mandateId, intentId, BigInt(EVM_CHAIN_ID), SAFE, BigInt(intendedExecutionNonce), GUARD, 0n,
        OWNER_SELECTOR, 0n, GUARD, evidenceBlock.guardCodeHash, SAFE_DEPLOYMENT_TX,
        BigInt(evidenceBlock.blockNumber), BigInt(executionDeadline), BigInt(permitExpiry), evidenceBlock.targetCodeHash,
      ];
      journal.intentId = intentId;
      journal.intentArgs = jsonSafe(args);
      journal.safeNonceBeforeInstallation = evidenceBlock.safeNonceBeforeInstallation;
      journal.intendedExecutionNonce = intendedExecutionNonce;
      journal.preflight = { ...journal.preflight, evmEvidenceSnapshot: evidenceBlock };
      save(journal);
    }
    if (!intent && journal.intentId && Array.isArray(journal.intentArgs)) {
      const failedCommit = stepFor(journal, "commit_prospective_intent");
      if (failedCommit?.genlayerTransactionId && failedCommit.status === "GENLAYER_FINALIZED_CONSENSUS_OR_EXECUTION_FAILED_STOP") {
        const failedConsensus = failedCommit.consensus ?? {};
        const validatorState = failedConsensus.validatorState as Record<string, unknown> | undefined;
        const leaderFailure = Array.isArray(failedConsensus.leaderReceipts) && (failedConsensus.leaderReceipts as Record<string, unknown>[]).some((receipt) => receipt.mode === "leader" && receipt.execution === "ERROR" && receipt.resultStatus === "contract_error");
        if (failedConsensus.status !== "FINALIZED" || failedConsensus.consensus !== "MAJORITY_AGREE" || !leaderFailure || validatorState?.reason !== "LEADER_EXECUTION_DID_NOT_RETURN_SUCCESS" || String(failedCommit.args?.[2]) === String(EVM_CHAIN_ID)) throw new Error("FAILED_INTENT_COMMIT_NOT_PROVEN_NONCOMMITTING_NO_REWRITE");
        failedCommit.key = "commit_prospective_intent_failed_attempt_chain_61999";
        failedCommit.reconciledAsNonCommittingContractError = true;
        failedCommit.canonicalReadback = { canonicalIntentIdAbsent: true, priorTransactionFinalized: true, priorOutcome: "CONTRACT_ERROR_CHAIN_ID_BINDING_MISMATCH", correctedTargetEvmChainId: EVM_CHAIN_ID, reconciledAt: now() };
        journal.intentArgs[2] = EVM_CHAIN_ID;
        args[2] = BigInt(EVM_CHAIN_ID);
        save(journal);
      }
    }
    if (Number(args[2]) !== EVM_CHAIN_ID || String(args[3]).toLowerCase() !== SAFE.toLowerCase()) throw new Error("PROSPECTIVE_INTENT_EVM_CHAIN_OR_SAFE_BINDING_MISMATCH_STOP");
    await runWrite({ journal, client, account, key: "commit_prospective_intent", method: "commit_prospective_intent", args, address: contractAddress, readModel: reader, postcondition: (model) => {
      const item = model.intents.find((value) => value.intentId.toLowerCase() === intentId.toLowerCase());
      return item && item.chainId === EVM_CHAIN_ID ? { intentId: item.intentId, state: item.state, chainId: item.chainId, safe: item.safe, safeNonce: item.safeNonce, target: item.target, value: item.value, calldataHash: item.calldataHash, operation: item.operation, evidenceBlock: item.evidenceBlock, guard: item.guard } : null;
    } });
  }
  model = await reader();
  if (!journal.intentId) throw new Error("V3_INTENT_ID_MISSING");
  intent = model.intents.find((item) => item.intentId.toLowerCase() === journal!.intentId!.toLowerCase());
  if (!intent) throw new Error("V3_INTENT_CANONICAL_READBACK_MISSING");
  if (intent.state === "INTENT_COMMITTED") {
    const priorAuth = stepFor(journal, "authenticate_prospective_intent");
    if (priorAuth?.genlayerTransactionId && priorAuth.status === "GENLAYER_FINALIZED_CONSENSUS_OR_EXECUTION_FAILED_STOP") {
      const summary = priorAuth.consensus ?? {};
      const authenticatedStateUnchanged = intent.authenticatedEvidence === "" && intent.evidenceHash === `0x${"00".repeat(32)}` && intent.adjudicationId === "" && !model.adjudications.some((item) => item.intentId.toLowerCase() === intent!.intentId.toLowerCase()) && !model.permits.some((item) => item.intentId.toLowerCase() === intent!.intentId.toLowerCase());
      const priorFinalDisagreement = summary.status === "FINALIZED" && summary.consensus === "MAJORITY_DISAGREE" && priorAuth.outerEvmReceipt?.status === "0x1";
      const priorRetries = journal.steps.filter((item) => item.key.startsWith("authenticate_prospective_intent_failed_attempt_")).length;
      if (!authenticatedStateUnchanged || !priorFinalDisagreement || priorRetries >= 1) throw new Error("V3_AUTHENTICATION_RETRY_PRECONDITION_FAILED_STOP");
      priorAuth.reconciledPriorStatus = priorAuth.status;
      priorAuth.key = "authenticate_prospective_intent_failed_attempt_1";
      priorAuth.status = "RECONCILED_FINALIZED_DISAGREEMENT_CANONICAL_STATE_UNCHANGED";
      priorAuth.canonicalReadback = { intentId: intent.intentId, state: intent.state, evidenceHash: intent.evidenceHash, authenticatedEvidenceLength: intent.authenticatedEvidence.length, adjudicationId: intent.adjudicationId, adjudicationsForIntent: 0, permitsForIntent: 0, priorConsensus: "MAJORITY_DISAGREE", reconciledAt: now() };
      save(journal);
    }
    await runWrite({ journal, client, account, key: "authenticate_prospective_intent", method: "authenticate_prospective_intent", args: [intent.intentId], address: contractAddress, readModel: reader, postcondition: (next) => {
      const item = next.intents.find((value) => value.intentId.toLowerCase() === intent!.intentId.toLowerCase());
      if (!item || item.state !== "INTENT_AUTHENTICATED" || item.evidenceHash === `0x${"00".repeat(32)}`) return null;
      try {
        const evidence = JSON.parse(item.authenticatedEvidence) as Record<string, unknown>;
        const pair = evidence.independently_authenticated as Record<string, unknown>;
        const factsA = pair.provider_a as Record<string, unknown>;
        const factsB = pair.provider_b as Record<string, unknown>;
        const state = factsA.safe_state as Record<string, unknown>;
        if (pair.provider_state_agreement !== true || factsA.provider !== "DRPC_SEPOLIA" || factsB.provider !== "PUBLICNODE_SEPOLIA_BLOCKSCOUT" || pair.provider_b_receipt_source !== "BLOCKSCOUT_SEPOLIA_REST" || state.guard_installation_pending !== true || Number(state.planned_execution_nonce) !== Number(item.safeNonce)) return null;
        return { intentId: item.intentId, state: item.state, evidenceHash: item.evidenceHash, providers: [factsA.provider, factsB.provider], providerStateAgreement: true, snapshotBlock: (factsA.snapshot as Record<string, unknown>).number, guardInstallPending: state.guard_installation_pending, plannedExecutionNonce: state.planned_execution_nonce, receiptClaimedForFutureExecution: pair.receipt_claimed_for_future_execution };
      } catch { return null; }
    } });
  } else if (intent.state !== "INTENT_AUTHENTICATED" && intent.state !== "INTENT_ADJUDICATED" && intent.state !== "PROSPECTIVE_PERMIT_ISSUED") throw new Error(`V3_INTENT_UNEXPECTED_STATE:${intent.state}`);

  model = await reader();
  intent = model.intents.find((item) => item.intentId.toLowerCase() === journal!.intentId!.toLowerCase())!;
  let adjudication = model.adjudications.find((item) => item.intentId.toLowerCase() === intent.intentId.toLowerCase());
  if (intent.state === "INTENT_AUTHENTICATED" && !adjudication) {
    await runWrite({ journal, client, account, key: "adjudicate_prospective_intent", method: "adjudicate_prospective_intent", args: [intent.intentId], address: contractAddress, readModel: reader, postcondition: (next) => {
      const item = next.adjudications.find((value) => value.intentId.toLowerCase() === intent!.intentId.toLowerCase());
      if (!item) return null;
      return { adjudicationId: item.adjudicationId, intentId: item.intentId, verdict: item.verdict, generation: item.generation, evidenceSufficient: item.evidenceSufficient, intentSatisfied: item.intentSatisfied, scopeExpanded: item.scopeExpanded, prohibitedEffectPresent: item.prohibitedEffectPresent, economicTermsConsistent: item.economicTermsConsistent, administrativeAuthorityChanged: item.administrativeAuthorityChanged, implementationBehaviorConsistent: item.implementationBehaviorConsistent };
    } });
  }
  model = await reader();
  intent = model.intents.find((item) => item.intentId.toLowerCase() === journal!.intentId!.toLowerCase())!;
  adjudication = model.adjudications.find((item) => item.intentId.toLowerCase() === intent.intentId.toLowerCase());
  if (!adjudication || adjudication.verdict !== "PROSPECTIVE_AUTHORIZED" || !adjudication.evidenceSufficient || !adjudication.intentSatisfied || adjudication.scopeExpanded || adjudication.prohibitedEffectPresent || !adjudication.economicTermsConsistent || adjudication.administrativeAuthorityChanged || !adjudication.implementationBehaviorConsistent) throw new Error("V3_PROSPECTIVE_ADJUDICATION_NOT_AUTHORIZED_STOP");
  journal.adjudicationId = adjudication.adjudicationId;
  save(journal);

  let permit = model.permits.find((item) => item.intentId.toLowerCase() === intent.intentId.toLowerCase());
  if (!permit) {
    await runWrite({ journal, client, account, key: "issue_prospective_permit", method: "issue_prospective_permit", args: [intent.intentId, adjudication.adjudicationId], address: contractAddress, readModel: reader, postcondition: (next) => {
      const found = next.permits.find((value) => value.intentId.toLowerCase() === intent!.intentId.toLowerCase());
      return found && found.status === "ACTIVE" && next.permitStatuses[found.permitId] === "ACTIVE" ? { permitId: found.permitId, intentId: found.intentId, mandateId: found.mandateId, adjudicationId: found.adjudicationId, bindingHash: found.bindingHash, status: found.status, permitStatus: next.permitStatuses[found.permitId], expiresAt: found.expiresAt, safe: intent!.safe, chainId: intent!.chainId, safeNonce: intent!.safeNonce, target: intent!.target, value: intent!.value, calldataHash: intent!.calldataHash, operation: intent!.operation } : null;
    } });
  }
  model = await reader();
  permit = model.permits.find((item) => item.intentId.toLowerCase() === journal!.intentId!.toLowerCase());
  if (!permit || permit.status !== "ACTIVE" || model.permitStatuses[permit.permitId] !== "ACTIVE") throw new Error("V3_FINAL_CANONICAL_PROSPECTIVE_PERMIT_NOT_ACTIVE");
  journal.permitId = permit.permitId;
  journal.finalCanonicalReadback = { source: model.source, chainId: model.config.chainId, rpcUrl: model.config.rpcUrl, contractAddress, sourceSha256: model.config.expectedSourceSha256, mandate, intent, adjudication, permit, permitStatus: model.permitStatuses[permit.permitId] } as unknown as Record<string, unknown>;
  journal.status = "PROSPECTIVE_V3_FINALIZED_CANONICAL_PERMIT_ACTIVE";
  save(journal);
  console.log(JSON.stringify({ status: journal.status, contractAddress, sourceSha256: SOURCE_SHA256, schemaSha256: schemaInfo.schemaSha256, mandateId: journal.mandateId, intentId: journal.intentId, adjudicationId: journal.adjudicationId, permitId: journal.permitId, safe: SAFE, intendedExecutionNonce: journal.intendedExecutionNonce, steps: journal.steps.map(({ key, method, status, evmSubmissionHash, genlayerTransactionId, consensus, canonicalReadback }) => ({ key, method, status, evmSubmissionHash, genlayerTransactionId, consensus, canonicalReadback })), initialBalanceWei: journal.initialBalanceWei, finalBalanceWei: String(await client.getBalance({ address: account.address })) }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n", 1)[0] : "UNKNOWN";
  console.error(JSON.stringify({ status: "V3_QUALIFICATION_STOPPED_NO_RETRY", error: message, journal: JOURNAL_PATH }));
  process.exitCode = 1;
});
