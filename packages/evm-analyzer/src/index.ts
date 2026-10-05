import { decodeFunctionData, type Abi, type Hex } from "viem";
import { executionBundleHash, ExecutionPackageSchema, type ExecutionPackage, type ExecutionTarget, type Mandate } from "@firewall/domain";
import { compareHex, hashCanonical, type CanonicalValue } from "@firewall/shared";

export const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const EIP1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;

export const KNOWN_SELECTORS = {
  transfer: "0xa9059cbb",
  approve: "0x095ea7b3",
  transferFrom: "0x23b872dd",
  increaseAllowance: "0x39509351",
  owner: "0x8da5cb5b",
  renounceOwnership: "0x715018a6",
  transferOwnership: "0xf2fde38b",
  upgradeTo: "0x3659cfe6",
  upgradeToAndCall: "0x4f1ef286",
  proxyAdminUpgrade: "0x99a88ec4",
  proxyAdminUpgradeAndCall: "0x9623609d",
  mint: "0x40c10f19",
  burn: "0x42966c68",
  burnFrom: "0x79cc6790",
  grantRole: "0x2f2ff15d",
  revokeRole: "0xd547741f",
  renounceRole: "0x36568abe",
  hasRole: "0x91d14854",
  changeAdmin: "0x8f283970",
  pause: "0x8456cb59",
  unpause: "0x3f4ba83a",
} as const;

type Selector = keyof typeof KNOWN_SELECTORS;

export type ProxyFacts = {
  readonly implementationAddress?: `0x${string}` | null;
  readonly implementationCodeHash?: `0x${string}` | null;
  readonly adminAddress?: `0x${string}` | null;
  readonly beaconAddress?: `0x${string}` | null;
  readonly codeHash?: `0x${string}` | null;
  readonly bytecodeLength?: number | null;
  readonly bytecode?: Hex;
};

export type AnalyzeCallInput = {
  readonly address: `0x${string}`;
  readonly calldata: Hex;
  readonly nativeValue: string;
  readonly abi?: Abi;
  readonly abiProvenance?: ExecutionTarget["knownAbiProvenance"];
  readonly proxyFacts?: ProxyFacts;
};

export type AnalyzerAssessment = {
  readonly targetSetChanged: boolean;
  readonly selectorSetChanged: boolean;
  readonly valueChanged: boolean;
  readonly implementationChanged: boolean;
  readonly dangerousCapabilitiesPresent: boolean;
  readonly unknowns: string[];
  readonly evidenceSufficient: boolean;
  readonly analysisCompleteForKnownFields: boolean;
  readonly unknownSelectorCount: number;
  readonly unknownTargetCount: number;
  readonly unverifiedAbiCount: number;
};

export type DeterministicBlockReason =
  | "CHAIN_MISMATCH"
  | "FORBIDDEN_TARGET"
  | "TARGET_NOT_ALLOWLISTED"
  | "NATIVE_VALUE_EXCEEDS_CAP"
  | "VALUE_TRANSFER_FORBIDDEN"
  | "FORBIDDEN_SELECTOR"
  | "OWNERSHIP_TRANSFER"
  | "ADMIN_AUTHORITY_CHANGE"
  | "UPGRADE_OUTSIDE_SCOPE"
  | "UNKNOWN_BEHAVIOR";

export type DeterministicViolationReport = {
  readonly hardBlock: boolean;
  readonly reasons: readonly DeterministicBlockReason[];
  readonly unknowns: readonly string[];
};

function selectorName(selector: string | null): Selector | null {
  if (selector === null) return null;
  const entry = Object.entries(KNOWN_SELECTORS).find(([, value]) => value === selector);
  return (entry?.[0] as Selector | undefined) ?? null;
}

export function extractSelector(calldata: Hex): Hex | null {
  return calldata.length >= 10 ? calldata.slice(0, 10).toLowerCase() as Hex : null;
}

function word(calldata: Hex, index: number): string | null {
  const start = 10 + index * 64;
  const value = calldata.slice(start, start + 64);
  return value.length === 64 ? value : null;
}

function wordAddress(calldata: Hex, index: number): `0x${string}` | null {
  const value = word(calldata, index);
  return value ? `0x${value.slice(24)}` : null;
}

