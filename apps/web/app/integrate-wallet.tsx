"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, defineChain, encodeFunctionData, http, type Address, type Hex } from "viem";
import type { SafePermitAuthorization } from "@firewall/safe-enforcement";
import { FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256 } from "@firewall/genlayer-client/network-config";
import { CANONICAL_CHAIN_ID, CANONICAL_CONTRACT_ADDRESS, CANONICAL_RPC_URL, CANONICAL_SOURCE_SHA256, createCanonicalReader, type CanonicalLiveReadModel } from "@firewall/genlayer-client/canonical-reader";
import { connectFirewallStudionetWallet, listRecoverableStudionetWrites, resumeFirewallV2Write, submitFirewallV2Write, type Eip1193Provider, type FirewallV2WriteMethod, type RecoverableStudionetWrite, type StudionetWalletSession } from "@firewall/genlayer-client/studionet-workflow";

declare global {
  interface Window { ethereum?: Eip1193Provider }
}

const PROPOSAL_EXTERNAL_ID = "firewall-sepolia-safe-enforcement-qualification-v1";

type SepoliaPackageResponse = {
  readonly scope: "LOCAL_NORMALIZATION_ONLY_EXPECTED_FACTS";
  readonly available: boolean;
  readonly package: {
    readonly status: string;
    readonly sourceA: string;
    readonly sourceB: string;
    readonly facts: Record<string, unknown>;
  };
};

function stableJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", source));
}

