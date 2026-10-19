import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";

const sourcePath = "contracts/FirewallSafeGuard.sol";
const source = readFileSync(sourcePath, "utf8");
const sourceHash = createHash("sha256").update(source, "utf8").digest("hex");
const output = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { [sourcePath]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } },
  },
})));
const errors = (output.errors ?? []).filter((error) => error.severity === "error");
if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
const contract = output.contracts[sourcePath]?.FirewallSafeGuard;
if (!contract?.evm.bytecode.object || !contract.evm.deployedBytecode.object) throw new Error("SAFE_GUARD_ARTIFACT_MISSING");
const creationBytecode = `0x${contract.evm.bytecode.object}`;
const runtimeBytecode = `0x${contract.evm.deployedBytecode.object}`;
const artifact = {
  contract: "FirewallSafeGuard",
  source: sourcePath,
  sourceSha256: sourceHash,
  compiler: solc.version(),
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  constructor: [{ name: "safe_", type: "address" }, { name: "relayer_", type: "address" }],
  abi: contract.abi,
  creationBytecodeSha256: createHash("sha256").update(creationBytecode).digest("hex"),
  runtimeTemplateSha256: createHash("sha256").update(runtimeBytecode).digest("hex"),
  deployedRuntimeImmutableReferences: contract.evm.deployedBytecode.immutableReferences,
  creationBytecode,
};
writeFileSync("artifacts/FirewallSafeGuard.artifact.json", `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  artifact: "artifacts/FirewallSafeGuard.artifact.json",
  sourceSha256: sourceHash,
  compiler: artifact.compiler,
  creationBytecodeSha256: artifact.creationBytecodeSha256,
  runtimeTemplateSha256: artifact.runtimeTemplateSha256,
  creationBytecodeBytes: (creationBytecode.length - 2) / 2,
  constructorParameters: artifact.constructor.length,
}));
