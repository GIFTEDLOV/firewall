import Link from "next/link";
import { loadCanonical } from "./canonical";
import type { CanonicalLiveReadModel } from "@firewall/genlayer-client";

export const dynamic = "force-dynamic";

const dimensions = [
  ["intent_satisfied", "Intent", "Does the package still do what governance approved?"],
  ["scope_expanded", "Scope", "Did execution gain effects outside the mandate?"],
  ["prohibited_effect_present", "Prohibited effect", "Did a forbidden capability appear?"],
  ["economic_terms_consistent", "Economic terms", "Do value and economic conditions remain intact?"],
  ["administrative_authority_changed", "Authority", "Did admin, ownership, or upgrade authority move?"],
  ["implementation_behavior_consistent", "Implementation", "Does runtime behavior remain semantically consistent?"],
  ["evidence_sufficient", "Evidence", "Is the authenticated evidence sufficient to decide?"],
] as const;

function liveProof(model: CanonicalLiveReadModel | null) {
  if (!model) return <div className="proof-unavailable"><span className="status blocked">LIVE READ UNAVAILABLE</span><p>The production reader could not retrieve canonical qualification state. Firewall never substitutes a snapshot.</p></div>;
  const compliant = model.adjudications.find((item) => item.verdict === "EXECUTION_PERMITTED");
  const compliantPermit = compliant ? model.permits.find((item) => item.executionId === compliant.executionId) : undefined;
  const adversarial = model.adjudications.find((item) => item.verdict === "INCONCLUSIVE");
  return <div className="proof-grid">
    <article className="proof-card proof-good"><div className="proof-card-top"><span className="proof-kicker">COMPLIANT PATH</span><span className="status safe">PERMITTED</span></div><strong>{compliant?.verdict ?? "NOT READ"}</strong><p>Semantic vector satisfied all permit dimensions with sufficient evidence.</p><div className="proof-ref">{compliant?.executionId ?? "EXE-NOT-READ"} <span>·</span> {compliantPermit?.permitId ?? "NO PERMIT"}</div></article>
    <article className="proof-card proof-caution"><div className="proof-card-top"><span className="proof-kicker">ADVERSARIAL PATH</span><span className="status inconclusive">FAILS CLOSED</span></div><strong>{adversarial?.verdict ?? "NOT READ"}</strong><p><code>evidence_sufficient=false</code> prevents approval; the result is not relabeled BLOCKED.</p><div className="proof-ref">{adversarial?.executionId ?? "EXE-NOT-READ"} <span>·</span> NO PERMIT</div></article>
  </div>;
}

function comparison(model: CanonicalLiveReadModel | null) {
  const mandate = model?.mandates[0];
  const compliant = model?.executions.find((item) => item.executionId === "EXE-00000001");
  const adversarial = model?.executions.find((item) => item.executionId === "EXE-00000002");
  return <div className="comparison-board">
    <section className="comparison-pane approved"><div className="comparison-label"><span className="signal signal-blue" />WHAT GOVERNANCE APPROVED</div><div className="comparison-id">{mandate?.mandateId ?? "LIVE READ UNAVAILABLE"}</div><h3>{mandate?.proposalExternalId ?? "Frozen mandate"}</h3><p>{mandate?.proposalText ?? "The frozen proposal text is read from the canonical contract at request time."}</p><div className="comparison-meta"><span>STATE</span><strong>{mandate?.state ?? "UNAVAILABLE"}</strong></div></section>
    <div className="comparison-divider" aria-hidden="true"><span>SEMANTIC<br />GAP</span><i>→</i></div>
      <section className="comparison-pane execute"><div className="comparison-label"><span className="signal signal-lime" />WHAT WILL ACTUALLY EXECUTE</div><div className="comparison-id">{compliant?.executionId ?? "LIVE READ UNAVAILABLE"}</div><h3>Committed execution package</h3><p>{compliant?.semanticInput ?? "Execution package facts are read from the canonical contract; nothing is inferred from the UI."}</p><div className="comparison-meta"><span>RECORDED TARGET CHAIN</span><strong>{compliant?.chainId ?? "—"}</strong></div></section>
    {adversarial && <div className="comparison-adversarial"><span className="status inconclusive">ADVERSARIAL PATH · {adversarial.executionId}</span><span>Scope expanded · prohibited effect detected · authority changed · evidence insufficient</span><strong>INCONCLUSIVE / NO PERMIT</strong></div>}
  </div>;
}

