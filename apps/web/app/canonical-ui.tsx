import Link from "next/link";
import type { CanonicalAdjudication, CanonicalLiveReadModel, CanonicalPermit } from "@firewall/genlayer-client";

const semanticLabels = [
  ["intentSatisfied", "intent_satisfied"],
  ["scopeExpanded", "scope_expanded"],
  ["prohibitedEffectPresent", "prohibited_effect_present"],
  ["economicTermsConsistent", "economic_terms_consistent"],
  ["administrativeAuthorityChanged", "administrative_authority_changed"],
  ["implementationBehaviorConsistent", "implementation_behavior_consistent"],
  ["evidenceSufficient", "evidence_sufficient"],
] as const;

function time(value: number): string {
  return value === 0 ? "not supplied" : new Date(value * 1000).toISOString();
}

function short(value: string): string {
  return value.length > 28 ? `${value.slice(0, 12)}...${value.slice(-10)}` : value;
}

export function CanonicalUnavailable({ error }: { readonly error: string }) {
  return <div className="panel canonical-error"><div className="panel-header"><h2>Canonical state unavailable</h2><span className="status blocked">READ ERROR</span></div><div className="empty"><strong>Live GenLayer state could not be loaded</strong><span className="mono">{error}</span><br />Firewall does not substitute fixtures or cached qualification data when the canonical reader fails.</div></div>;
}

export function CanonicalNetwork({ model }: { readonly model: CanonicalLiveReadModel }) {
  const live = model.source === "LIVE_CANONICAL";
  return <div className="canonical-network"><span className="status-dot" />{live ? "STUDIONET" : "TEST FIXTURE"} / CHAIN {model.config.chainId} / {live ? "CANONICAL READ" : "SIMULATED TEST DATA"} / {short(model.config.contractAddress)}</div>;
}