function wordUint(calldata: Hex, index: number): string | null {
  const value = word(calldata, index);
  return value ? BigInt(`0x${value}`).toString(10) : null;
}

function capabilitiesFor(selector: Hex | null): ExecutionTarget["dangerousCapabilities"] {
  switch (selector) {
    case KNOWN_SELECTORS.transferOwnership:
    case KNOWN_SELECTORS.renounceOwnership:
      return ["OWNERSHIP_CHANGE", "ADMIN_AUTHORITY_CHANGE"];
    case KNOWN_SELECTORS.upgradeTo:
    case KNOWN_SELECTORS.upgradeToAndCall:
    case KNOWN_SELECTORS.proxyAdminUpgrade:
    case KNOWN_SELECTORS.proxyAdminUpgradeAndCall:
      return ["UPGRADE", "ADMIN_AUTHORITY_CHANGE"];
    case KNOWN_SELECTORS.mint:
      return ["MINT_AUTHORITY"];
    case KNOWN_SELECTORS.burn:
    case KNOWN_SELECTORS.burnFrom:
      return ["BURN_OPERATION"];
    case KNOWN_SELECTORS.grantRole:
      return ["ROLE_GRANT", "ADMIN_AUTHORITY_CHANGE"];
    case KNOWN_SELECTORS.revokeRole:
    case KNOWN_SELECTORS.renounceRole:
      return ["ROLE_REVOKE", "ADMIN_AUTHORITY_CHANGE"];
    case KNOWN_SELECTORS.changeAdmin:
      return ["ADMIN_CHANGE", "ADMIN_AUTHORITY_CHANGE"];
    case KNOWN_SELECTORS.pause:
    case KNOWN_SELECTORS.unpause:
      return ["PAUSE_OPERATION"];
    case KNOWN_SELECTORS.transfer:
    case KNOWN_SELECTORS.transferFrom:
      return ["TREASURY_TRANSFER"];
    default:
      return selector === null ? ["UNKNOWN_SELECTOR"] : [];
  }
}

function tokenEffectFor(selector: Hex | null, calldata: Hex): ExecutionTarget["tokenEffects"] {
  if (selector === KNOWN_SELECTORS.transfer) {
    return [{ token: null, kind: "ERC20_TRANSFER", from: null, to: wordAddress(calldata, 0), spender: null, amount: wordUint(calldata, 1) }];
  }
  if (selector === KNOWN_SELECTORS.approve) {
    return [{ token: null, kind: "ERC20_APPROVE", from: null, to: null, spender: wordAddress(calldata, 0), amount: wordUint(calldata, 1) }];
  }
  if (selector === KNOWN_SELECTORS.transferFrom) {
    return [{ token: null, kind: "ERC20_TRANSFER_FROM", from: wordAddress(calldata, 0), to: wordAddress(calldata, 1), spender: null, amount: wordUint(calldata, 2) }];
  }
  return [];
}

function decodeWithAbi(input: AnalyzeCallInput): { name: string | null; args: unknown[]; unknowns: string[] } {
  if (!input.abi) return { name: selectorName(extractSelector(input.calldata)), args: [], unknowns: ["ABI_UNAVAILABLE"] };
  try {
    const decoded = decodeFunctionData({ abi: input.abi, data: input.calldata });
    return { name: decoded.functionName, args: [...(decoded.args ?? [])], unknowns: [] };
  } catch {
    return { name: selectorName(extractSelector(input.calldata)), args: [], unknowns: ["ABI_DECODE_FAILED"] };
  }
}

export function detectProxyType(facts: ProxyFacts | undefined): ExecutionTarget["proxyType"] {
  if (!facts) return "UNKNOWN";
  if (facts.beaconAddress) return "BEACON";
  if (facts.implementationAddress && facts.adminAddress) return "TRANSPARENT";
  if (facts.implementationAddress) return "EIP1967";
  if (facts.codeHash && facts.bytecodeLength === 0) return "UNKNOWN";
  return "NONE";
}

