"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LOCAL_WORKFLOW_SCOPE = "LOCAL_PRECHAIN_ANALYSIS" as const;
const LOCAL_ANALYSIS_CHAIN_ID = 61127 as const;

const ZERO_HASH = `0x${"00".repeat(32)}`;
const ADDRESS = `0x${"11".repeat(20)}`;
const MANDATE_STORAGE = "firewall.local.mandate.";
const EXECUTION_STORAGE = "firewall.local.execution.";

type LocalMandate = { mandateId: string; state: string; proposalHash: string; proposalTextSha256: string; proposalTextBytes: number; constraints: Record<string, unknown>; governanceChainId: number; proposalText: string; proposalExternalId: string; proposalSource: string };
type LocalExecution = { executionId: string; mandateId: string; chainId: number; bundleHash: string; targets: Array<{ address: string; selector: string | null; decodedFunctionName: string | null; calldata: string; nativeValue: string; codeHash: string | null; implementationAddress: string | null; implementationCodeHash: string | null; dangerousCapabilities: string[]; unknowns: string[] }> };

function saveLocal(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readLocal<T>(key: string): T | null {
  const value = window.localStorage.getItem(key);
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function LocalScopeNote({ label = LOCAL_WORKFLOW_SCOPE }: { label?: string }) {
  return <div className="scope-banner local-scope"><span className="scope-glyph">LOCAL</span><div><strong>{label}</strong><span>Off-chain / pre-chain analysis only · target-chain context {LOCAL_ANALYSIS_CHAIN_ID} · no canonical contract write path.</span></div></div>;
}

export function LocalActionNote({ label }: { label: string }) {
  return <div className="callout"><strong>{label}</strong><br />This workflow creates local analysis records only. Canonical GenLayer state remains read-only and is never inferred from this result.</div>;
}

export function MandateImportForm() {
  const [proposalText, setProposalText] = useState("Upgrade TreasuryVault to add batched withdrawals. No new administrator authority. No ownership change. No mint authority. No treasury transfer.");
  const [status, setStatus] = useState("PREPARING");
  const [mandateId, setMandateId] = useState<string | null>(null);
  useEffect(() => { setMandateId(window.localStorage.getItem("firewall.pending.mandate")); }, []);
  async function submit() {
    setStatus("IMPORTING");
    try {
      const bytes = new TextEncoder().encode(proposalText).byteLength;
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proposalText));
      const proposalTextSha256 = `0x${Array.from(new Uint8Array(hashBuffer), (value) => value.toString(16).padStart(2, "0")).join("")}`;
      const body = {
        adapter: "MANUAL_CANONICAL",
        proposal: { governanceSystem: "MANUAL_CANONICAL", governanceChainId: LOCAL_ANALYSIS_CHAIN_ID, governanceContract: ADDRESS, proposalExternalId: "local-manual-1", proposalHash: ZERO_HASH, proposalSource: "https://local.invalid/manual", proposalTextSha256, proposalTextBytes: bytes, proposalText },
        mandateVersion: 1,
        constraints: { allowedTargets: [ADDRESS], forbiddenTargets: [], allowedValueTransfer: "NONE", maximumValue: "0", allowedSelectors: [], prohibitedCapabilities: ["MINT_AUTHORITY"], protectedEconomicTerms: ["TREASURY_TRANSFER"], protectedAdminAuthorities: ["ADMIN_ROLE"], protectedOwnership: true, protectedUpgradeScope: true },
      };
      const response = await fetch("/api/mandates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { mandate?: LocalMandate; error?: string };
      if (!response.ok || !result.mandate) throw new Error(result.error ?? "LOCAL_MANDATE_CREATE_FAILED");
      window.localStorage.setItem("firewall.pending.mandate", result.mandate.mandateId);
      saveLocal(`${MANDATE_STORAGE}${result.mandate.mandateId}`, result.mandate);
      setMandateId(result.mandate.mandateId);
      setStatus("DRAFT_CAPTURED");
    } catch (error) { setStatus(error instanceof Error ? error.message : "IMPORT_FAILED"); }
  }
  return <><LocalScopeNote /><div className="panel"><div className="panel-header"><h2>Capture local proposal draft</h2><span className="status pending"><span className="status-dot" />{status}</span></div><div className="panel-body form-stack"><label>Proposal text<textarea value={proposalText} onChange={(event) => setProposalText(event.target.value)} rows={8} /></label><div className="callout">Manual import is explicitly unverified provenance. The source URL is transport only; content hash and exact byte length are bound in the local record.</div><button className="button" onClick={submit}>Capture local draft</button>{mandateId && <Link className="mono result-link" href={`/local/mandates/${mandateId}`}>Open local {mandateId} →</Link>}</div></div></>;
}

export function MandateDetailClient({ id }: { id: string }) {
  const [state, setState] = useState<"LOADING" | "READY" | "NOT_FOUND">("LOADING");
  const [mandate, setMandate] = useState<LocalMandate | null>(null);
  useEffect(() => {
    const saved = readLocal<LocalMandate>(`${MANDATE_STORAGE}${id}`);
    if (saved) { setMandate(saved); setState("READY"); return; }
    fetch(`/api/mandates/${id}`).then((response) => response.json()).then((value: { mandate?: LocalMandate }) => { if (value.mandate) { setMandate(value.mandate); setState("READY"); } else setState("NOT_FOUND"); }).catch(() => setState("NOT_FOUND"));
  }, [id]);
  if (state === "LOADING") return <div className="empty">Loading local pre-chain record…</div>;
  if (state === "NOT_FOUND" || !mandate) return <div className="empty"><strong>Local mandate not found</strong>Capture a draft through the off-chain workflow first. Canonical mandate records are shown under the live Mandates inventory.</div>;
  return <><LocalScopeNote /><div className="panel-body detail-grid"><div><span className="field-label">Scope</span><span>LOCAL_PRECHAIN_ANALYSIS</span></div><div><span className="field-label">Target chain context</span><span>{mandate.governanceChainId}</span></div><div><span className="field-label">State</span><span className="status pending">{mandate.state}</span></div><div><span className="field-label">Proposal</span><span>{mandate.proposalExternalId}</span></div><div><span className="field-label">Proposal text</span><span>{mandate.proposalText}</span></div><div><span className="field-label">Proposal source</span><code>{mandate.proposalSource}</code></div><div><span className="field-label">Proposal hash</span><code>{mandate.proposalHash}</code></div><div><span className="field-label">Text binding</span><code>{mandate.proposalTextSha256} · {mandate.proposalTextBytes} bytes</code></div><pre>{JSON.stringify(mandate.constraints, null, 2)}</pre><LocalActionNote label="No canonical mandate was created" /></div></>;
}

export function ExecutionImportForm() {
  const [mandateId, setMandateId] = useState("");
  const [status, setStatus] = useState("PREPARING");
  const [executionId, setExecutionId] = useState<string | null>(null);
  async function submit() {
    setStatus("FREEZING_LOCAL");
    try {
      const freeze = await fetch(`/api/mandates/${mandateId}/freeze`, { method: "POST" });
      if (!freeze.ok) throw new Error("LOCAL_FREEZE_FAILED");
      setStatus("ANALYZING_LOCAL");
      const result = await fetch("/api/executions/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mandateId, chainId: LOCAL_ANALYSIS_CHAIN_ID, targets: [{ address: ADDRESS, calldata: "0xa9059cbb", nativeValue: "0", proxyFacts: { codeHash: ZERO_HASH, bytecodeLength: 128 } }], operations: [{ order: 0, targetIndex: 0, kind: "CALL" }] }) });
      const value = await result.json() as { execution?: LocalExecution; error?: string };
      if (!result.ok || !value.execution) throw new Error(value.error ?? "LOCAL_ANALYSIS_FAILED");
      saveLocal(`${EXECUTION_STORAGE}${value.execution.executionId}`, value.execution);
      setExecutionId(value.execution.executionId); setStatus("ANALYZED_LOCAL");
    } catch (error) { setStatus(error instanceof Error ? error.message : "ANALYSIS_FAILED"); }
  }
  return <><LocalScopeNote /><div className="panel"><div className="panel-header"><h2>Analyze local candidate package</h2><span className="status pending"><span className="status-dot" />{status}</span></div><div className="panel-body form-stack"><label>Local draft mandate ID<input value={mandateId} onChange={(event) => setMandateId(event.target.value)} placeholder="MAN-00000001" /></label><button className="button" disabled={!mandateId} onClick={submit}>Freeze and analyze local package</button>{executionId && <Link className="mono result-link" href={`/local/executions/${executionId}`}>Open local forensic view for {executionId} →</Link>}</div></div></>;
}

export function ExecutionForensicClient({ id }: { id: string }) {
  const [state, setState] = useState<"LOADING" | "READY" | "NOT_FOUND">("LOADING");
  const [execution, setExecution] = useState<LocalExecution | null>(null);
  useEffect(() => {
    const saved = readLocal<LocalExecution>(`${EXECUTION_STORAGE}${id}`);
    if (saved) { setExecution(saved); setState("READY"); return; }
    fetch(`/api/executions/${id}`).then((response) => response.json()).then((value: { execution?: LocalExecution }) => { if (value.execution) { setExecution(value.execution); setState("READY"); } else setState("NOT_FOUND"); }).catch(() => setState("NOT_FOUND"));
  }, [id]);
  if (state === "LOADING") return <div className="empty">Loading local execution package…</div>;
  if (!execution) return <div className="empty"><strong>Local execution is not in the browser workspace</strong>Import a package from the pre-chain analysis route first.</div>;
  return <><LocalScopeNote /><div className="panel-body"><div className="diff-meta"><span>TARGET CHAIN {execution.chainId}</span><code>{execution.bundleHash}</code></div><div className="forensic"><section className="forensic-pane"><header>What governance approved</header><div className="empty"><strong>{execution.mandateId}</strong>Frozen local mandate facts are loaded through the pre-chain workspace.</div></section><section className="forensic-pane"><header>What will actually execute</header>{execution.targets.map((target, index) => <div className="target-row" key={`${target.address}-${index}`}><code>{target.address}</code><strong>{target.decodedFunctionName ?? target.selector ?? "UNKNOWN SELECTOR"}</strong><code>{target.calldata}</code><span>value {target.nativeValue} · code {target.codeHash ?? "UNKNOWN"}</span><span>implementation {target.implementationAddress ?? "NONE"} · {target.implementationCodeHash ?? "UNKNOWN"}</span>{target.dangerousCapabilities.length > 0 && <span className="danger">{target.dangerousCapabilities.join(" · ")}</span>}{target.unknowns.length > 0 && <span className="warn">unknown: {target.unknowns.join(" · ")}</span>}</div>)}</section></div><div className="panel-header"><h2>Semantic assessment</h2><span className="mono">LOCAL / NON-CANONICAL</span></div><div className="matrix">{["Intent satisfied", "Scope expanded", "Prohibited effect", "Economic terms", "Admin authority", "Implementation behavior", "Evidence sufficient"].map((label) => <div key={label}>{label}</div>)}{Array.from({ length: 7 }, (_, index) => <div key={index}>PENDING</div>)}</div><LocalActionNote label="Deterministic facts are inspectable before GenLayer" /></div></>;
}

export function ControlledForensicFixture() {
  return <div className="panel-body"><div className="callout"><strong>CONTROLLED_FIXTURE</strong><br />Deterministic test data only. This is not live network or canonical contract state.</div><div className="forensic"><section className="forensic-pane"><header>What governance approved</header><div className="empty"><strong>MAN-00000001</strong>Batch withdrawals; no new administrator authority; no ownership change; no mint authority; no treasury transfer.</div></section><section className="forensic-pane"><header>What will actually execute</header><div className="target-row"><code>0x1111111111111111111111111111111111111111</code><strong>batchWithdrawals()</strong><span>value 0 · implementation unchanged</span></div></section></div><div className="panel-header"><h2>Semantic adjudication</h2><span className="status safe">PERMITTED</span></div><div className="matrix">{["Intent satisfied", "Scope expanded", "Prohibited effect", "Economic terms", "Admin authority", "Implementation behavior", "Evidence sufficient"].map((label) => <div key={label}>{label}</div>)}{["true", "false", "false", "true", "false", "true", "true"].map((value, index) => <div key={index}>{value}</div>)}</div></div>;
}

export function ControlledResult({ verdict }: { verdict: "EXECUTION_PERMITTED" | "EXECUTION_BLOCKED" }) {
  return <div className="panel-body"><div className="callout"><strong>CONTROLLED_FIXTURE</strong><br />Demonstration result only; canonical state is never inferred from this fixture.</div><div className={`fixture-verdict ${verdict === "EXECUTION_BLOCKED" ? "blocked" : "permitted"}`}>{verdict}</div><p className="lede">Derived from the seven-field semantic vector and the deterministic policy engine.</p></div>;
}
