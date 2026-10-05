"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ZERO_HASH = `0x${"00".repeat(32)}`;
const ADDRESS = `0x${"11".repeat(20)}`;

export function MandateImportForm() {
  const [proposalText, setProposalText] = useState("Upgrade TreasuryVault to add batched withdrawals. No new administrator authority. No ownership change. No mint authority. No treasury transfer.");
  const [status, setStatus] = useState("PREPARING");
  const [mandateId, setMandateId] = useState<string | null>(null);
  useEffect(() => { const saved = window.localStorage.getItem("firewall.pending.mandate"); if (saved) setMandateId(saved); }, []);
  async function submit() {
    setStatus("IMPORTING");
    const bytes = new TextEncoder().encode(proposalText).byteLength;
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proposalText));
    const proposalTextSha256 = `0x${Array.from(new Uint8Array(hashBuffer), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    const body = {
      adapter: "MANUAL_CANONICAL",
      proposal: { governanceSystem: "MANUAL_CANONICAL", governanceChainId: 61127, governanceContract: ADDRESS, proposalExternalId: "local-manual-1", proposalHash: ZERO_HASH, proposalSource: "https://local.invalid/manual", proposalTextSha256, proposalTextBytes: bytes, proposalText },
      mandateVersion: 1,
      constraints: { allowedTargets: [ADDRESS], forbiddenTargets: [], allowedValueTransfer: "NONE", maximumValue: "0", allowedSelectors: [], prohibitedCapabilities: ["MINT_AUTHORITY"], protectedEconomicTerms: ["TREASURY_TRANSFER"], protectedAdminAuthorities: ["ADMIN_ROLE"], protectedOwnership: true, protectedUpgradeScope: true },
    };
    const response = await fetch("/api/mandates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { setStatus("IMPORT_FAILED"); return; }
    const result = await response.json() as { mandateId: string };
    window.localStorage.setItem("firewall.pending.mandate", result.mandateId);
    setMandateId(result.mandateId);
    setStatus("DRAFT_CAPTURED");
  }
  return <div className="panel"><div className="panel-header"><h2>Manual canonical import</h2><span className="status pending"><span className="status-dot" />{status}</span></div><div className="panel-body form-stack"><label>Proposal text<textarea value={proposalText} onChange={(event) => setProposalText(event.target.value)} rows={8} /></label><div className="callout">Manual import is explicitly unverified provenance. The source URL is transport only; content hash and exact byte length are bound.</div><button className="button" onClick={submit}>Capture immutable draft</button>{mandateId && <Link className="mono result-link" href={`/mandates/${mandateId}`}>Open {mandateId} →</Link>}</div></div>;
}

export function LocalActionNote({ label }: { label: string }) {
  return <div className="callout"><strong>{label}</strong><br />Local orchestration is available. Canonical contract actions remain read-only until a wallet/network client is explicitly configured.</div>;
}

export function MandateDetailClient({ id }: { id: string }) {
  const [state, setState] = useState<"LOADING" | "READY" | "NOT_FOUND">("LOADING");
  const [mandate, setMandate] = useState<{ state: string; proposalHash: string; proposalTextSha256: string; proposalTextBytes: number; constraints: Record<string, unknown> } | null>(null);
  useEffect(() => { fetch(`/api/mandates/${id}`).then((response) => response.json()).then((value) => { if (value.error) setState("NOT_FOUND"); else { setMandate(value); setState("READY"); } }).catch(() => setState("NOT_FOUND")); }, [id]);
  if (state === "LOADING") return <div className="empty">Loading local read model…</div>;
  if (state === "NOT_FOUND" || !mandate) return <div className="empty"><strong>Canonical mandate not loaded</strong>Import a draft through the API, then freeze it through the mandate-specific actor.</div>;
  return <div className="panel-body detail-grid"><div><span className="field-label">State</span><span className="status safe">{mandate.state}</span></div><div><span className="field-label">Proposal hash</span><code>{mandate.proposalHash}</code></div><div><span className="field-label">Text binding</span><code>{mandate.proposalTextSha256} · {mandate.proposalTextBytes} bytes</code></div><pre>{JSON.stringify(mandate.constraints, null, 2)}</pre><LocalActionNote label="Freeze is mandate-scoped" /></div>;
}

export function ExecutionImportForm() {
  const [mandateId, setMandateId] = useState("");
  const [status, setStatus] = useState("PREPARING");
  const [executionId, setExecutionId] = useState<string | null>(null);
  async function submit() {
    setStatus("FREEZING");
    const freeze = await fetch(`/api/mandates/${mandateId}/freeze`, { method: "POST" });
    if (!freeze.ok) { setStatus("FREEZE_FAILED"); return; }
    setStatus("ANALYZING");
    const result = await fetch("/api/executions/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mandateId, chainId: 61127, targets: [{ address: ADDRESS, calldata: "0xa9059cbb", nativeValue: "0", proxyFacts: { codeHash: ZERO_HASH, bytecodeLength: 128 } }], operations: [{ order: 0, targetIndex: 0, kind: "CALL" }] }) });
    if (!result.ok) { setStatus("ANALYSIS_FAILED"); return; }
    const value = await result.json() as { execution: { executionId: string } };
    setExecutionId(value.execution.executionId); setStatus("ANALYZED");
  }
  return <div className="panel"><div className="panel-header"><h2>Analyze candidate package</h2><span className="status pending"><span className="status-dot" />{status}</span></div><div className="panel-body form-stack"><label>Frozen mandate ID<input value={mandateId} onChange={(event) => setMandateId(event.target.value)} placeholder="MAN-00000001" /></label><button className="button" disabled={!mandateId} onClick={submit}>Freeze and analyze local package</button>{executionId && <Link className="mono result-link" href={`/executions/${executionId}`}>Open forensic view for {executionId} →</Link>}</div></div>;
}

export function ExecutionForensicClient({ id }: { id: string }) {
  const [state, setState] = useState<"LOADING" | "READY" | "NOT_FOUND">("LOADING");
  const [execution, setExecution] = useState<{ mandateId: string; chainId: number; bundleHash: string; targets: Array<{ address: string; selector: string | null; decodedFunctionName: string | null; calldata: string; nativeValue: string; codeHash: string | null; implementationAddress: string | null; implementationCodeHash: string | null; dangerousCapabilities: string[]; unknowns: string[] }> } | null>(null);
  useEffect(() => { fetch(`/api/executions/${id}`).then((response) => response.json()).then((value) => { if (value.error) setState("NOT_FOUND"); else { setExecution(value); setState("READY"); } }).catch(() => setState("NOT_FOUND")); }, [id]);
  if (state === "LOADING") return <div className="empty">Loading execution package…</div>;
  if (!execution) return <div className="empty"><strong>Execution is not in the local read model</strong>Import a package from the analysis route first.</div>;
  return <div className="panel-body"><div className="diff-meta"><span>CHAIN {execution.chainId}</span><code>{execution.bundleHash}</code></div><div className="forensic"><section className="forensic-pane"><header>What governance approved</header><div className="empty"><strong>{execution.mandateId}</strong>Frozen mandate facts are loaded through the mandate read boundary.</div></section><section className="forensic-pane"><header>What will actually execute</header>{execution.targets.map((target, index) => <div className="target-row" key={`${target.address}-${index}`}><code>{target.address}</code><strong>{target.decodedFunctionName ?? target.selector ?? "UNKNOWN SELECTOR"}</strong><code>{target.calldata}</code><span>value {target.nativeValue} · code {target.codeHash ?? "UNKNOWN"}</span><span>implementation {target.implementationAddress ?? "NONE"} · {target.implementationCodeHash ?? "UNKNOWN"}</span>{target.dangerousCapabilities.length > 0 && <span className="danger">{target.dangerousCapabilities.join(" · ")}</span>}{target.unknowns.length > 0 && <span className="warn">unknown: {target.unknowns.join(" · ")}</span>}</div>)}</section></div><div className="panel-header"><h2>Semantic adjudication</h2><span className="mono">FIREWALL_MANDATE_V1</span></div><div className="matrix">{["Intent satisfied", "Scope expanded", "Prohibited effect", "Economic terms", "Admin authority", "Implementation behavior", "Evidence sufficient"].map((label) => <div key={label}>{label}</div>)}{Array.from({ length: 7 }, (_, index) => <div key={index}>PENDING</div>)}</div><LocalActionNote label="Deterministic facts are inspectable before GenLayer" /></div>;
}

export function ControlledForensicFixture() {
  return <div className="panel-body"><div className="callout"><strong>CONTROLLED_FIXTURE</strong><br />Demonstration data only. This is not live network or canonical contract state.</div><div className="forensic"><section className="forensic-pane"><header>What governance approved</header><div className="empty"><strong>MAN-00000001</strong>Batch withdrawals; no new administrator authority; no ownership change; no mint authority; no treasury transfer.</div></section><section className="forensic-pane"><header>What will actually execute</header><div className="target-row"><code>0x1111111111111111111111111111111111111111</code><strong>batchWithdrawals()</strong><span>value 0 · implementation unchanged</span></div></section></div><div className="panel-header"><h2>Semantic adjudication</h2><span className="status safe">PERMITTED</span></div><div className="matrix">{["Intent satisfied", "Scope expanded", "Prohibited effect", "Economic terms", "Admin authority", "Implementation behavior", "Evidence sufficient"].map((label) => <div key={label}>{label}</div>)}{["true", "false", "false", "true", "false", "true", "true"].map((value, index) => <div key={index}>{value}</div>)}</div></div>;
}

export function ControlledResult({ verdict }: { verdict: "EXECUTION_PERMITTED" | "EXECUTION_BLOCKED" }) {
  return <div className="panel-body"><div className="callout"><strong>CONTROLLED_FIXTURE</strong><br />Demonstration result only; canonical state is never inferred from this fixture.</div><div className={`fixture-verdict ${verdict === "EXECUTION_BLOCKED" ? "blocked" : "permitted"}`}>{verdict}</div><p className="lede">Derived from the seven-field semantic vector and the deterministic policy engine.</p></div>;
}