export function analyzeCall(input: AnalyzeCallInput): ExecutionTarget {
  const selector = extractSelector(input.calldata);
  const known = selectorName(selector ?? "0x");
  const decoded = decodeWithAbi(input);
  const unknowns = [...decoded.unknowns];
  if (selector === null) unknowns.push("CALLDATA_SELECTOR_MISSING");
  if (input.proxyFacts?.implementationAddress && !input.proxyFacts.implementationCodeHash) unknowns.push("IMPLEMENTATION_CODE_HASH_UNAVAILABLE");
  const caps = capabilitiesFor(selector);
  if (known === null) caps.push("UNKNOWN_RUNTIME_BEHAVIOR");
  unknowns.push(...scanBytecodeFlags(input.proxyFacts?.bytecode));
  return {
    address: input.address,
    codeHash: input.proxyFacts?.codeHash ?? null,
    proxyType: detectProxyType(input.proxyFacts),
    implementationAddress: input.proxyFacts?.implementationAddress ?? null,
    implementationCodeHash: input.proxyFacts?.implementationCodeHash ?? null,
    knownAbiProvenance: input.abiProvenance ?? { source: "NONE", sourceUrl: null, abiSha256: null },
    selector,
    decodedFunctionName: decoded.name,
    decodedArguments: decoded.args,
    calldata: input.calldata,
    nativeValue: input.nativeValue,
    tokenEffects: tokenEffectFor(selector, input.calldata),
    dangerousCapabilities: [...new Set(caps)],
    unknowns: [...new Set(unknowns)],
  };
}

export function scanBytecodeFlags(bytecode: Hex | undefined): string[] {
  if (!bytecode) return [];
  const flags: string[] = [];
  const body = bytecode.slice(2).toLowerCase();
  if (body.includes("f4")) flags.push("DELEGATECALL_VISIBLE");
  if (body.includes("f0")) flags.push("CREATE_VISIBLE");
  if (body.includes("fb")) flags.push("CREATE2_VISIBLE");
  if (body.includes("ff")) flags.push("SELFDESTRUCT_VISIBLE");
  return flags;
}

export function analyzeExecutionPackage(input: Omit<ExecutionPackage, "targets" | "bundleHash" | "calldataValueDigest" | "state"> & { targets: AnalyzeCallInput[] }): ExecutionPackage {
  const targets = input.targets.map(analyzeCall);
  const operations = input.operations;
  const bundleHash = executionBundleHash({ mandateId: input.mandateId, chainId: input.chainId, targets, operations });
  const calldataValueDigest = hashCanonical(targets.map((target) => ({ calldata: target.calldata, nativeValue: target.nativeValue })) as unknown as CanonicalValue);
  return ExecutionPackageSchema.parse({ ...input, targets, bundleHash, calldataValueDigest, state: "EXECUTION_IMPORTED" });
}

function targetKey(target: ExecutionTarget): string {
  return `${target.address.toLowerCase()}:${target.selector?.toLowerCase() ?? "unknown"}`;
}