function bytesHex(value: Uint8Array): string {
  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function loadCanonical(session: StudionetWalletSession): Promise<CanonicalLiveReadModel> {
  return createCanonicalReader({ contractAddress: CANONICAL_CONTRACT_ADDRESS, chainId: CANONICAL_CHAIN_ID, rpcUrl: CANONICAL_RPC_URL, expectedSourceSha256: CANONICAL_SOURCE_SHA256 }, session.client).read();
}

function canonicalPostcondition(method: FirewallV2WriteMethod, model: CanonicalLiveReadModel): boolean {
  const mandate = model.mandates.find((item) => item.proposalExternalId === PROPOSAL_EXTERNAL_ID);
  const execution = mandate && model.executions.find((item) => item.mandateId === mandate.mandateId);
  const adjudication = execution && model.adjudications.find((item) => item.executionId === execution.executionId);
  if (method === "create_mandate") return !!mandate;
  if (method === "freeze_mandate") return mandate?.state === "MANDATE_FROZEN";
  if (method === "commit_execution") return execution?.state === "EXECUTION_COMMITTED";
  if (method === "authenticate_evidence") return execution?.evidenceStatus === "VERIFIED_POST_EXECUTION";
  if (method === "adjudicate_execution") return !!adjudication;
  return !!execution && model.permits.some((permit) => permit.executionId === execution.executionId);
}

function stageFor(model: CanonicalLiveReadModel | null): { method: FirewallV2WriteMethod | null; label: string; detail: string } {
  if (!model) return { method: null, label: "READ CANONICAL STATE", detail: "Connect the wallet and verify the pinned Studionet contract first." };
  const mandate = model.mandates.find((item) => item.proposalExternalId === PROPOSAL_EXTERNAL_ID);
  if (!mandate) return { method: "create_mandate", label: "CREATE HISTORICAL EVIDENCE MANDATE", detail: "Creates the frozen-scope record. This mandate explicitly does not authorize the historical or any future EVM transaction." };
  if (mandate.state === "MANDATE_DRAFT") return { method: "freeze_mandate", label: "FREEZE MANDATE", detail: `Freeze ${mandate.mandateId} before committing expected execution facts.` };
  const execution = model.executions.find((item) => item.mandateId === mandate.mandateId);
  if (!execution) return { method: "commit_execution", label: "COMMIT EXPECTED FACTS", detail: "Commits the normalized local package as an expectation only; GenLayer validators must independently retrieve both providers." };
  if (execution.state === "EXECUTION_COMMITTED") return { method: "authenticate_evidence", label: "AUTHENTICATE EVIDENCE IN CONSENSUS", detail: "Validators must independently retrieve Blockscout and Routescan inside strict equality consensus." };
  if (execution.state === "EVIDENCE_VERIFIED") return { method: "adjudicate_execution", label: "ADJUDICATE AUTHENTICATED FACTS", detail: "Requires finalized evidence authentication before semantic adjudication." };
  const adjudication = model.adjudications.find((item) => item.executionId === execution.executionId);
  if (adjudication?.verdict === "EXECUTION_PERMITTED" && !model.permits.some((item) => item.executionId === execution.executionId)) return { method: "issue_permit", label: "ISSUE CANONICAL PERMIT", detail: "Issue the separate permit only after authenticating the Sepolia execution and adjudicating the frozen exact-call scope. The relay binds it to this Safe, target, value, calldata, nonce and expiry." };
  if (adjudication?.verdict === "EXECUTION_PERMITTED") return { method: null, label: "CANONICAL PERMIT RECORDED", detail: `Permit status: ${model.permitStatuses[model.permits.find((item) => item.executionId === execution.executionId)?.permitId ?? ""] ?? "UNKNOWN"}. This is not proof of Guard installation or protected future execution.` };
  if (adjudication) return { method: null, label: adjudication.verdict, detail: "The canonical adjudication did not permit this package; no permit write is available." };
  return { method: null, label: execution.state, detail: "Refresh and reconcile the canonical record before continuing." };
}

export function StudionetWalletPanel() {
  const [status, setStatus] = useState("NOT_CONNECTED");
  const [address, setAddress] = useState<string | null>(null);
  const [session, setSession] = useState<StudionetWalletSession | null>(null);
  const [model, setModel] = useState<CanonicalLiveReadModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [recoverableWrite, setRecoverableWrite] = useState<RecoverableStudionetWrite | null>(null);
  const next = useMemo(() => stageFor(model), [model]);

  async function connect() {
    setStatus("CONNECTING_WALLET");
    setError(null);
    try {
      if (!window.ethereum) throw new Error("INJECTED_WALLET_NOT_FOUND");
      const connected = await connectFirewallStudionetWallet(window.ethereum);
      const canonical = await loadCanonical(connected);
      setSession(connected);
      setAddress(connected.address);
      setModel(canonical);
      setRecoverableWrite(listRecoverableStudionetWrites(connected.address)[0] ?? null);
      setStatus("STUDIONET_V2_CANONICAL_READ_READY");
    } catch (failure) {
      setStatus("WALLET_OR_CANONICAL_READ_FAILED");
      setError(failure instanceof Error ? failure.message : "WALLET_CONNECTION_FAILED");
    }
  }

  async function refresh() {
    if (!session) return;
    setStatus("REFRESHING_CANONICAL_STATE");
    try {
      setModel(await loadCanonical(session));
      setRecoverableWrite(listRecoverableStudionetWrites(session.address)[0] ?? null);
      setStatus("STUDIONET_V2_CANONICAL_READ_READY");
    } catch (failure) {
      setStatus("CANONICAL_REFRESH_FAILED");
      setError(failure instanceof Error ? failure.message : "CANONICAL_REFRESH_FAILED");
    }
  }

  async function runNextStep() {
    if (!session || !next.method || recoverableWrite) return;
    setStatus(`PREFLIGHT_${next.method.toUpperCase()}`);
    setError(null);
    try {
      if (CANONICAL_SOURCE_SHA256 !== FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256) throw new Error("SEPOLIA_CANDIDATE_CONTRACT_REQUIRED_BEFORE_QUALIFICATION_WRITES");
      const current = await loadCanonical(session);
      setModel(current);
      const step = stageFor(current);
      if (!step.method) throw new Error("NO_CANONICAL_WRITE_STEP_AVAILABLE");
      const packageResponse = await fetch("/api/qualification/sepolia-package", { cache: "no-store" });
      if (!packageResponse.ok) throw new Error("SEPOLIA_CANARY_EVIDENCE_PACKAGE_UNAVAILABLE");
      const qualification = await packageResponse.json() as SepoliaPackageResponse;
      if (qualification.scope !== "LOCAL_NORMALIZATION_ONLY_EXPECTED_FACTS" || !qualification.available || qualification.package.status !== "LOCAL_FACTS_MATCHED") throw new Error("SEPOLIA_EXPECTED_FACTS_PACKAGE_SCOPE_INVALID");
      const facts = qualification.package.facts;
      let sourceA: Record<string, unknown>;
      let sourceB: Record<string, unknown>;
      try { sourceA = JSON.parse(qualification.package.sourceA) as Record<string, unknown>; sourceB = JSON.parse(qualification.package.sourceB) as Record<string, unknown>; } catch { throw new Error("SEPOLIA_PROVIDER_CONFIGURATION_INVALID"); }
      const safeAddress = facts.governance_contract;
      const transactionHash = facts.transaction_hash;
      if (Number(facts.chain_id) !== 11155111 || typeof safeAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(safeAddress) || typeof transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash) || typeof sourceA.transaction !== "string" || typeof sourceB.transaction !== "string" || sourceA.transaction === sourceB.transaction || !Array.isArray(facts.targets) || facts.targets.length !== 1 || !Array.isArray(facts.values) || facts.values.length !== 1 || !Array.isArray(facts.calldatas) || facts.calldatas.length !== 1 || !Array.isArray(facts.operations) || facts.operations.length !== 1) throw new Error("SEPOLIA_EXPECTED_FACTS_INVALID");
      const proposalText = [
        "Firewall Ethereum Sepolia Safe Guard enforcement qualification.",
        `Independently verify successful SafeL2 direct CALL execution by Safe ${safeAddress} on chain 11155111 in transaction ${transactionHash}.`,
        `The frozen objective is to confirm the successful receipt and exact Safe call to ${String(facts.targets[0])}, value ${String(facts.values[0])} wei, calldata ${String(facts.calldatas[0])}, operation ${String(facts.operations[0])}, block identity, and SafeL2 implementation recorded in the independently retrieved provider evidence.`,
        "This prior execution is evidence only and grants no authority by itself. Firewall may issue a permit only for a new Safe transaction bound to this same chain, Safe, target, value, calldata, operation, nonce, expiry, and adjudicated evidence.",
      ].join(" ");
      const proposalSource = sourceA.transaction;

      const mandate = current.mandates.find((item) => item.proposalExternalId === PROPOSAL_EXTERNAL_ID);
      const execution = mandate && current.executions.find((item) => item.mandateId === mandate.mandateId);
      const adjudication = execution && current.adjudications.find((item) => item.executionId === execution.executionId);
      let method: FirewallV2WriteMethod = step.method;
      let args: readonly unknown[];
      let operationKey: string;
      if (method === "create_mandate") {
        const proposalBytes = new TextEncoder().encode(proposalText);
        const proposalHash = await sha256(proposalBytes);
        const mandateDigest = await sha256(`FIREWALL_MANDATE_V2|11155111|${safeAddress}|${bytesHex(await sha256(proposalHash))}|1`);
        args = [11155111n, safeAddress, PROPOSAL_EXTERNAL_ID, proposalHash, proposalSource, proposalText, proposalHash, BigInt(proposalBytes.length), 1n, mandateDigest];
        operationKey = `mandate:${PROPOSAL_EXTERNAL_ID}`;
      } else if (method === "freeze_mandate") {
        if (!mandate) throw new Error("CANONICAL_MANDATE_NOT_FOUND");
        args = [mandate.mandateId];
        operationKey = `freeze:${mandate.mandateId}`;
      } else if (method === "commit_execution") {
        if (!mandate || mandate.state !== "MANDATE_FROZEN") throw new Error("CANONICAL_FROZEN_MANDATE_REQUIRED");
        const expectedFacts = stableJson({ ...qualification.package.facts, mandate_id: mandate.mandateId });
        args = [mandate.mandateId, 11155111n, expectedFacts];
        operationKey = `commit:${mandate.mandateId}:${qualification.package.facts.transaction_hash}`;
      } else if (method === "authenticate_evidence") {
        if (!execution) throw new Error("CANONICAL_EXECUTION_NOT_FOUND");
        args = [execution.executionId];
        operationKey = `authenticate:${execution.executionId}`;
      } else if (method === "adjudicate_execution") {
        if (!execution || execution.evidenceStatus !== "VERIFIED_POST_EXECUTION") throw new Error("CANONICAL_AUTHENTICATED_EVIDENCE_REQUIRED");
        args = [execution.executionId];
        operationKey = `adjudicate:${execution.executionId}`;
      } else {
        if (!execution || adjudication?.verdict !== "EXECUTION_PERMITTED") throw new Error("CANONICAL_PERMITTED_ADJUDICATION_REQUIRED");
        args = [execution.executionId, adjudication.adjudicationId];
        operationKey = `permit:${execution.executionId}:${adjudication.adjudicationId}`;
      }

      setStatus(`AWAITING_${method.toUpperCase()}_SIGNATURE`);
      const result = await submitFirewallV2Write({
        session,
        method,
        args,
        operationKey,
        canonicalPostcondition: async () => {
          const after = await loadCanonical(session);
          setModel(after);
          const newMandate = after.mandates.find((item) => item.proposalExternalId === PROPOSAL_EXTERNAL_ID);
          const newExecution = newMandate && after.executions.find((item) => item.mandateId === newMandate.mandateId);
          const newAdjudication = newExecution && after.adjudications.find((item) => item.executionId === newExecution.executionId);
          if (method === "create_mandate") return !!newMandate?.mandateId;
          if (method === "freeze_mandate") return newMandate?.state === "MANDATE_FROZEN";
          if (method === "commit_execution") return !!newExecution && newExecution.state === "EXECUTION_COMMITTED";
          if (method === "authenticate_evidence") return newExecution?.evidenceStatus === "VERIFIED_POST_EXECUTION";
          if (method === "adjudicate_execution") return !!newAdjudication;
          return !!newExecution && after.permits.some((permit) => permit.executionId === newExecution.executionId);
        },
      });
      setActivity(`${method}: finalized ${result.hash}; zero-fee preflight ${result.preflight.estimatedFeeWei} wei; canonical postcondition confirmed.`);
      await refresh();
    } catch (failure) {
      setStatus("WRITE_FAILED_OR_RECONCILIATION_REQUIRED");
      setError(failure instanceof Error ? failure.message : "WRITE_FAILED_RECONCILE_CANONICAL_STATE");
      await refresh();
    }
  }

  async function resumeSavedWrite() {
    if (!session || !recoverableWrite?.hash) return;
    setStatus("RESUMING_EXISTING_TRANSACTION");
    setError(null);
    try {
      const result = await resumeFirewallV2Write({
        session,
        operationKey: recoverableWrite.operationKey,
        canonicalPostcondition: async () => {
          const after = await loadCanonical(session);
          setModel(after);
          return canonicalPostcondition(recoverableWrite.method, after);
        },
      });
      setActivity(`${recoverableWrite.method}: resumed finalized transaction ${result.hash}; canonical postcondition confirmed.`);
      setRecoverableWrite(null);
      await refresh();
    } catch (failure) {
      setStatus("EXISTING_TRANSACTION_STILL_REQUIRES_RECONCILIATION");
      setError(failure instanceof Error ? failure.message : "EXISTING_TRANSACTION_RECONCILIATION_FAILED");
      await refresh();
    }
  }

  const counts = model ? `mandates ${model.mandates.length} · executions ${model.executions.length} · evidence ${model.evidence.length} · adjudications ${model.adjudications.length} · permits ${model.permits.length}` : "Canonical counts unavailable";

  const candidateSourcePinned = CANONICAL_SOURCE_SHA256 === FIREWALL_SEPOLIA_CANDIDATE_SOURCE_SHA256;
  return <div className="panel"><div className="panel-header"><h2>Studionet wallet and contract</h2><span className={`status ${status === "STUDIONET_V2_CANONICAL_READ_READY" ? "safe" : "pending"}`}>{status}</span></div><div className="panel-body"><p className="lede">Connect an injected wallet to GenLayer Studionet (chain 61999). Firewall verifies the pinned V2 source and schema before enabling writes.</p>{address && <p className="mono">Connected account: {address}</p>}{model && <><p className="mono">Canonical contract: {model.config.contractAddress} · as of {model.asOf}</p><p className="footer-note">{counts}</p></>}{recoverableWrite && <div className="callout">Saved {recoverableWrite.method} operation: {recoverableWrite.stage}{recoverableWrite.hash ? ` · ${recoverableWrite.hash}` : " · no hash was captured; do not retry until reconciled"}{recoverableWrite.hash && <div className="button-row"><button className="button" onClick={resumeSavedWrite} disabled={status === "RESUMING_EXISTING_TRANSACTION"}>Resume this transaction</button></div>}</div>}{error && <p className="callout">{error}. Refresh canonical state and reconcile any pending operation before retrying.</p>}{activity && <p className="callout">{activity}</p>}<p className="footer-note">Local provider normalization is only an expected-facts preflight. GenLayer validators independently retrieve both provider URLs; only the resulting canonical adjudication can issue the separately bound Sepolia permit.</p><div className="button-row"><button className="button" onClick={connect} disabled={status === "CONNECTING_WALLET"}>{address ? "Reconnect and verify" : "Connect GenLayer wallet"}</button><button className="button secondary" onClick={refresh} disabled={!session || status === "REFRESHING_CANONICAL_STATE"}>Refresh canonical state</button></div>{session && model && <div className="panel" style={{ marginTop: 18 }}><div className="panel-header"><h3>Next canonical workflow operation</h3><span className="status pending">{next.method ?? "READ ONLY"}</span></div><div className="panel-body"><p>{next.detail}</p>{!candidateSourcePinned && <p className="callout">Qualification writes require the separately verified Sepolia candidate source SHA. Canonical reads remain available.</p>}<button className="button" onClick={runNextStep} disabled={!next.method || !candidateSourcePinned || !!recoverableWrite || status.startsWith("AWAITING_") || status.startsWith("PREFLIGHT_")}>{recoverableWrite ? "RECONCILE SAVED OPERATION FIRST" : next.label}</button><p className="footer-note">Every write checks the latest canonical precondition, persists the outer submission hash immediately, waits for actual finality without a short timeout, requires successful execution, and verifies canonical postconditions. Do not rebroadcast an uncertain operation.</p></div></div>}</div></div>;
}

