import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ganache from "ganache";
import {
  createPublicClient, createWalletClient, custom, encodeFunctionData, hashTypedData, keccak256,
  parseEventLogs, zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAIN_ID = 11155111;
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SINGLETON = "0x41675c099f32341bf84bfc5382af534df5c7461a";
const FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RELAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ZERO_HASH = `0x${"00".repeat(32)}`;

const factoryAbi = [
  { type: "function", name: "createProxyWithNonce", stateMutability: "nonpayable", inputs: [{ name: "_singleton", type: "address" }, { name: "initializer", type: "bytes" }, { name: "saltNonce", type: "uint256" }], outputs: [{ name: "proxy", type: "address" }] },
  { type: "event", name: "ProxyCreation", anonymous: false, inputs: [{ name: "proxy", type: "address", indexed: true }, { name: "singleton", type: "address", indexed: false }] },
];
const safeAbi = [
  { type: "function", name: "setup", stateMutability: "nonpayable", inputs: [{ name: "_owners", type: "address[]" }, { name: "_threshold", type: "uint256" }, { name: "to", type: "address" }, { name: "data", type: "bytes" }, { name: "fallbackHandler", type: "address" }, { name: "paymentToken", type: "address" }, { name: "payment", type: "uint256" }, { name: "paymentReceiver", type: "address" }], outputs: [] },
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getStorageAt", stateMutability: "view", inputs: [{ name: "offset", type: "uint256" }, { name: "length", type: "uint256" }], outputs: [{ type: "bytes" }] },
  { type: "function", name: "setGuard", stateMutability: "nonpayable", inputs: [{ name: "guard", type: "address" }], outputs: [] },
  { type: "function", name: "getTransactionHash", stateMutability: "view", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "_nonce", type: "uint256" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "execTransaction", stateMutability: "payable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "signatures", type: "bytes" }], outputs: [{ type: "bool" }] },
  { type: "event", name: "ExecutionSuccess", anonymous: false, inputs: [{ name: "txHash", type: "bytes32", indexed: true }, { name: "payment", type: "uint256", indexed: false }] },
  { type: "event", name: "ExecutionFailure", anonymous: false, inputs: [{ name: "txHash", type: "bytes32", indexed: true }, { name: "payment", type: "uint256", indexed: false }] },
];
const safeTxTypes = { SafeTx: [
  { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" },
  { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" },
  { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" },
] };
const permitTypes = { PermitAuthorization: [
  { name: "permitId", type: "bytes32" }, { name: "intentId", type: "bytes32" }, { name: "mandateId", type: "bytes32" }, { name: "executionId", type: "bytes32" }, { name: "proposalHash", type: "bytes32" }, { name: "executionBundleHash", type: "bytes32" },
  { name: "targetChainId", type: "uint256" }, { name: "safe", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "dataHash", type: "bytes32" },
  { name: "operation", type: "uint8" }, { name: "safeNonce", type: "uint256" }, { name: "targetsDigest", type: "bytes32" }, { name: "valuesDigest", type: "bytes32" }, { name: "calldataDigest", type: "bytes32" },
  { name: "codeFactsDigest", type: "bytes32" }, { name: "implementationFactsDigest", type: "bytes32" }, { name: "targetCodeHash", type: "bytes32" }, { name: "implementationAddress", type: "address" }, { name: "implementationCodeHash", type: "bytes32" },
  { name: "batchStructureHash", type: "bytes32" }, { name: "adjudicationId", type: "bytes32" }, { name: "adjudicationGeneration", type: "uint256" }, { name: "executionDeadline", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "canonicalPermitHash", type: "bytes32" },
] };

async function main() {
  const artifact = JSON.parse(readFileSync("artifacts/FirewallSafeGuard.artifact.json", "utf8"));
  const provider = ganache.provider({
    chain: { chainId: CHAIN_ID, networkId: CHAIN_ID, hardfork: "shanghai" },
    fork: { url: RPC },
    wallet: { accounts: [OWNER_KEY, RELAYER_KEY].map((secretKey) => ({ secretKey, balance: "0x3635C9ADC5DEA00000" })) },
    logging: { quiet: true },
  });
  const chain = { id: CHAIN_ID, name: "Ethereum Sepolia Fork", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
  const publicClient = createPublicClient({ chain, transport: custom(provider) });
  const owner = privateKeyToAccount(OWNER_KEY);
  const relayer = privateKeyToAccount(RELAYER_KEY);
  const ownerWallet = createWalletClient({ account: owner, chain, transport: custom(provider) });
  const relayWallet = createWalletClient({ account: relayer, chain, transport: custom(provider) });
  const singletonCode = await publicClient.getCode({ address: SINGLETON });
  const factoryCode = await publicClient.getCode({ address: FACTORY });
  if (!singletonCode || singletonCode === "0x" || !factoryCode || factoryCode === "0x") throw new Error("OFFICIAL_SAFE_REGISTRY_CODE_UNAVAILABLE_ON_FORK");
  if (keccak256(singletonCode).toLowerCase() !== "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4" || keccak256(factoryCode).toLowerCase() !== "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317") throw new Error("OFFICIAL_SAFE_REGISTRY_RUNTIME_HASH_MISMATCH_ON_FORK");
  if (await publicClient.getChainId() !== CHAIN_ID) throw new Error("FORK_CHAIN_ID_MISMATCH");

  const initializer = encodeFunctionData({ abi: safeAbi, functionName: "setup", args: [[owner.address], 1n, zeroAddress, "0x", zeroAddress, zeroAddress, 0n, zeroAddress] });
  const proxyTx = await ownerWallet.writeContract({ address: FACTORY, abi: factoryAbi, functionName: "createProxyWithNonce", args: [SINGLETON, initializer, 8675309n] });
  const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyTx });
  if (proxyReceipt.status !== "success") throw new Error("SAFE_PROXY_FACTORY_REVERTED_ON_FORK");
  const created = parseEventLogs({ abi: factoryAbi, logs: proxyReceipt.logs, eventName: "ProxyCreation" });
  if (created.length !== 1) throw new Error("SAFE_PROXY_CREATION_EVENT_MISSING_ON_FORK");
  const safe = created[0].args.proxy;
  const [owners, threshold, initializedNonce] = await Promise.all([
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" }),
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getThreshold" }),
    publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" }),
  ]);
  if (owners.length !== 1 || owners[0].toLowerCase() !== owner.address.toLowerCase() || threshold !== 1n || initializedNonce !== 0n) throw new Error("SAFE_OWNER_THRESHOLD_OR_INIT_MISMATCH_ON_FORK");

  async function signAndExecute(to, value, data) {
    const nonce = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" });
    const message = { to, value, data, operation: 0, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: zeroAddress, refundReceiver: zeroAddress, nonce };
    const domain = { chainId: CHAIN_ID, verifyingContract: safe };
    const localHash = hashTypedData({ domain, types: safeTxTypes, primaryType: "SafeTx", message });
    const onchainHash = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getTransactionHash", args: [to, value, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, nonce] });
    if (localHash.toLowerCase() !== onchainHash.toLowerCase()) throw new Error("SAFE_EIP712_TYPED_DATA_MISMATCH_ON_FORK");
    const signature = await owner.signTypedData({ domain, types: safeTxTypes, primaryType: "SafeTx", message });
    const hash = await ownerWallet.writeContract({ address: safe, abi: safeAbi, functionName: "execTransaction", args: [to, value, data, 0, 0n, 0n, 0n, zeroAddress, zeroAddress, signature], gas: 1_500_000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1000 });
    return { hash, receipt, nonce, message };
  }

  const canary = await signAndExecute(relayer.address, 0n, "0x");
  if (canary.receipt.status !== "success") throw new Error("SAFE_CANARY_EXECUTION_FAILED_ON_FORK");

  const guardHash = await ownerWallet.deployContract({ abi: artifact.abi, bytecode: artifact.creationBytecode, args: [safe, relayer.address] });
  const guardReceipt = await publicClient.waitForTransactionReceipt({ hash: guardHash });
  if (guardReceipt.status !== "success" || !guardReceipt.contractAddress) throw new Error("GUARD_DEPLOYMENT_FAILED_ON_FORK");
  const guard = guardReceipt.contractAddress;
  const actualGuardCode = await publicClient.getCode({ address: guard });
  const guardCodeHash = keccak256(actualGuardCode ?? "0x");
  const installedGuard = await publicClient.readContract({ address: guard, abi: artifact.abi, functionName: "safe" });
  if (installedGuard.toLowerCase() !== safe.toLowerCase()) throw new Error("GUARD_SAFE_BINDING_MISMATCH_ON_FORK");
  const transferAdminTx = await ownerWallet.writeContract({ address: guard, abi: artifact.abi, functionName: "transferOwnership", args: [safe] });
  const transferAdminReceipt = await publicClient.waitForTransactionReceipt({ hash: transferAdminTx });
  const guardOwner = await publicClient.readContract({ address: guard, abi: artifact.abi, functionName: "owner" });
  if (transferAdminReceipt.status !== "success" || guardOwner.toLowerCase() !== safe.toLowerCase()) throw new Error("GUARD_ADMIN_NOT_TRANSFERRED_TO_SAFE_ON_FORK");
  try {
    await ownerWallet.writeContract({ address: guard, abi: artifact.abi, functionName: "setRelayer", args: [owner.address, true] });
    throw new Error("UNPROTECTED_GUARD_ADMINISTRATION_WAS_ACCEPTED_ON_FORK");
  } catch (error) {
    if (error instanceof Error && error.message === "UNPROTECTED_GUARD_ADMINISTRATION_WAS_ACCEPTED_ON_FORK") throw error;
  }
  const safeGuardInterfaceSupported = await publicClient.readContract({ address: guard, abi: artifact.abi, functionName: "supportsInterface", args: ["0xe6d7a83a"] });
  const erc165InterfaceSupported = await publicClient.readContract({ address: guard, abi: artifact.abi, functionName: "supportsInterface", args: ["0x01ffc9a7"] });
  const unknownInterfaceSupported = await publicClient.readContract({ address: guard, abi: artifact.abi, functionName: "supportsInterface", args: ["0xffffffff"] });
  if (!safeGuardInterfaceSupported || !erc165InterfaceSupported || unknownInterfaceSupported) throw new Error("SAFE_TRANSACTION_GUARD_INTERFACE_UNSUPPORTED_ON_FORK");
  const guardInstall = await signAndExecute(safe, 0n, encodeFunctionData({ abi: safeAbi, functionName: "setGuard", args: [guard] }));
  const guardStorage = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [BigInt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8"), 1n] });
  const actualInstalledGuard = `0x${guardStorage.slice(-40)}`;
  if (guardInstall.receipt.status !== "success" || actualInstalledGuard.toLowerCase() !== guard.toLowerCase()) {
    const failureEvents = parseEventLogs({ abi: safeAbi, logs: guardInstall.receipt.logs, eventName: "ExecutionFailure" });
    throw new Error(`SAFE_GUARD_INSTALLATION_FAILED_ON_FORK:${JSON.stringify({ receiptStatus: guardInstall.receipt.status, actualInstalledGuard, expectedGuard: guard, failureEvents: failureEvents.length, owner: owner.address, safeNonce: String(guardInstall.nonce), txHash: guardInstall.hash })}`);
  }

  const target = relayer.address;
  const callData = "0x";
  const safeNonce = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" });
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const authorization = {
    permitId: `0x${"01".repeat(32)}`, intentId: `0x${"19".repeat(32)}`, mandateId: `0x${"02".repeat(32)}`, executionId: `0x${"03".repeat(32)}`, proposalHash: `0x${"04".repeat(32)}`, executionBundleHash: `0x${"05".repeat(32)}`,
    targetChainId: BigInt(CHAIN_ID), safe, to: target, value: 0n, dataHash: keccak256(callData), operation: 0, safeNonce,
    targetsDigest: `0x${"11".repeat(32)}`, valuesDigest: `0x${"12".repeat(32)}`, calldataDigest: `0x${"13".repeat(32)}`, codeFactsDigest: `0x${"14".repeat(32)}`, implementationFactsDigest: `0x${"15".repeat(32)}`,
    targetCodeHash: ZERO_HASH, implementationAddress: zeroAddress, implementationCodeHash: ZERO_HASH, batchStructureHash: `0x${"16".repeat(32)}`, adjudicationId: `0x${"17".repeat(32)}`,
    adjudicationGeneration: 1n, executionDeadline: currentTime + 600n, expiresAt: currentTime + 600n, canonicalPermitHash: `0x${"18".repeat(32)}`,
  };
  const signature = await relayer.signTypedData({ domain: { name: "FirewallSafeGuard", version: "1", chainId: CHAIN_ID, verifyingContract: guard }, types: permitTypes, primaryType: "PermitAuthorization", message: authorization });
  const guardWrite = await ownerWallet.writeContract({ address: guard, abi: artifact.abi, functionName: "registerAuthorization", args: [authorization, signature] });
  const guardWriteReceipt = await publicClient.waitForTransactionReceipt({ hash: guardWrite });
  if (guardWriteReceipt.status !== "success") throw new Error("PERMIT_REGISTRATION_FAILED_ON_FORK");
  const authorized = await signAndExecute(target, 0n, callData);
  if (authorized.receipt.status !== "success") throw new Error("AUTHORIZED_SAFE_EXECUTION_FAILED_ON_FORK");
  const successLogs = parseEventLogs({ abi: safeAbi, logs: authorized.receipt.logs, eventName: "ExecutionSuccess" });
  if (successLogs.length !== 1) throw new Error(`SAFE_EXECUTION_SUCCESS_LOG_MISSING_ON_FORK:${JSON.stringify(authorized.receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })))}`);

  const unauthorized = await signAndExecute(owner.address, 0n, callData);
  if (unauthorized.receipt.status !== "reverted") throw new Error("UNAUTHORIZED_SAFE_EXECUTION_WAS_NOT_REJECTED_ON_FORK");
  const replay = await publicClient.readContract({ address: guard, abi: artifact.abi, functionName: "consumed", args: [authorization.permitId] });
  if (!replay) throw new Error("AUTHORIZED_EXECUTION_DID_NOT_CONSUME_PERMIT_ON_FORK");
  const replayAttempt = await signAndExecute(target, 0n, callData);
  if (replayAttempt.receipt.status !== "reverted") throw new Error("CONSUMED_AUTHORIZATION_REPLAY_WAS_NOT_REJECTED_ON_FORK");

  const safeNonceForRemoval = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "nonce" });
  const removalData = encodeFunctionData({ abi: safeAbi, functionName: "setGuard", args: [zeroAddress] });
  const safeCode = await publicClient.getCode({ address: safe });
  const removalAuthorization = {
    ...authorization,
    permitId: `0x${"21".repeat(32)}`,
    intentId: `0x${"31".repeat(32)}`,
    safe,
    to: safe,
    dataHash: keccak256(removalData),
    safeNonce: safeNonceForRemoval,
    targetCodeHash: keccak256(safeCode ?? "0x"),
    executionBundleHash: `0x${"41".repeat(32)}`,
    canonicalPermitHash: `0x${"51".repeat(32)}`,
  };
  const removalSignature = await relayWallet.signTypedData({ domain: { name: "FirewallSafeGuard", version: "1", chainId: CHAIN_ID, verifyingContract: guard }, types: permitTypes, primaryType: "PermitAuthorization", message: removalAuthorization });
  const removalRegistrationHash = await ownerWallet.writeContract({ address: guard, abi: artifact.abi, functionName: "registerAuthorization", args: [removalAuthorization, removalSignature] });
  const removalRegistrationReceipt = await publicClient.waitForTransactionReceipt({ hash: removalRegistrationHash });
  if (removalRegistrationReceipt.status !== "success") throw new Error("RECOVERY_PERMIT_REGISTRATION_FAILED_ON_FORK");
  const recovery = await signAndExecute(safe, 0n, removalData);
  if (recovery.receipt.status !== "success") throw new Error("AUTHORIZED_GUARD_RECOVERY_FAILED_ON_FORK");
  const guardStorageAfterRecovery = await publicClient.readContract({ address: safe, abi: safeAbi, functionName: "getStorageAt", args: [BigInt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8"), 1n] });
  if (`0x${guardStorageAfterRecovery.slice(-40)}` !== zeroAddress) throw new Error("AUTHORIZED_GUARD_RECOVERY_READBACK_FAILED_ON_FORK");
  const evidence = {
    evidenceScope: "LOCAL_SEPOLIA_FORK_ONLY_NOT_PUBLIC_LIVE_ENFORCEMENT",
    checkedAt: new Date().toISOString(),
    status: "PASS_LOCAL_OFFICIAL_SAFE_FORK_ONLY",
    guardSourceSha256: artifact.sourceSha256,
    safeHookNonceSemantics: "Safe v1.4.1 increments nonce before guard check; authorization uses nonce-1",
    forkChainId: CHAIN_ID,
    safeSingleton: SINGLETON,
    safeFactory: FACTORY,
    safe,
    canaryExecutionTx: canary.hash,
    canaryExecutionStatus: canary.receipt.status,
    guard,
    guardRuntimeCodeHash: guardCodeHash,
    guardOwner,
    guardAdministrationRequiresSafe: true,
    safeOwner: owner.address,
    threshold: String(threshold),
    safeGuardInterfaceSupported,
    erc165InterfaceSupported,
    unknownInterfaceSupported,
    installationTx: guardInstall.hash,
    transferGuardAdminToSafeTx: transferAdminTx,
    authorizationRegistrationTx: guardWrite,
    authorizedExecutionTx: authorized.hash,
    unauthorizedExecutionTx: unauthorized.hash,
    unauthorizedExecutionStatus: unauthorized.receipt.status,
    replayExecutionTx: replayAttempt.hash,
    replayExecutionStatus: replayAttempt.receipt.status,
    authorizedGuardRecoveryRegistrationTx: removalRegistrationHash,
    authorizedGuardRecoveryTx: recovery.hash,
    guardRemovedAfterAuthorizedRecovery: true,
    replayConsumed: replay,
    simulatedGasUsed: {
      safeProxyCreation: String(proxyReceipt.gasUsed),
      safeCanaryExecution: String(canary.receipt.gasUsed),
      guardDeployment: String(guardReceipt.gasUsed),
      guardAdminTransfer: String(transferAdminReceipt.gasUsed),
      guardInstallation: String(guardInstall.receipt.gasUsed),
      authorizationRegistration: String(guardWriteReceipt.gasUsed),
      authorizedExecution: String(authorized.receipt.gasUsed),
      unauthorizedRejectedExecution: String(unauthorized.receipt.gasUsed),
      replayRejectedExecution: String(replayAttempt.receipt.gasUsed),
      authorizedGuardRecovery: String(recovery.receipt.gasUsed),
    },
    publicBroadcasts: 0,
    canonicalGenLayerPermit: "NOT_USED_SYNTHETIC_LOCAL_AUTHORIZATION_ONLY",
  };
  mkdirSync("evidence/qualification/current", { recursive: true });
  writeFileSync("evidence/qualification/current/safe_guard_official_fork.json", `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
  await provider.disconnect();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