export function compareExecutionToMandate(mandate: Mandate, candidate: ExecutionPackage): AnalyzerAssessment {
  const allowedTargets = new Set(mandate.constraints.allowedTargets.map((address) => address.toLowerCase()));
  const forbiddenTargets = new Set(mandate.constraints.forbiddenTargets.map((address) => address.toLowerCase()));
  const allowedSelectors = new Set(mandate.constraints.allowedSelectors.map((selector) => selector.toLowerCase()));
  const targetSetChanged = candidate.targets.some((target) => forbiddenTargets.has(target.address.toLowerCase()) || (allowedTargets.size > 0 && !allowedTargets.has(target.address.toLowerCase())));
  const selectorSetChanged = allowedSelectors.size > 0 && candidate.targets.some((target) => !target.selector || !allowedSelectors.has(target.selector.toLowerCase()));
  const valueChanged = candidate.targets.some((target) => BigInt(target.nativeValue) > 0n && (mandate.constraints.allowedValueTransfer === "NONE" || (mandate.constraints.maximumValue !== null && BigInt(target.nativeValue) > BigInt(mandate.constraints.maximumValue))));
  const implementationChanged = mandate.constraints.protectedUpgradeScope && candidate.targets.some((target) => target.dangerousCapabilities.includes("UPGRADE"));
  const dangerousCapabilitiesPresent = candidate.targets.some((target) => target.dangerousCapabilities.some((capability) => capability !== "UNKNOWN_RUNTIME_BEHAVIOR" && capability !== "UNKNOWN_SELECTOR"));
  const unknowns = candidate.targets.flatMap((target) => target.unknowns.map((unknown) => `${targetKey(target)}:${unknown}`));
  return {
    targetSetChanged,
    selectorSetChanged,
    valueChanged,
    implementationChanged,
    dangerousCapabilitiesPresent,
    unknowns,
    evidenceSufficient: unknowns.length === 0 && candidate.targets.every((target) => target.codeHash !== null),
    analysisCompleteForKnownFields: unknowns.length === 0,
    unknownSelectorCount: candidate.targets.filter((target) => target.unknowns.includes("ABI_UNAVAILABLE") || target.unknowns.includes("CALLDATA_SELECTOR_MISSING")).length,
    unknownTargetCount: candidate.targets.filter((target) => target.codeHash === null).length,
    unverifiedAbiCount: candidate.targets.filter((target) => target.knownAbiProvenance.source === "NONE" || target.knownAbiProvenance.source === "OPERATOR_SUPPLIED").length,
  };
}

export function detectDeterministicViolations(mandate: Mandate, candidate: ExecutionPackage): DeterministicViolationReport {
  const reasons = new Set<DeterministicBlockReason>();
  const unknowns: string[] = [];
  if (candidate.chainId !== mandate.governanceChainId) reasons.add("CHAIN_MISMATCH");
  const allowedTargets = new Set(mandate.constraints.allowedTargets.map((address) => address.toLowerCase()));
  const forbiddenTargets = new Set(mandate.constraints.forbiddenTargets.map((address) => address.toLowerCase()));
  const allowedSelectors = new Set(mandate.constraints.allowedSelectors.map((selector) => selector.toLowerCase()));
  for (const target of candidate.targets) {
    const address = target.address.toLowerCase();
    if (forbiddenTargets.has(address)) reasons.add("FORBIDDEN_TARGET");
    if (allowedTargets.size > 0 && !allowedTargets.has(address)) reasons.add("TARGET_NOT_ALLOWLISTED");
    if (target.selector === null || target.dangerousCapabilities.includes("UNKNOWN_SELECTOR") || target.dangerousCapabilities.includes("UNKNOWN_RUNTIME_BEHAVIOR")) {
      unknowns.push(`${address}:UNKNOWN_BEHAVIOR`);
    }
    if (target.selector && allowedSelectors.size > 0 && !allowedSelectors.has(target.selector.toLowerCase())) reasons.add("FORBIDDEN_SELECTOR");
    if (BigInt(target.nativeValue) > 0n && mandate.constraints.allowedValueTransfer === "NONE") reasons.add("VALUE_TRANSFER_FORBIDDEN");
    if (mandate.constraints.maximumValue !== null && BigInt(target.nativeValue) > BigInt(mandate.constraints.maximumValue)) reasons.add("NATIVE_VALUE_EXCEEDS_CAP");
    if (target.dangerousCapabilities.includes("OWNERSHIP_CHANGE")) reasons.add("OWNERSHIP_TRANSFER");
    if (target.dangerousCapabilities.includes("ADMIN_AUTHORITY_CHANGE")) reasons.add("ADMIN_AUTHORITY_CHANGE");
    if (target.dangerousCapabilities.includes("UPGRADE") && mandate.constraints.protectedUpgradeScope) reasons.add("UPGRADE_OUTSIDE_SCOPE");
  }
  return { hardBlock: reasons.size > 0, reasons: [...reasons], unknowns };
}

export function eip1967ImplementationSlot(): `0x${string}` {
  return EIP1967_IMPLEMENTATION_SLOT;
}

export function hashesChanged(before: ExecutionTarget, after: ExecutionTarget): boolean {
  return !compareHex(before.codeHash ?? "", after.codeHash ?? "") || !compareHex(before.implementationCodeHash ?? "", after.implementationCodeHash ?? "");
}