type RelayStatus = {
  readonly state: string;
  readonly configured?: boolean;
  readonly chainId?: number;
  readonly safe?: string;
  readonly safeOwners?: readonly string[];
  readonly safeThreshold?: string;
  readonly safeOwnershipVerified?: boolean;
  readonly guard?: string;
  readonly guardOwner?: string;
  readonly guardAdminTransferredToSafe?: boolean;
  readonly guardInstalledOnSafe?: boolean;
  readonly modulePathDisabled?: boolean;
  readonly relayAuthorized?: boolean;
  readonly relaySigner?: string;
  readonly relaySignerIsSafeOwner?: boolean;
  readonly canonicalPermitCount?: number | null;
  readonly canonicalRecords?: {
    readonly chainId: number;
    readonly contract: Address;
    readonly sourceSha256: string;
    readonly mandate: { readonly id: string; readonly state: string } | null;
    readonly intent: { readonly id: Hex; readonly state: string; readonly chainId: number; readonly safe: Address; readonly safeNonce: number; readonly target: Address; readonly value: string; readonly operation: number } | null;
    readonly evidence: { readonly providers: readonly string[]; readonly snapshotBlock: number | null; readonly evidenceHash: Hex; readonly futureReceiptClaimed: boolean } | null;
    readonly adjudication: { readonly id: string; readonly intentId: string; readonly verdict: string; readonly evidenceSufficient: boolean } | null;
    readonly permit: { readonly id: string; readonly intentId: string; readonly status: string; readonly expiresAt: number } | null;
  };
  readonly prospectiveExecutionSupported: boolean;
  readonly prospectiveCall?: { readonly permitId: string; readonly to: Address; readonly value: string; readonly data: Hex; readonly operation: 0 } | null;
  readonly reason: string;
  readonly missing?: readonly string[];
};

type RelayAttestation = {
  readonly safe: Address;
  readonly guard: Address;
  readonly canonicalPermitId: string;
  readonly safeNonce: string;
  readonly authorizationJson: Record<string, unknown>;
  readonly relaySignature: Hex;
  readonly expiresAt: string;
};