export function CanonicalStats({ model }: { readonly model: CanonicalLiveReadModel }) {
  const note = model.source === "LIVE_CANONICAL" ? "canonical contract" : "test fixture";
  const stats = [["Mandates", model.mandates.length], ["Executions", model.executions.length], ["Authenticated records", model.evidence.length], ["Adjudications", model.adjudications.length], ["Permits", model.permits.length]] as const;
  return <div className="grid stats canonical-stats">{stats.map(([label, value]) => <div className="panel stat" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</div>;
}

export function SemanticMatrix({ adjudication }: { readonly adjudication: CanonicalAdjudication }) {
  return <div className="matrix semantic-matrix">{semanticLabels.map(([property, label]) => <div className="semantic-row" key={label}><span>{label}</span><strong className={adjudication[property] ? "truth-positive" : "truth-negative"}>{String(adjudication[property])}</strong></div>)}</div>;
}

export function CanonicalOutcome({ adjudication, permit }: { readonly adjudication: CanonicalAdjudication; readonly permit?: CanonicalPermit | undefined }) {
  const inconclusive = adjudication.verdict === "INCONCLUSIVE";
  const failClosedReasons = [
    [adjudication.intentSatisfied, "intent satisfied", "intent not satisfied"],
    [adjudication.scopeExpanded, "scope expanded", "scope unchanged"],
    [adjudication.prohibitedEffectPresent, "prohibited effect detected", "no prohibited effect"],
    [adjudication.economicTermsConsistent, "economic terms consistent", "economic terms inconsistent"],
    [adjudication.administrativeAuthorityChanged, "administrative authority changed", "administrative authority unchanged"],
    [adjudication.implementationBehaviorConsistent, "implementation behavior consistent", "implementation behavior inconsistent"],
    [adjudication.evidenceSufficient, "evidence sufficient", "evidence insufficient"],
  ] as const;
  return <div className="outcome-block"><div className={`fixture-verdict ${adjudication.verdict === "EXECUTION_PERMITTED" ? "permitted" : inconclusive ? "inconclusive" : "blocked"}`}>{adjudication.verdict}</div>{permit ? <p className="outcome-copy"><strong>Canonical permit: <Link className="result-link" href={`/permits/${permit.permitId}`}>{permit.permitId}</Link></strong> / recorded status {permit.status}.</p> : inconclusive ? <div className="outcome-copy"><strong>NO PERMIT.</strong> The semantic vector is inconclusive, so policy fails closed.<ul className="outcome-reasons">{failClosedReasons.map(([value, positive, negative]) => <li key={negative}>{value ? positive : negative}</li>)}</ul></div> : <p className="outcome-copy"><strong>NO PERMIT.</strong> The deterministic policy rejected the semantic vector.</p>}</div>;
}

export function CanonicalForensicComparison({ model, executionId }: { readonly model: CanonicalLiveReadModel; readonly executionId?: string }) {
  const execution = model.executions.find((item) => item.executionId === executionId) ?? model.executions[0];
  const mandate = execution ? model.mandates.find((item) => item.mandateId === execution.mandateId) : model.mandates[0];
  const adjudication = execution ? model.adjudications.find((item) => item.executionId === execution.executionId) : undefined;
  const permit = execution ? model.permits.find((item) => item.executionId === execution.executionId) : undefined;
  if (!execution || !mandate) return <div className="empty"><strong>No canonical comparison available</strong>The contract returned no linked mandate and execution records.</div>;
  return <>
    <div className="forensic">
      <section className="forensic-pane"><header>Frozen mandate</header><div className="panel-body"><Link className="detail-id" href={`/mandates/${mandate.mandateId}`}>{mandate.mandateId}</Link><h3>{mandate.proposalExternalId}</h3><p>{mandate.proposalText}</p><div className="detail-grid"><div><span className="field-label">State</span><span>{mandate.state}</span></div><div><span className="field-label">Governance source</span><span className="mono">{mandate.proposalSource}</span></div><div><span className="field-label">Governance contract</span><span className="mono">{mandate.governanceContract}</span></div></div></div></section>
      <section className="forensic-pane"><header>Caller-committed expected facts</header><div className="panel-body"><Link className="detail-id" href={`/executions/${execution.executionId}`}>{execution.executionId}</Link><div className="detail-grid"><div><span className="field-label">Target chain</span><span>{execution.chainId}</span></div><div><span className="field-label">State</span><span>{execution.state}</span></div><div><span className="field-label">Evidence state</span><span>{execution.evidenceStatus}</span></div><div><span className="field-label">Generation</span><span>{execution.generation}</span></div></div><pre className="mono evidence-json">{execution.expectedFacts}</pre><p className="field-note">The canonical reader is pinned to Studionet chain {model.config.chainId}. The execution record retains its EVM chain separately.</p></div></section>
    </div>
    {adjudication ? <div className="canonical-adjudication"><div className="panel-header"><h2>Adjudication / <Link className="result-link" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link></h2><span className="mono">{model.semanticSchema}</span></div><SemanticMatrix adjudication={adjudication} /><CanonicalOutcome adjudication={adjudication} permit={permit} /></div> : <div className="callout">No canonical adjudication has been read for this execution. Permit authority remains absent.</div>}
  </>;
}

export function CanonicalQualificationPaths({ model }: { readonly model: CanonicalLiveReadModel }) {
  return <div className="canonical-path-list">{model.executions.map((execution) => {
    const adjudication = model.adjudications.find((item) => item.executionId === execution.executionId);
    const permit = model.permits.find((item) => item.executionId === execution.executionId);
    return <article className="canonical-path" key={execution.executionId}><div className="canonical-path-header"><div><span className="field-label">Execution</span><Link className="detail-id" href={`/executions/${execution.executionId}`}>{execution.executionId}</Link></div>{adjudication && <span className={`status ${adjudication.verdict === "EXECUTION_PERMITTED" ? "safe" : "inconclusive"}`}>{adjudication.verdict}</span>}</div><div className="canonical-path-meta">{adjudication && <Link className="result-link" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link>}{permit ? <Link className="result-link" href={`/permits/${permit.permitId}`}>{permit.permitId}</Link> : <span>NO PERMIT</span>}</div>{adjudication && <><SemanticMatrix adjudication={adjudication} /><CanonicalOutcome adjudication={adjudication} permit={permit} /></>}</article>;
  })}</div>;
}

export function CanonicalActivity({ model }: { readonly model: CanonicalLiveReadModel }) {
  return <div className="audit-list">{model.adjudications.map((adjudication) => { const permit = model.permits.find((item) => item.executionId === adjudication.executionId); return <div className="audit-row" key={adjudication.adjudicationId}><Link className="audit-id" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link><div className="audit-kind"><Link className="result-link" href={`/executions/${adjudication.executionId}`}>{adjudication.executionId}</Link> / {adjudication.verdict}{permit && <> / <Link className="result-link" href={`/permits/${permit.permitId}`}>{permit.permitId}</Link></>}</div><div className="audit-time">GEN {adjudication.generation}</div></div>; })}</div>;
}

export function CanonicalEvidence({ model, executionId }: { readonly model: CanonicalLiveReadModel; readonly executionId?: string }) {
  const records = executionId ? model.evidence.filter((item) => item.executionId === executionId) : model.evidence;
  if (records.length === 0) return <div className="empty"><strong>No authenticated evidence is stored</strong>Evidence is read only from the canonical execution record.</div>;
  return <div className="detail-grid">{records.map((evidence) => <div className="evidence-card" key={evidence.executionId}><span className="field-label">Evidence for {evidence.executionId}</span><span>{evidence.evidenceStatus}</span><code className="mono">{evidence.factsJson}</code></div>)}</div>;
}

export function CanonicalPermitRecord({ model, permit }: { readonly model: CanonicalLiveReadModel; readonly permit: CanonicalPermit }) {
  const adjudication = model.adjudications.find((item) => item.adjudicationId === permit.adjudicationId);
  return <div className="panel-body"><div className="detail-grid"><div><span className="field-label">Permit</span><strong className="detail-id">{permit.permitId}</strong></div><div><span className="field-label">Canonical stored status</span><span>{permit.status}</span></div><div><span className="field-label">Current contract status</span><span>{model.permitStatuses[permit.permitId] ?? "NOT_READ"}</span></div><div><span className="field-label">Binding hash</span><span className="mono">{permit.bindingHash}</span></div><div><span className="field-label">Issued / expires</span><span>{time(permit.issuedAt)} / {time(permit.expiresAt)}</span></div><div><span className="field-label">Execution / adjudication</span><span><Link className="result-link" href={`/executions/${permit.executionId}`}>{permit.executionId}</Link> / {adjudication ? <Link className="result-link" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link> : permit.adjudicationId}</span></div></div><div className="callout" style={{ marginTop: 20 }}>The permit binds the frozen mandate, expected execution facts, authenticated evidence, adjudication, and generation. Permit readback alone does not establish EVM enforcement; a configured Guard transaction is required.</div></div>;
}