export default async function LandingPage() {
  const state = await loadCanonical();
  const model = state.status === "READY" ? state.model : null;
  const error = state.status === "UNAVAILABLE" ? state.error : null;
  return <>
    <main className="landing-page">
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy"><div className="eyebrow">Semantic execution security / GenLayer</div><h1 id="hero-title">Governance approved one thing.<br /><em>Execution can still do another.</em></h1><p className="hero-lede">Firewall verifies whether the implementation that will execute still semantically implements the mandate governance approved.</p><div className="hero-actions"><Link className="button button-large" href="/app">Open Firewall <span aria-hidden="true">↗</span></Link><a className="button secondary button-large" href="#live-proof">View live proof <span aria-hidden="true">↓</span></a></div><div className="hero-metadata"><span><i className="status-dot" />LIVE ON GENLAYER STUDIO-DEV</span><span>READ-ONLY CONTROL PLANE</span></div></div>
        <div className="hero-rail"><div className="rail-top"><span>FIREWALL / 01</span><span>V1.0</span></div><div className="rail-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><span className="brand-mark large">F</span><small>SEMANTIC<br />CHECK</small></div><span className="orbit-tag tag-top">MANDATE</span><span className="orbit-tag tag-right">EVIDENCE</span><span className="orbit-tag tag-bottom">POLICY</span></div><p>Deterministic facts first.<br />Bounded judgment second.<br />Deterministic policy last.</p></div>
      </section>

      <section className="live-strip"><div><span className="eyebrow">Canonical qualification / live read</span><strong>{error ? "CANONICAL READ UNAVAILABLE" : "FROZEN QUALIFICATION STATE"}</strong></div><div className="live-strip-values"><span><small>CONTRACT</small><code>0xEFD65978…f187b6</code></span><span><small>CHAIN</small><code>61997</code></span><span><small>STATUS</small><code>{error ? "ERROR" : "1 / 2 / 2 / 2 / 1"}</code></span></div></section>

      <section className="section-block gap-section" id="gap"><div className="section-heading"><span className="section-index">01</span><div><div className="eyebrow">The governance gap</div><h2>Votes prove approval.<br /><em>They do not prove fidelity.</em></h2></div></div><div className="gap-flow"><div className="flow-node"><span>01</span><strong>Proposal approved</strong><small>Votes · quorum · signatures</small></div><div className="flow-arrow">↓</div><div className="flow-node"><span>02</span><strong>Implementation prepared</strong><small>Targets · calldata · code</small></div><div className="flow-arrow">↓</div><div className="flow-node muted-node"><span>03</span><strong>Traditional checks pass</strong><small>Timelock · authorization</small></div><div className="flow-arrow alert-arrow">↓</div><div className="flow-node alert-node"><span>04</span><strong>Semantic behavior diverges</strong><small>Authority · value · scope</small></div><div className="flow-arrow">↓</div><div className="flow-node firewall-node"><span>05</span><strong>Firewall checks the gap</strong><small>Permit or fail closed</small></div></div></section>

      <section className="section-block" id="how"><div className="section-heading"><span className="section-index">02</span><div><div className="eyebrow">How Firewall works</div><h2>A control plane for semantic integrity.</h2></div></div><div className="lifecycle-grid">{[["01", "Mandate", "Freeze the intent and explicit constraints."], ["02", "Execution analysis", "Inspect the exact package and deterministic facts."], ["03", "Evidence", "Bind hashes, bytes, authority, and provenance."], ["04", "Adjudication", "Bound GenLayer judgment returns seven booleans."], ["05", "Policy", "The contract derives the deterministic verdict."], ["06", "Permit / no permit", "Only a qualifying, bound result can permit." ]].map(([number, title, body]) => <div className="lifecycle-item" key={number}><span>{number}</span><strong>{title}</strong><p>{body}</p></div>)}</div></section>

      <section className="section-block comparison-section" id="comparison"><div className="section-heading"><span className="section-index">03</span><div><div className="eyebrow">Forensic comparison</div><h2>Make the semantic gap impossible to miss.</h2></div><p className="section-note">One frozen mandate. One exact execution package. No result shopping.</p></div>{comparison(model)}</section>

      <section className="section-block proof-section" id="live-proof"><div className="section-heading"><span className="section-index">04</span><div><div className="eyebrow">Live proof</div><h2>Two paths. One deterministic policy.</h2></div><Link className="text-link" href="/app">Open control plane <span aria-hidden="true">↗</span></Link></div>{liveProof(model)}</section>

      <section className="section-block model-section" id="model"><div className="section-heading"><span className="section-index">05</span><div><div className="eyebrow">Semantic model / FIREWALL_MANDATE_V1</div><h2>Seven fields. No confidence theater.</h2></div></div><div className="dimension-grid">{dimensions.map(([key, title, body], index) => <article className="dimension-card" key={key}><span className="dimension-number">0{index + 1}</span><code>{key}</code><strong>{title}</strong><p>{body}</p></article>)}</div><div className="model-note"><span className="signal signal-lime" /><strong>Only the complete vector can permit.</strong><span>Any insufficient evidence produces INCONCLUSIVE and fails closed.</span></div></section>

      <section className="section-block why-section"><div className="section-heading"><span className="section-index">06</span><div><div className="eyebrow">Why existing governance security is not enough</div><h2>Necessary checks leave a semantic blind spot.</h2></div></div><div className="blind-spot-grid"><div className="checklist">{["Votes", "Quorum", "Signatures", "Timelocks", "Calldata"].map((item) => <div key={item}><span>✓</span><strong>{item}</strong><small>Confirms authorization mechanics</small></div>)}</div><div className="blind-spot-callout"><span className="eyebrow">THE UNCHECKED QUESTION</span><strong>Does the code that executes still implement the decision that passed?</strong><p>Firewall adds the semantic layer between governance approval and execution authority.</p></div></div></section>

      <section className="section-block architecture-section"><div className="section-heading"><span className="section-index">07</span><div><div className="eyebrow">Architecture / trust model</div><h2>Facts first. Judgment bounded. Policy final.</h2></div></div><div className="trust-flow"><div><span>01 / DETERMINISTIC</span><strong>Facts</strong><p>Targets, selectors, value, code hashes, proxy facts, evidence bindings.</p></div><i>→</i><div><span>02 / GENLAYER</span><strong>Semantic judgment</strong><p>Exactly seven booleans. No prose, confidence, or verdict injection.</p></div><i>→</i><div className="trust-final"><span>03 / CONTRACT</span><strong>Policy</strong><p>Permit only when every dimension and evidence sufficiency pass.</p></div></div></section>

      <section className="section-block integration-section"><div className="section-heading"><span className="section-index">08</span><div><div className="eyebrow">Integration surface</div><h2>Bring the control to the systems that already govern.</h2></div></div><div className="integration-grid"><Link href="/integrate" className="integration-card"><span>01</span><strong>OpenZeppelin Governor</strong><p>Import proposal identity, targets, values, calldata, and description.</p><b>Explore adapter ↗</b></Link><Link href="/integrate" className="integration-card"><span>02</span><strong>Safe</strong><p>Bind multisig transaction bundles to their exact execution facts.</p><b>Explore adapter ↗</b></Link><Link href="/mandates/new" className="integration-card"><span>03</span><strong>Manual import</strong><p>Capture a local, explicitly unverified proposal for pre-chain analysis.</p><b>Start local analysis ↗</b></Link></div></section>

      <section className="final-cta"><div><div className="eyebrow">The mandate is the boundary.</div><h2>See what governance approved.<br /><em>See what will actually execute.</em></h2></div><div className="final-actions"><Link className="button button-large" href="/app">Open live console ↗</Link><a className="button secondary button-large" href="https://github.com/GIFTEDLOV/firewall" target="_blank" rel="noreferrer">View source ↗</a></div></section>
    </main>
    <footer className="landing-footer"><div className="footer-brand"><span className="brand-mark">F</span><strong>FIREWALL</strong><span>Semantic execution security for on-chain governance.</span></div><div className="footer-links"><a href="https://github.com/GIFTEDLOV/firewall" target="_blank" rel="noreferrer">GitHub</a><a href="https://github.com/GIFTEDLOV/firewall/releases/tag/v1.0.0" target="_blank" rel="noreferrer">Release</a><a href="https://studio-dev.genlayer.com" target="_blank" rel="noreferrer">GenLayer</a><Link href="/app">Console</Link></div><div className="footer-meta">CHAIN 61997 · CONTRACT 0xEFD65978…f187b6 · READ ONLY</div></footer>
  </>;
}