type EnforcementJournal = {
  readonly version: 2;
  readonly stage: string;
  readonly safe: Address;
  readonly guard: Address;
  readonly owner: Address;
  readonly call: NonNullable<RelayStatus["prospectiveCall"]>;
  readonly authorizationJson?: Record<string, unknown>;
  readonly relaySignature?: Hex;
  readonly registrationTx?: Hex;
  readonly authorizedExecutionTx?: Hex;
  readonly unauthorizedExecutionTx?: Hex;
  readonly lastError?: string;
  readonly registrationReceipt?: { readonly hash: Hex; readonly status: "success" | "reverted"; readonly blockNumber: string; readonly gasUsed: string; readonly effectiveGasPrice: string; readonly feeWei: string };
  readonly authorizedReceipt?: { readonly hash: Hex; readonly status: "success" | "reverted"; readonly blockNumber: string; readonly gasUsed: string; readonly effectiveGasPrice: string };
  readonly unauthorizedReceipt?: { readonly hash: Hex; readonly status: "success" | "reverted"; readonly blockNumber: string; readonly gasUsed: string; readonly effectiveGasPrice: string };
};

const EVM_CHAIN_ID = 11155111;
const EVM_RPC = "https://sepolia.drpc.org";
const EVM_EXPLORER = "https://sepolia.etherscan.io/tx/";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const JOURNAL_KEY = "firewall.safe-enforcement.ethereum-sepolia.v3";
const ethereumSepolia = defineChain({ id: EVM_CHAIN_ID, name: "Ethereum Sepolia", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [EVM_RPC] } }, blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } } });
const evmPublicClient = createPublicClient({ chain: ethereumSepolia, transport: http(EVM_RPC) });
const authorizationComponents = [
  { name: "permitId", type: "bytes32" }, { name: "intentId", type: "bytes32" }, { name: "mandateId", type: "bytes32" }, { name: "executionId", type: "bytes32" }, { name: "proposalHash", type: "bytes32" }, { name: "executionBundleHash", type: "bytes32" },
  { name: "targetChainId", type: "uint256" }, { name: "safe", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "dataHash", type: "bytes32" },
  { name: "operation", type: "uint8" }, { name: "safeNonce", type: "uint256" }, { name: "targetsDigest", type: "bytes32" }, { name: "valuesDigest", type: "bytes32" }, { name: "calldataDigest", type: "bytes32" },
  { name: "codeFactsDigest", type: "bytes32" }, { name: "implementationFactsDigest", type: "bytes32" }, { name: "targetCodeHash", type: "bytes32" }, { name: "implementationAddress", type: "address" }, { name: "implementationCodeHash", type: "bytes32" },
  { name: "batchStructureHash", type: "bytes32" }, { name: "adjudicationId", type: "bytes32" }, { name: "adjudicationGeneration", type: "uint256" }, { name: "executionDeadline", type: "uint256" }, { name: "expiresAt", type: "uint256" }, { name: "canonicalPermitHash", type: "bytes32" },
] as const;
const guardWriteAbi = [{ type: "function", name: "registerAuthorization", stateMutability: "nonpayable", inputs: [{ name: "authorization", type: "tuple", components: authorizationComponents }, { name: "signature", type: "bytes" }], outputs: [] }] as const;
const safeWriteAbi = [{
  type: "function", name: "execTransaction", stateMutability: "payable",
  inputs: [
    { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "signatures", type: "bytes" },
  ], outputs: [{ type: "bool" }],
}] as const;
const safeTxTypes = { SafeTx: [
  { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" },
  { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" },
] } as const;
const safeExecutionSuccessTopic = "0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e";
const guardConsumedAbi = [{ type: "function", name: "consumed", stateMutability: "view", inputs: [{ name: "permitId", type: "bytes32" }], outputs: [{ type: "bool" }] }] as const;
const guardPermitReadAbi = [
  { type: "function", name: "permitRegistered", stateMutability: "view", inputs: [{ name: "permitId", type: "bytes32" }], outputs: [{ type: "bool" }] },
  ...guardConsumedAbi,
] as const;

function safeTransactionData(call: { to: Address; value: string; data: Hex; nonce: bigint }, signature: Hex): Hex {
  return encodeFunctionData({ abi: safeWriteAbi, functionName: "execTransaction", args: [call.to, BigInt(call.value), call.data, 0, 0n, 0n, 0n, ZERO_ADDRESS, ZERO_ADDRESS, signature] });
}

function safeTypedData(safe: Address, call: { to: Address; value: string; data: Hex; nonce: bigint }) {
  return {
    domain: { chainId: EVM_CHAIN_ID, verifyingContract: safe },
    types: safeTxTypes,
    primaryType: "SafeTx" as const,
    message: { to: call.to, value: BigInt(call.value), data: call.data, operation: 0, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: ZERO_ADDRESS, refundReceiver: ZERO_ADDRESS, nonce: call.nonce },
  };
}

function delay(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitForFinalizedEvmReceipt(hash: Hex, onReceipt: (receipt: Awaited<ReturnType<typeof evmPublicClient.getTransactionReceipt>>) => void): Promise<Awaited<ReturnType<typeof evmPublicClient.getTransactionReceipt>>> {
  for (;;) {
    try {
      const receipt = await evmPublicClient.getTransactionReceipt({ hash });
      const finalized = await evmPublicClient.getBlock({ blockTag: "finalized" });
      onReceipt(receipt);
      if (finalized.number !== null && finalized.number >= receipt.blockNumber) return receipt;
    } catch { /* keep tracking the same hash through RPC gaps */ }
    await delay(4000);
  }
}

function isWalletRejection(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 4001;
}

function authorizationForAbi(input: Record<string, unknown>): SafePermitAuthorization {
  const result = { ...input };
  for (const key of ["targetChainId", "value", "safeNonce", "adjudicationGeneration", "executionDeadline", "expiresAt"]) {
    if (typeof result[key] !== "string" || !/^\d+$/.test(result[key] as string)) throw new Error(`RELAY_AUTHORIZATION_INVALID:${key}`);
    result[key] = BigInt(result[key] as string);
  }
  for (const key of ["safe", "to", "implementationAddress"]) if (typeof result[key] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(result[key] as string)) throw new Error(`RELAY_AUTHORIZATION_INVALID:${key}`);
  for (const key of ["permitId", "intentId", "mandateId", "executionId", "proposalHash", "executionBundleHash", "dataHash", "targetsDigest", "valuesDigest", "calldataDigest", "codeFactsDigest", "implementationFactsDigest", "targetCodeHash", "implementationCodeHash", "batchStructureHash", "adjudicationId", "canonicalPermitHash"]) if (typeof result[key] !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result[key] as string)) throw new Error(`RELAY_AUTHORIZATION_INVALID:${key}`);
  if (result.operation !== 0 && result.operation !== 1) throw new Error("RELAY_AUTHORIZATION_INVALID:operation");
  return result as unknown as SafePermitAuthorization;
}


function receiptSummary(receipt: Awaited<ReturnType<typeof evmPublicClient.getTransactionReceipt>>) {
  return { hash: receipt.transactionHash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), feeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString() };
}

const safeNonceAbi = [{ type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;

export function RelayEnforcementStatus() {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [journal, setJournal] = useState<EnforcementJournal | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);

  function save(next: EnforcementJournal) {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
    setJournal(next);
  }

  function patchJournal(patch: Partial<EnforcementJournal>) {
    try {
      const raw = window.localStorage.getItem(JOURNAL_KEY);
      if (raw) {
        const current = JSON.parse(raw) as EnforcementJournal;
        save({ ...current, ...patch });
        return;
      }
    } catch { /* preserve the in-memory state if local parsing fails */ }
    if (journal) save({ ...journal, ...patch });
  }

  function ownerWallet(onSubmitted: (hash: Hex) => void) {
    if (!window.ethereum) throw new Error("INJECTED_EVM_WALLET_NOT_FOUND");
    const provider: Eip1193Provider = {
      async request(input) {
        const result = await window.ethereum!.request(input);
        if ((input.method === "eth_sendTransaction" || input.method === "eth_sendRawTransaction") && typeof result === "string" && /^0x[0-9a-f]{64}$/i.test(result)) onSubmitted(result as Hex);
        return result;
      },
    };
    return createWalletClient({ chain: ethereumSepolia, transport: custom(provider as Parameters<typeof custom>[0]) });
  }

  async function ensureOwnerWallet(onSubmitted: (hash: Hex) => void) {
    if (!window.ethereum) throw new Error("INJECTED_EVM_WALLET_NOT_FOUND");
    const provider = window.ethereum;
    const requested = await provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(requested) || !requested.some((item) => typeof item === "string" && /^0x[0-9a-fA-F]{40}$/.test(item))) throw new Error("EVM_WALLET_ACCOUNT_UNAVAILABLE");
    const chainId = await provider.request({ method: "eth_chainId" });
    if (typeof chainId !== "string") throw new Error("EVM_WALLET_CHAIN_UNAVAILABLE");
    if (Number.parseInt(chainId, 16) !== EVM_CHAIN_ID) {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      } catch (switchError) {
        const code = typeof switchError === "object" && switchError !== null && "code" in switchError ? (switchError as { code?: unknown }).code : undefined;
        if (code !== 4902) throw switchError;
        await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xaa36a7", chainName: "Ethereum Sepolia", nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [EVM_RPC], blockExplorerUrls: ["https://sepolia.etherscan.io"] }] });
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      }
    }
    const client = ownerWallet(onSubmitted);
    if (await client.getChainId() !== EVM_CHAIN_ID) throw new Error("EVM_WALLET_CHAIN_MISMATCH");
    const accounts = await client.getAddresses();
    if (!accounts.length) throw new Error("EVM_WALLET_ACCOUNT_UNAVAILABLE");
    return { client, accounts };
  }

  function requireSafeOwner(accounts: readonly Address[], selected?: EnforcementJournal) {
    const expected = selected?.owner ?? status?.safeOwners?.[0];
    if (!expected || !accounts.some((account) => account.toLowerCase() === expected.toLowerCase())) throw new Error("CONNECTED_WALLET_IS_NOT_THE_CONFIGURED_SAFE_OWNER");
    setWalletAddress(expected as Address);
    return expected as Address;
  }

  async function refresh() {
    setError(null);
    try {
      const response = await fetch("/api/prospective/relay", { method: "GET", cache: "no-store" });
      const result = await response.json() as RelayStatus;
      if (!response.ok || typeof result.state !== "string") throw new Error("LIVE_ENFORCEMENT_STATUS_UNAVAILABLE");
      setStatus(result);
    } catch (failure) {
      setStatus(null);
      setError(failure instanceof Error ? failure.message : "LIVE_ENFORCEMENT_STATUS_UNAVAILABLE");
    }
  }

  async function connectWallet() {
    setError(null);
    try {
      const { client, accounts } = await ensureOwnerWallet(() => undefined);
      const account = requireSafeOwner(accounts, journal ?? undefined);
      const balance = await evmPublicClient.getBalance({ address: account });
      setActivity("Connected Ethereum Sepolia Safe owner " + account + "; balance " + balance.toString() + " wei.");
      void client;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "EVM_WALLET_CONNECTION_FAILED"); }
  }

  async function requestCanonicalAttestation() {
    if (!status?.configured || !status.prospectiveCall || !status.safe || !status.guard) throw new Error("NO_CANONICAL_V3_PERMIT_CANDIDATE_READY_FOR_RELAY_CHECK");
    if (journal?.registrationTx || journal?.authorizedExecutionTx) throw new Error("EXISTING_ENFORCEMENT_TRANSACTION_MUST_BE_RECONCILED");
    const call = status.prospectiveCall;
    const response = await fetch("/api/prospective/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ permitId: call.permitId }), cache: "no-store" });
    const result = await response.json() as {
      readonly state?: string; readonly safe?: Address; readonly guard?: Address; readonly safeOwners?: readonly Address[];
      readonly safeOwnershipVerified?: boolean; readonly safeThreshold?: string; readonly canonicalGenLayer?: { readonly permitId?: string };
      readonly authorization?: Record<string, unknown>; readonly signature?: Hex; readonly error?: string;
      readonly guardInstalledOnSafe?: boolean; readonly guardAdminTransferredToSafe?: boolean; readonly modulePathDisabled?: boolean;
      readonly relayAuthorized?: boolean; readonly relaySigner?: Address; readonly relaySignerIsSafeOwner?: boolean;
    };
    if (!response.ok || !result.signature || !result.authorization || !result.safe || !result.guard || result.safe.toLowerCase() !== status.safe.toLowerCase() || result.guard.toLowerCase() !== status.guard.toLowerCase() || result.canonicalGenLayer?.permitId !== call.permitId || !result.safeOwners?.[0] || result.safeThreshold !== "1" || result.safeOwnershipVerified !== true || result.guardInstalledOnSafe !== true || result.guardAdminTransferredToSafe !== true || result.modulePathDisabled !== true || result.relayAuthorized !== true || !result.relaySigner || result.relaySignerIsSafeOwner !== false) throw new Error(result.error ?? "CANONICAL_RELAY_ATTESTATION_FAILED");
    setStatus({ ...status, state: result.state ?? "ATTESTATION_SIGNED", chainId: EVM_CHAIN_ID, safe: result.safe, guard: result.guard, safeOwners: result.safeOwners, safeThreshold: result.safeThreshold, safeOwnershipVerified: result.safeOwnershipVerified, guardInstalledOnSafe: result.guardInstalledOnSafe, guardAdminTransferredToSafe: result.guardAdminTransferredToSafe, modulePathDisabled: result.modulePathDisabled, relayAuthorized: result.relayAuthorized, relaySigner: result.relaySigner, relaySignerIsSafeOwner: result.relaySignerIsSafeOwner, prospectiveExecutionSupported: true, reason: "The relay signed only after a finalized canonical V3 permit and matching two-provider Ethereum Sepolia Safe and Guard checks." });
    save({ version: 2, stage: "ATTESTATION_READY", safe: result.safe, guard: result.guard, owner: result.safeOwners[0], call, authorizationJson: result.authorization, relaySignature: result.signature });
    setActivity("Distinct relay signer produced a call-specific signature for " + call.permitId + "; no EVM transaction was submitted.");
  }

  async function trackRegistration(selected: EnforcementJournal) {
    if (!selected.registrationTx || typeof selected.authorizationJson?.permitId !== "string") throw new Error("REGISTRATION_TRANSACTION_JOURNAL_INCOMPLETE");
    setActivity("Tracking existing registration " + selected.registrationTx + "; no rebroadcast will occur.");
    const receipt = await waitForFinalizedEvmReceipt(selected.registrationTx, (item) => patchJournal({ stage: "REGISTRATION_MINED_WAITING_FINALITY", registrationReceipt: receiptSummary(item) }));
    if (receipt.status !== "success") throw new Error("AUTHORIZATION_REGISTRATION_REVERTED:" + selected.registrationTx);
    const registered = await evmPublicClient.readContract({ address: selected.guard, abi: guardPermitReadAbi, functionName: "permitRegistered", args: [selected.authorizationJson.permitId as Hex] });
    if (!registered) throw new Error("FINALIZED_REGISTRATION_NOT_CANONICAL");
    patchJournal({ stage: "AUTHORIZATION_REGISTERED", registrationReceipt: receiptSummary(receipt) });
    setActivity("Guard registration finalized at block " + receipt.blockNumber.toString() + "; permitRegistered readback is true.");
  }

  async function registerAuthorization() {
    const selected = journal;
    if (!status || !selected?.authorizationJson || !selected.relaySignature) throw new Error("SIGNED_CANONICAL_AUTHORIZATION_REQUIRED");
    if (selected.registrationTx) return trackRegistration(selected);
    if (selected.stage === "REGISTRATION_SUBMISSION_UNKNOWN") throw new Error("REGISTRATION_HASH_UNKNOWN_RECONCILE_WALLET_NONCE_BEFORE_RETRY");
    const permitHash = selected.authorizationJson.permitId;
    if (typeof permitHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(permitHash)) throw new Error("GUARD_PERMIT_HASH_INVALID");
    if (await evmPublicClient.readContract({ address: selected.guard, abi: guardPermitReadAbi, functionName: "permitRegistered", args: [permitHash as Hex] })) throw new Error("GUARD_PERMIT_ALREADY_REGISTERED_RECONCILE_CANONICAL_STATE");
    save({ ...selected, stage: "REGISTRATION_AWAITING_WALLET" });
    setBusy(true);
    try {
      const { client, accounts } = await ensureOwnerWallet((hash) => patchJournal({ stage: "REGISTRATION_SUBMITTED", registrationTx: hash }));
      const owner = requireSafeOwner(accounts, selected);
      const hash = await client.writeContract({ account: owner, address: selected.guard, abi: guardWriteAbi, functionName: "registerAuthorization", args: [authorizationForAbi(selected.authorizationJson), selected.relaySignature] });
      patchJournal({ stage: "REGISTRATION_SUBMITTED", registrationTx: hash });
      await trackRegistration({ ...selected, registrationTx: hash });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "REGISTRATION_FAILED";
      const rejected = isWalletRejection(failure);
      const saved = (() => { try { return JSON.parse(window.localStorage.getItem(JOURNAL_KEY) ?? "null") as EnforcementJournal | null; } catch { return null; } })();
      if (rejected) patchJournal({ stage: "ATTESTATION_READY", lastError: message });
      else if (!saved?.registrationTx) patchJournal({ stage: "REGISTRATION_SUBMISSION_UNKNOWN", lastError: message });
      throw failure;
    } finally { setBusy(false); }
  }

  async function trackAuthorizedExecution(selected: EnforcementJournal) {
    if (!selected.authorizedExecutionTx || typeof selected.authorizationJson?.permitId !== "string") throw new Error("SAFE_EXECUTION_TRANSACTION_JOURNAL_INCOMPLETE");
    setActivity("Tracking existing Safe execution " + selected.authorizedExecutionTx + "; no rebroadcast will occur.");
    const receipt = await waitForFinalizedEvmReceipt(selected.authorizedExecutionTx, (item) => patchJournal({ stage: "AUTHORIZED_EXECUTION_MINED_WAITING_FINALITY", authorizedReceipt: receiptSummary(item) }));
    if (receipt.status !== "success" || !receipt.logs.some((log) => log.address.toLowerCase() === selected.safe.toLowerCase() && log.topics[0]?.toLowerCase() === safeExecutionSuccessTopic)) throw new Error("SAFE_EXECUTION_NOT_SUCCESSFULLY_FINALIZED:" + selected.authorizedExecutionTx);
    const consumed = await evmPublicClient.readContract({ address: selected.guard, abi: guardPermitReadAbi, functionName: "consumed", args: [selected.authorizationJson.permitId as Hex] });
    if (!consumed) throw new Error("FINALIZED_SAFE_EXECUTION_DID_NOT_CONSUME_PERMIT");
    patchJournal({ stage: "AUTHORIZED_EXECUTION_FINALIZED", authorizedReceipt: receiptSummary(receipt) });
    setActivity("Authorized Safe call finalized at block " + receipt.blockNumber.toString() + "; ExecutionSuccess exists and the Guard consumed the permit.");
  }

  async function executeAuthorizedCall() {
    const selected = journal;
    if (!status || !selected?.authorizationJson || !selected.relaySignature) throw new Error("REGISTERED_CANONICAL_AUTHORIZATION_REQUIRED");
    if (selected.authorizedExecutionTx) return trackAuthorizedExecution(selected);
    if (selected.stage === "AUTHORIZED_EXECUTION_SUBMISSION_UNKNOWN") throw new Error("SAFE_EXECUTION_HASH_UNKNOWN_RECONCILE_SAFE_NONCE_BEFORE_RETRY");
    if (selected.stage !== "AUTHORIZATION_REGISTERED") throw new Error("GUARD_REGISTRATION_MUST_FINALIZE_FIRST");
    const nonce = await evmPublicClient.readContract({ address: selected.safe, abi: safeNonceAbi, functionName: "nonce" });
    if (nonce !== BigInt(String(selected.authorizationJson.safeNonce))) throw new Error("SAFE_NONCE_CHANGED_REBUILD_CANONICAL_ATTESTATION");
    if (BigInt(String(selected.authorizationJson.expiresAt)) <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("RELAY_ATTESTATION_EXPIRED_REQUEST_FRESH_CANONICAL_AUTHORIZATION");
    if (!await evmPublicClient.readContract({ address: selected.guard, abi: guardPermitReadAbi, functionName: "permitRegistered", args: [selected.authorizationJson.permitId as Hex] })) throw new Error("CANONICAL_GUARD_REGISTRATION_NOT_FOUND");
    setBusy(true);
    try {
      const { client, accounts } = await ensureOwnerWallet((hash) => patchJournal({ stage: "AUTHORIZED_EXECUTION_SUBMITTED", authorizedExecutionTx: hash }));
      const owner = requireSafeOwner(accounts, selected);
      const signature = await client.signTypedData({ account: owner, ...safeTypedData(selected.safe, { ...selected.call, nonce }) });
      const hash = await client.writeContract({ account: owner, address: selected.safe, abi: safeWriteAbi, functionName: "execTransaction", args: [selected.call.to, BigInt(selected.call.value), selected.call.data, selected.call.operation, 0n, 0n, 0n, ZERO_ADDRESS, ZERO_ADDRESS, signature] });
      patchJournal({ stage: "AUTHORIZED_EXECUTION_SUBMITTED", authorizedExecutionTx: hash });
      await trackAuthorizedExecution({ ...selected, authorizedExecutionTx: hash });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "AUTHORIZED_EXECUTION_FAILED";
      const rejected = isWalletRejection(failure);
      const saved = (() => { try { return JSON.parse(window.localStorage.getItem(JOURNAL_KEY) ?? "null") as EnforcementJournal | null; } catch { return null; } })();
      if (rejected) patchJournal({ stage: "AUTHORIZATION_REGISTERED", lastError: message });
      else if (!saved?.authorizedExecutionTx) patchJournal({ stage: "AUTHORIZED_EXECUTION_SUBMISSION_UNKNOWN", lastError: message });
      throw failure;
    } finally { setBusy(false); }
  }

  async function trackUnauthorizedExecution(selected: EnforcementJournal) {
    if (!selected.unauthorizedExecutionTx) throw new Error("NO_UNAUTHORIZED_TRANSACTION_TO_RESUME");
    setActivity("Tracking existing altered Safe call " + selected.unauthorizedExecutionTx + "; no rebroadcast will occur.");
    const receipt = await waitForFinalizedEvmReceipt(selected.unauthorizedExecutionTx, (item) => patchJournal({ stage: "UNAUTHORIZED_EXECUTION_MINED_WAITING_FINALITY", unauthorizedReceipt: receiptSummary(item) }));
    if (receipt.status !== "reverted") throw new Error("UNAUTHORIZED_SAFE_EXECUTION_WAS_NOT_BLOCKED");
    patchJournal({ stage: "UNAUTHORIZED_EXECUTION_BLOCKED_FINALIZED", unauthorizedReceipt: receiptSummary(receipt) });
    setActivity("Wrong-target Safe call was rejected by the installed Guard in finalized block " + receipt.blockNumber.toString() + ".");
  }

  async function executeUnauthorizedCase() {
    const selected = journal;
    if (!status || !selected?.authorizedExecutionTx) throw new Error("SUCCESSFUL_AUTHORIZED_EXECUTION_REQUIRED_FIRST");
    if (selected.unauthorizedExecutionTx) return trackUnauthorizedExecution(selected);
    if (selected.stage === "UNAUTHORIZED_EXECUTION_SUBMISSION_UNKNOWN") throw new Error("UNAUTHORIZED_ATTEMPT_HASH_UNKNOWN_RECONCILE_SAFE_NONCE_BEFORE_RETRY");
    if (selected.stage !== "AUTHORIZED_EXECUTION_FINALIZED") throw new Error("SUCCESSFUL_AUTHORIZED_EXECUTION_REQUIRED_FIRST");
    save({ ...selected, stage: "UNAUTHORIZED_EXECUTION_AWAITING_WALLET" });
    setBusy(true);
    try {
      const { client, accounts } = await ensureOwnerWallet((hash) => patchJournal({ stage: "UNAUTHORIZED_EXECUTION_SUBMITTED", unauthorizedExecutionTx: hash }));
      const owner = requireSafeOwner(accounts, selected);
      const nonce = await evmPublicClient.readContract({ address: selected.safe, abi: safeNonceAbi, functionName: "nonce" });
      const alternateTarget = (selected.call.to.toLowerCase() === "0x000000000000000000000000000000000000dead" ? "0x000000000000000000000000000000000000bEEF" : "0x000000000000000000000000000000000000dEaD") as Address;
      const wrongCall = { ...selected.call, to: alternateTarget, value: "0", data: "0x" as Hex };
      const signature = await client.signTypedData({ account: owner, ...safeTypedData(selected.safe, { ...wrongCall, nonce }) });
      const data = safeTransactionData({ ...wrongCall, nonce }, signature);
      const hash = await client.sendTransaction({ account: owner, to: selected.safe, data, value: 0n, gas: 500_000n });
      patchJournal({ stage: "UNAUTHORIZED_EXECUTION_SUBMITTED", unauthorizedExecutionTx: hash });
      await trackUnauthorizedExecution({ ...selected, unauthorizedExecutionTx: hash });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "UNAUTHORIZED_EXECUTION_TEST_FAILED";
      const rejected = isWalletRejection(failure);
      const saved = (() => { try { return JSON.parse(window.localStorage.getItem(JOURNAL_KEY) ?? "null") as EnforcementJournal | null; } catch { return null; } })();
      if (rejected) patchJournal({ stage: "AUTHORIZED_EXECUTION_FINALIZED", lastError: message });
      else if (!saved?.unauthorizedExecutionTx) patchJournal({ stage: "UNAUTHORIZED_EXECUTION_SUBMISSION_UNKNOWN", lastError: message });
      throw failure;
    } finally { setBusy(false); }
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "ENFORCEMENT_ACTION_FAILED"); }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(JOURNAL_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as EnforcementJournal;
        if (parsed.version === 2 && /^0x[0-9a-fA-F]{40}$/.test(parsed.safe) && /^0x[0-9a-fA-F]{40}$/.test(parsed.guard)) setJournal(parsed);
      }
    } catch { setError("SAVED_ENFORCEMENT_JOURNAL_INVALID"); }
    void refresh();
  }, []);

  const owner = (status?.safeOwners?.[0] ?? journal?.owner)?.toLowerCase();
  const connectedOwner = !!walletAddress && !!owner && walletAddress.toLowerCase() === owner;
  const statusLabel = status?.state ?? (error ? "STATUS_UNAVAILABLE" : "CHECKING_LIVE_STATE");
  const registrationFee = journal?.registrationReceipt?.feeWei ?? "0";
  const authorizedFee = journal?.authorizedReceipt ? (BigInt(journal.authorizedReceipt.gasUsed) * BigInt(journal.authorizedReceipt.effectiveGasPrice)).toString() : "0";
  const unauthorizedFee = journal?.unauthorizedReceipt ? (BigInt(journal.unauthorizedReceipt.gasUsed) * BigInt(journal.unauthorizedReceipt.effectiveGasPrice)).toString() : "0";
  const totalFeeWei = (BigInt(registrationFee) + BigInt(authorizedFee) + BigInt(unauthorizedFee)).toString();

  return <div className="panel"><div className="panel-header"><h2>Protected EVM enforcement</h2><span className={"status " + (status?.prospectiveExecutionSupported ? "safe" : statusLabel.includes("HISTORICAL_ONLY") ? "pending" : "inconclusive")}>{statusLabel}</span></div><div className="panel-body">
    <p className="lede">A distinct server relay signs only after live canonical permit checks. The Safe owner signs the EVM transactions locally. Submitted hashes are persisted before finality tracking begins.</p>
    {status?.chainId !== undefined && <p className="mono">Chain {status.chainId} ? Safe {status.safe} ? Guard {status.guard}</p>}
    {status && <><p>{status.reason}</p>{status.canonicalRecords && <div className="callout"><strong>Studionet V3 prospective authorization state</strong><p><a href={`https://explorer-studio.genlayer.com/address/${status.canonicalRecords.contract}`} target="_blank" rel="noreferrer">Contract {status.canonicalRecords.contract}</a> · source SHA256 {status.canonicalRecords.sourceSha256}</p><p className="mono">Mandate {status.canonicalRecords.mandate?.id ?? "none"} · {status.canonicalRecords.mandate?.state ?? "NOT CREATED"}</p><p className="mono">Intent {status.canonicalRecords.intent?.id ?? "none"} · {status.canonicalRecords.intent?.state ?? "NOT COMMITTED"} · EVM chain {status.canonicalRecords.intent?.chainId ?? "—"} · Safe nonce {status.canonicalRecords.intent?.safeNonce ?? "—"}</p>{status.canonicalRecords.evidence && <p>Independent pre-execution facts: {status.canonicalRecords.evidence.providers.join(" + ")} · block {status.canonicalRecords.evidence.snapshotBlock ?? "unknown"} · evidence {status.canonicalRecords.evidence.evidenceHash} · future receipt claimed {String(status.canonicalRecords.evidence.futureReceiptClaimed)}</p>}<p className="mono">Adjudication {status.canonicalRecords.adjudication?.id ?? "none"} · {status.canonicalRecords.adjudication?.verdict ?? "NOT ADJUDICATED"} · evidence sufficient {String(status.canonicalRecords.adjudication?.evidenceSufficient ?? false)}</p><p className="mono">Prospective permit {status.canonicalRecords.permit?.id ?? "none"} · {status.canonicalRecords.permit?.status ?? "NOT ISSUED"}</p></div>}{status.safeOwners && <p className="mono">Owners {status.safeOwners.join(", ")} · threshold {status.safeThreshold} · owner match {String(status.safeOwnershipVerified)}</p>}<p className="footer-note">Guard installed: {String(status.guardInstalledOnSafe ?? false)} · Safe owns Guard: {String(status.guardAdminTransferredToSafe ?? false)} · modules disabled: {String(status.modulePathDisabled ?? false)} · distinct relay authorized: {String(status.relayAuthorized ?? false)} · relay is Safe owner: {String(status.relaySignerIsSafeOwner ?? false)} · prospective execution: {String(status.prospectiveExecutionSupported)}</p>{status.missing?.length ? <p className="footer-note">Configuration missing: {status.missing.join(", ")}</p> : null}</>}
    {walletAddress && <p className="mono">Connected Ethereum Sepolia wallet: {walletAddress} ? Safe owner matched: {String(connectedOwner)}</p>}
    {journal && <div className="callout"><strong>Persistent transaction journal: {journal.stage}</strong><p className="mono">Safe {journal.safe} ? Guard {journal.guard} ? permit {journal.call.permitId} ? call {journal.call.to} / {journal.call.value} wei / {journal.call.data}</p>{journal.registrationTx && <p>Guard registration: <a href={EVM_EXPLORER + journal.registrationTx} target="_blank" rel="noreferrer">{journal.registrationTx}</a>{journal.registrationReceipt && " ? fee " + journal.registrationReceipt.feeWei + " wei ? block " + journal.registrationReceipt.blockNumber}</p>}{journal.authorizedExecutionTx && <p>Authorized execution: <a href={EVM_EXPLORER + journal.authorizedExecutionTx} target="_blank" rel="noreferrer">{journal.authorizedExecutionTx}</a>{journal.authorizedReceipt && " ? fee " + authorizedFee + " wei ? block " + journal.authorizedReceipt.blockNumber}</p>}{journal.unauthorizedExecutionTx && <p>Blocked attempt: <a href={EVM_EXPLORER + journal.unauthorizedExecutionTx} target="_blank" rel="noreferrer">{journal.unauthorizedExecutionTx}</a>{journal.unauthorizedReceipt && " ? fee " + unauthorizedFee + " wei ? block " + journal.unauthorizedReceipt.blockNumber}</p>}<p>Recorded total EVM fees: {totalFeeWei} wei.</p>{journal.lastError && <p className="footer-note">Recovery status: {journal.lastError}</p>}</div>}
    {error && <p className="callout">{error}</p>}{activity && <p className="callout">{activity}</p>}
    <div className="button-row"><button className="button secondary" onClick={() => void run(connectWallet)}>Connect Ethereum Sepolia Safe owner wallet</button><button className="button secondary" onClick={() => void refresh()} disabled={busy}>Refresh live enforcement status</button></div>
    {status?.configured && status.prospectiveCall && <div className="button-row"><button className="button" onClick={() => void run(requestCanonicalAttestation)} disabled={busy || !!journal?.authorizationJson || !!journal?.registrationTx || !!journal?.authorizedExecutionTx}>Verify canonical permit and obtain relay signature</button></div>}
    {journal?.authorizationJson && journal.relaySignature && !journal.registrationTx && <div className="button-row"><button className="button" onClick={() => void run(registerAuthorization)} disabled={busy || !connectedOwner || journal.stage === "REGISTRATION_SUBMISSION_UNKNOWN"}>Register permit on Guard</button></div>}
    {journal?.registrationTx && journal.stage !== "AUTHORIZATION_REGISTERED" && !journal.authorizedExecutionTx && <div className="button-row"><button className="button" onClick={() => void run(() => trackRegistration(journal))} disabled={busy}>Resume existing Guard registration</button></div>}
    {journal?.stage === "AUTHORIZATION_REGISTERED" && !journal.authorizedExecutionTx && <div className="button-row"><button className="button" onClick={() => void run(executeAuthorizedCall)} disabled={busy || !connectedOwner}>Sign and execute authorized Safe call</button></div>}
    {journal?.authorizedExecutionTx && journal.stage !== "AUTHORIZED_EXECUTION_FINALIZED" && <div className="button-row"><button className="button" onClick={() => void run(() => trackAuthorizedExecution(journal))} disabled={busy}>Resume existing Safe execution</button></div>}
    {journal?.stage === "AUTHORIZED_EXECUTION_FINALIZED" && !journal.unauthorizedExecutionTx && <div className="button-row"><button className="button secondary" onClick={() => void run(executeUnauthorizedCase)} disabled={busy || !connectedOwner}>Submit wrong-target Safe call and verify Guard rejection</button></div>}
    {journal?.unauthorizedExecutionTx && journal.stage !== "UNAUTHORIZED_EXECUTION_BLOCKED_FINALIZED" && <div className="button-row"><button className="button secondary" onClick={() => void run(() => trackUnauthorizedExecution(journal))} disabled={busy}>Resume existing rejection attempt</button></div>}
    <p className="footer-note">A wrong-target attempt must finalize with a reverted receipt. Pending hashes are resumed by hash; if a signer request times out without returning a hash, the journal blocks rebroadcast until reconciliation.</p>
  </div></div>;
}
