import fs from "node:fs";
import solc from "solc";
import ganache from "ganache";
import {
  createPublicClient, createWalletClient, custom, encodeFunctionData, getContractAddress, http, keccak256,
} from "../packages/evm-analyzer/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "../packages/evm-analyzer/node_modules/viem/_esm/accounts/index.js";
const SAFE_GUARD_TYPES = { PermitAuthorization: [
  { name: "permitId", type: "bytes32" }, { name: "intentId", type: "bytes32" }, { name: "mandateId", type: "bytes32" }, { name: "executionId", type: "bytes32" }, { name: "proposalHash", type: "bytes32" }, { name: "executionBundleHash", type: "bytes32" }, { name: "targetChainId", type: "uint256" }, { name: "safe", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "dataHash", type: "bytes32" }, { name: "operation", type: "uint8" }, { name: "safeNonce", type: "uint256" }, { name: "targetsDigest", type: "bytes32" }, { name: "valuesDigest", type: "bytes32" }, { name: "calldataDigest", type: "bytes32" }, { name: "codeFactsDigest", type: "bytes32" }, { name: "implementationFactsDigest", type: "bytes32" }, { name: "targetCodeHash", type: "bytes32" }, { name: "implementationAddress", type: "address" }, { name: "implementationCodeHash", type: "bytes32" }, { name: "batchStructureHash", type: "bytes32" }, { name: "adjudicationId", type: "bytes32" }, { name: "adjudicationGeneration", type: "uint256" }, { name: "executionDeadline", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "canonicalPermitHash", type: "bytes32" },
] };
function safeGuardDomain(chainId, guard) { return { domain: { name: "FirewallSafeGuard", version: "1", chainId, verifyingContract: guard } }; }

const PRIVATE_KEYS = [
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce036f9a2c1e5c84a5b4d6d",
  "0x6cbed15c5f6f5f9f9f6a9b0a6f7d4a7e1f9f3b1c2d4e6f8a0b1c2d3e4f5a6b7c",
];

function compile() {
  const sources = {};
  for (const file of ["contracts/FirewallSafeGuard.sol", "contracts/FirewallSafeGuardHarness.sol"]) sources[file] = { content: fs.readFileSync(file, "utf8") };
  const output = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } })));
  const errors = (output.errors ?? []).filter((error) => error.severity === "error");
  if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  return output.contracts;
}

function artifact(contracts, file, name) {
  const item = contracts[file][name];
  return { abi: item.abi, bytecode: `0x${item.evm.bytecode.object}` };
}

