import Link from "next/link";
import type { CanonicalAdjudication, CanonicalExecution, CanonicalLiveReadModel, CanonicalPermit } from "@firewall/genlayer-client";

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
  return value.length > 28 ? `${value.slice(0, 12)}…${value.slice(-10)}` : value;
}

export function CanonicalUnavailable({ error }: { readonly error: string }) {
  return <div className="panel canonical-error"><div className="panel-header"><h2>Canonical state unavailable</h2><span className="status blocked">READ ERROR</span></div><div className="empty"><strong>Live GenLayer state could not be loaded</strong><span className="mono">{error}</span><br />Firewall does not substitute fixtures or cached qualification data when the canonical reader fails.</div></div>;
}

export function CanonicalNetwork({ model }: { readonly model: CanonicalLiveReadModel }) {
  return <div className="canonical-network"><span className="status-dot" />STUDIO-DEV · CHAIN {model.config.chainId} · READ ONLY · {short(model.config.contractAddress)}</div>;
}

export function CanonicalStats({ model }: { readonly model: CanonicalLiveReadModel }) {
  const stats = [
    ["Frozen mandates", model.mandates.length, "canonical contract"],
    ["Executions", model.executions.length, "canonical contract"],
    ["Evidence records", model.evidence.length, "canonical contract"],
    ["Adjudications", model.adjudications.length, "canonical contract"],
    ["Permits", model.permits.length, "canonical contract"],
  ] as const;
  return <div className="grid stats canonical-stats">{stats.map(([label, value, note]) => <div className="panel stat" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</div>;
}

export function SemanticMatrix({ adjudication }: { readonly adjudication: CanonicalAdjudication }) {
  return <div className="matrix semantic-matrix">{semanticLabels.map(([property, label]) => <div key={label}>{label}</div>)}{semanticLabels.map(([property]) => <div key={`${property}-value`} className={adjudication[property] ? "truth-positive" : "truth-negative"}>{String(adjudication[property])}</div>)}</div>;
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
    [adjudication.evidenceSufficient, "evidence sufficiency true", "evidence sufficiency false"],
  ] as const;
  return <div className="outcome-block"><div className={`fixture-verdict ${adjudication.verdict === "EXECUTION_PERMITTED" ? "permitted" : inconclusive ? "inconclusive" : "blocked"}`}>{adjudication.verdict}</div>{permit ? <p className="outcome-copy"><strong>Permit issued: <Link className="result-link" href={`/permits/${permit.permitId}`}>{permit.permitId}</Link></strong> · recorded status {permit.status}.</p> : inconclusive ? <div className="outcome-copy"><strong>NO PERMIT.</strong> The semantic vector is INCONCLUSIVE, so Firewall fails closed and does not relabel it BLOCKED.<ul className="outcome-reasons">{failClosedReasons.map(([value, positive, negative]) => <li key={negative}>{value ? positive : negative}</li>)}</ul></div> : <p className="outcome-copy"><strong>NO PERMIT.</strong> The deterministic policy rejected the semantic vector.</p>}</div>;
}

export function CanonicalForensicComparison({ model, executionId }: { readonly model: CanonicalLiveReadModel; readonly executionId?: string }) {
  const execution = model.executions.find((item) => item.executionId === executionId) ?? model.executions[0];
  const mandate = execution ? model.mandates.find((item) => item.mandateId === execution.mandateId) : model.mandates[0];
  const adjudication = execution ? model.adjudications.find((item) => item.executionId === execution.executionId) : undefined;
  const permit = execution ? model.permits.find((item) => item.executionId === execution.executionId) : undefined;
  if (!execution || !mandate) return <div className="empty"><strong>No canonical comparison available</strong>The contract returned no linked mandate and execution records.</div>;
  return <>
    <div className="forensic">
      <section className="forensic-pane"><header>What governance approved</header><div className="panel-body"><Link className="detail-id" href={`/mandates/${mandate.mandateId}`}>{mandate.mandateId}</Link><h3>{mandate.proposalExternalId}</h3><p>{mandate.proposalText}</p><div className="detail-grid"><div><span className="field-label">State</span><span>{mandate.state}</span></div><div><span className="field-label">Governance source</span><span className="mono">{mandate.proposalSource}</span></div><div><span className="field-label">Governance contract</span><span className="mono">{mandate.governanceContract}</span></div></div></div></section>
      <section className="forensic-pane"><header>What will actually execute</header><div className="panel-body"><Link className="detail-id" href={`/executions/${execution.executionId}`}>{execution.executionId}</Link><h3>Exact committed execution package</h3><p>{execution.semanticInput}</p><div className="detail-grid"><div><span className="field-label">Chain</span><span>{execution.chainId}</span></div><div><span className="field-label">State</span><span>{execution.state}</span></div><div><span className="field-label">Bundle hash</span><span className="mono">{execution.bundleHash}</span></div><div><span className="field-label">Code facts digest</span><span className="mono">{execution.codeFactsDigest}</span></div></div></div></section>
    </div>
    {adjudication ? <div className="canonical-adjudication"><div className="panel-header"><h2>Bounded semantic adjudication · <Link className="result-link" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link></h2><span className="mono">{model.semanticSchema}</span></div><SemanticMatrix adjudication={adjudication} /><CanonicalOutcome adjudication={adjudication} permit={permit} /></div> : <div className="callout">No canonical adjudication has been read for this execution. Permit authority remains absent.</div>}
  </>;
}

export function CanonicalQualificationPaths({ model }: { readonly model: CanonicalLiveReadModel }) {
  return <div className="canonical-path-list">{model.executions.map((execution) => {
    const adjudication = model.adjudications.find((item) => item.executionId === execution.executionId);
    const permit = model.permits.find((item) => item.executionId === execution.executionId);
    return <article className="canonical-path" key={execution.executionId}><div className="canonical-path-header"><div><span className="field-label">Live execution path</span><Link className="detail-id" href={`/executions/${execution.executionId}`}>{execution.executionId}</Link></div>{adjudication && <span className={`status ${adjudication.verdict === "EXECUTION_PERMITTED" ? "safe" : "inconclusive"}`}>{adjudication.verdict}</span>}</div><div className="canonical-path-meta">{adjudication && <Link className="result-link" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link>}{permit ? <Link className="result-link" href={`/permits/${permit.permitId}`}>{permit.permitId}</Link> : <span>NO PERMIT</span>}</div>{adjudication && <><SemanticMatrix adjudication={adjudication} /><CanonicalOutcome adjudication={adjudication} permit={permit} /></>}</article>;
  })}</div>;
}

export function CanonicalActivity({ model }: { readonly model: CanonicalLiveReadModel }) {
  return <div className="audit-list">{model.adjudications.map((adjudication) => { const permit = model.permits.find((item) => item.executionId === adjudication.executionId); return <div className="audit-row" key={adjudication.adjudicationId}><Link className="audit-id" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link><div className="audit-kind"><Link className="result-link" href={`/executions/${adjudication.executionId}`}>{adjudication.executionId}</Link> · {adjudication.verdict}{permit && <> · <Link className="result-link" href={`/permits/${permit.permitId}`}>{permit.permitId}</Link></>}</div><div className="audit-time">GEN {adjudication.generation}</div></div>; })}</div>;
}

export function CanonicalEvidence({ model, executionId }: { readonly model: CanonicalLiveReadModel; readonly executionId?: string }) {
  const records = executionId ? model.evidence.filter((item) => item.executionId === executionId) : model.evidence;
  if (records.length === 0) return <div className="empty"><strong>No canonical evidence record</strong>Evidence is never inferred from an execution or adjudication.</div>;
  return <div className="detail-grid">{records.map((evidence) => <div className="evidence-card" key={evidence.evidenceHash}><span className="field-label">Evidence for {evidence.executionId}</span><span>{evidence.schemaVersion} · {evidence.exactByteLength} bytes · authenticated at {time(evidence.authenticatedAt)}</span><span className="mono">{evidence.evidenceHash}</span></div>)}</div>;
}

export function CanonicalPermitRecord({ model, permit }: { readonly model: CanonicalLiveReadModel; readonly permit: CanonicalPermit }) {
  const adjudication = model.adjudications.find((item) => item.adjudicationId === permit.adjudicationId);
  return <div className="panel-body"><div className="detail-grid"><div><span className="field-label">Permit</span><strong className="detail-id">{permit.permitId}</strong></div><div><span className="field-label">Canonical stored status</span><span>{permit.status}</span></div><div><span className="field-label">Current contract status</span><span>{model.permitStatuses[permit.permitId] ?? "NOT_READ"}</span></div><div><span className="field-label">Binding</span><span className="mono">{permit.permitBindingHash}</span></div><div><span className="field-label">Issued / expires</span><span>{time(permit.issuedAt)} · {time(permit.expiresAt)}</span></div><div><span className="field-label">Execution / adjudication</span><span><Link className="result-link" href={`/executions/${permit.executionId}`}>{permit.executionId}</Link> · {adjudication ? <Link className="result-link" href={`/adjudications/${adjudication.adjudicationId}`}>{adjudication.adjudicationId}</Link> : permit.adjudicationId}</span></div></div><div className="callout" style={{ marginTop: 20 }}>The permit is a deterministic binding over the mandate, execution package, semantic schema, adjudication generation, and expiry. This page only reads its canonical record; it cannot issue or refresh a permit.</div></div>;
}