async function main() {
  const contracts = compile();
  const provider = ganache.provider({ chain: { chainId: 31337 }, wallet: { accounts: PRIVATE_KEYS.map((secretKey) => ({ secretKey, balance: "0x3635C9ADC5DEA00000" })) }, logging: { quiet: true } });
  const chain = { id: 31337, name: "Firewall Local EVM", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:0"] } } };
  const publicClient = createPublicClient({ chain, transport: custom(provider) });
  const owner = privateKeyToAccount(PRIVATE_KEYS[0]);
  const relayer = privateKeyToAccount(PRIVATE_KEYS[1]);
  const ownerWallet = createWalletClient({ account: owner, chain, transport: custom(provider) });
  const relayerWallet = createWalletClient({ account: relayer, chain, transport: custom(provider) });
  async function deploy(item, args = []) { const hash = await ownerWallet.deployContract({ abi: item.abi, bytecode: item.bytecode, args }); const receipt = await publicClient.waitForTransactionReceipt({ hash }); return { ...item, address: receipt.contractAddress }; }
  const safe = await deploy(artifact(contracts, "contracts/FirewallSafeGuardHarness.sol", "FirewallMockSafe"), [owner.address]);
  const receiver = await deploy(artifact(contracts, "contracts/FirewallSafeGuardHarness.sol", "FirewallGuardReceiver"));
  const guard = await deploy(artifact(contracts, "contracts/FirewallSafeGuard.sol", "FirewallSafeGuard"), [safe.address, relayer.address]);
  const safeAbi = safe.abi;
  const receiverAbi = receiver.abi;
  const guardAbi = guard.abi;
  async function send(client, request) { const hash = await client.writeContract(request); return publicClient.waitForTransactionReceipt({ hash }); }
  await send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "setGuard", args: [guard.address] });
  await send(ownerWallet, { address: guard.address, abi: guardAbi, functionName: "transferOwnership", args: [safe.address] });
  const guardOwner = await publicClient.readContract({ address: guard.address, abi: guardAbi, functionName: "owner" });
  if (guardOwner.toLowerCase() !== safe.address.toLowerCase()) throw new Error("GUARD_ADMIN_NOT_TRANSFERRED_TO_PROTECTED_SAFE");
  const receiverCode = await publicClient.getBytecode({ address: receiver.address });
  const callData = encodeFunctionData({ abi: receiverAbi, functionName: "setValue", args: [42n] });
  const zeros = `0x${"11".repeat(32)}`;
  function authorization(overrides = {}) {
    return { permitId: `0x${"01".repeat(32)}`, intentId: `0x${"16".repeat(32)}`, mandateId: `0x${"02".repeat(32)}`, executionId: `0x${"03".repeat(32)}`, proposalHash: `0x${"04".repeat(32)}`, executionBundleHash: `0x${"05".repeat(32)}`, targetChainId: 31337n, safe: safe.address, to: receiver.address, value: 0n, dataHash: keccak256(callData), operation: 0, safeNonce: 0n, targetsDigest: zeros, valuesDigest: zeros, calldataDigest: zeros, codeFactsDigest: zeros, implementationFactsDigest: zeros, targetCodeHash: keccak256(receiverCode), implementationAddress: "0x0000000000000000000000000000000000000000", implementationCodeHash: `0x${"00".repeat(32)}`, batchStructureHash: zeros, adjudicationId: `0x${"06".repeat(32)}`, adjudicationGeneration: 1n, executionDeadline: 4102444800n, expiresAt: 4102444800n, canonicalPermitHash: `0x${"07".repeat(32)}`, ...overrides };
  }
  async function registerAs(auth, signer = relayer) {
    const signerWallet = signer.address === relayer.address ? relayerWallet : ownerWallet;
    const signature = await signerWallet.signTypedData({ account: signer, ...safeGuardDomain(31337, guard.address), types: SAFE_GUARD_TYPES, primaryType: "PermitAuthorization", message: auth });
    return send(relayerWallet, { address: guard.address, abi: guardAbi, functionName: "registerAuthorization", args: [auth, signature] });
  }
  async function register(auth) { return registerAs(auth, relayer); }
  await register(authorization());
  await send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [receiver.address, 0n, callData, 0] });
  const value = await publicClient.readContract({ address: receiver.address, abi: receiverAbi, functionName: "value" });
  if (value !== 42n) throw new Error(`valid execution did not complete: ${value}`);

  async function rejects(label, action) { try { await action(); throw new Error(`${label}: unexpectedly accepted`); } catch (error) { if (error instanceof Error && error.message.includes("unexpectedly accepted")) throw error; } }
  await rejects("guard configuration requires protected Safe", () => send(ownerWallet, { address: guard.address, abi: guardAbi, functionName: "setRelayer", args: [owner.address, true] }));
  const differentData = encodeFunctionData({ abi: receiverAbi, functionName: "setValue", args: [43n] });
  await rejects("different calldata", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [receiver.address, 0n, differentData, 0] }));
  await rejects("different target", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [relayer.address, 0n, callData, 0] }));
  await rejects("replay", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [receiver.address, 0n, callData, 0] }));
  await rejects("duplicate intent registration", () => register(authorization({ permitId: `0x${"18".repeat(32)}`, safeNonce: 1n })));
  await rejects("guard removal", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [safe.address, 0n, encodeFunctionData({ abi: safeAbi, functionName: "setGuard", args: ["0x0000000000000000000000000000000000000000"] }), 0] }));
  await rejects("module bypass", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransactionFromModule", args: [receiver.address, 0n, callData, 0] }));

  const wrongCodeAuth = authorization({ permitId: `0x${"08".repeat(32)}`, intentId: `0x${"28".repeat(32)}`, safeNonce: 1n, targetCodeHash: `0x${"aa".repeat(32)}` });
  await register(wrongCodeAuth);
  await rejects("code hash mismatch", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [receiver.address, 0n, callData, 0] }));
  const wrongValueAuth = authorization({ permitId: `0x${"09".repeat(32)}`, intentId: `0x${"29".repeat(32)}`, safeNonce: 1n, value: 1n });
  await register(wrongValueAuth);
  await rejects("native value mismatch", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [receiver.address, 0n, callData, 0] }));
  const wrongNonceAuth = authorization({ permitId: `0x${"1a".repeat(32)}`, intentId: `0x${"3a".repeat(32)}`, safeNonce: 2n });
  await register(wrongNonceAuth);
  await rejects("wrong Safe nonce", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [receiver.address, 0n, callData, 0] }));
  const proxyAuth = authorization({ permitId: `0x${"0b".repeat(32)}`, intentId: `0x${"2b".repeat(32)}`, safeNonce: 1n, implementationAddress: receiver.address, implementationCodeHash: keccak256(receiverCode) });
  await rejects("proxy identity cannot be verified by generic guard", () => register(proxyAuth));
  await rejects("expired authorization", () => register(authorization({ permitId: `0x${"0a".repeat(32)}`, intentId: `0x${"2a".repeat(32)}`, safeNonce: 1n, expiresAt: 1n })));
  await rejects("expired execution deadline", () => register(authorization({ permitId: `0x${"19".repeat(32)}`, intentId: `0x${"39".repeat(32)}`, safeNonce: 1n, executionDeadline: 1n })));
  await rejects("incorrect attestation signer", () => registerAs(authorization({ permitId: `0x${"0c".repeat(32)}`, intentId: `0x${"2c".repeat(32)}`, safeNonce: 1n }), owner));
  await rejects("incorrect chain binding", () => register(authorization({ permitId: `0x${"0d".repeat(32)}`, intentId: `0x${"2d".repeat(32)}`, targetChainId: 31338n, safeNonce: 1n })));
  await rejects("incorrect Safe binding", () => register(authorization({ permitId: `0x${"0e".repeat(32)}`, intentId: `0x${"2e".repeat(32)}`, safe: receiver.address, safeNonce: 1n })));

  const removalCall = encodeFunctionData({ abi: safeAbi, functionName: "setGuard", args: ["0x0000000000000000000000000000000000000000"] });
  await rejects("unauthorized guard removal", () => send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [safe.address, 0n, removalCall, 0] }));
  const safeCode = await publicClient.getBytecode({ address: safe.address });
  const removalAuthorization = authorization({ permitId: `0x${"1b".repeat(32)}`, intentId: `0x${"3b".repeat(32)}`, safeNonce: 1n, to: safe.address, dataHash: keccak256(removalCall), targetCodeHash: keccak256(safeCode ?? "0x") });
  await register(removalAuthorization);
  await send(ownerWallet, { address: safe.address, abi: safeAbi, functionName: "execTransaction", args: [safe.address, 0n, removalCall, 0] });
  const removedGuard = await publicClient.readContract({ address: safe.address, abi: safeAbi, functionName: "guard" });
  if (removedGuard.toLowerCase() !== "0x0000000000000000000000000000000000000000") throw new Error("AUTHORIZED_GUARD_RECOVERY_FAILED");

  const evidence = { evidenceScope: "LOCAL_GANACHE_ONLY_NOT_PUBLIC_LIVE_ENFORCEMENT", checkedAt: new Date().toISOString(), status: "PASS", validExecution: true, nonceHookOrder: "Safe pre-increments nonce before checkTransaction; the Guard maps current nonce minus one to signed pre-execution nonce", guardOwnerTransferredToSafe: true, authorizedGuardRemoval: true, blocked: ["direct EOA guard administration after ownership transfer", "different calldata", "different target", "wrong Safe nonce", "replay", "duplicate intent registration", "unauthorized guard removal", "module bypass", "code hash mismatch", "native value mismatch", "proxy identity", "expired authorization", "expired execution deadline", "incorrect attestation signer", "incorrect chain binding", "incorrect Safe binding"], chainId: 31337, safe: safe.address, guard: guard.address, receiver: receiver.address };
  fs.mkdirSync("evidence/qualification/current", { recursive: true });
  fs.writeFileSync("evidence/qualification/current/safe_guard_local_harness.json", `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
  provider.disconnect?.();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
