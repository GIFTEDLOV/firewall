import Link from "next/link";
import { loadCanonical } from "../../canonical";
import { CanonicalNetwork, CanonicalOutcome, CanonicalUnavailable, SemanticMatrix } from "../../canonical-ui";
import { PageHeading } from "../../ui";
import { ControlledResult } from "../../workflow";

export default async function AdjudicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = id === "CONTROLLED_FIXTURE_BLOCKED";
  if (fixture) return <><PageHeading eyebrow="Adjudication detail" title={<span className="detail-id">{id}</span>} lede="GenLayer contributes only the strict seven-field semantic result. The verdict is derived deterministically." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="panel"><div className="panel-header"><h2>Bounded semantic result</h2><span className="status pending">CONTROLLED_FIXTURE</span></div><ControlledResult verdict="EXECUTION_BLOCKED" /></div></>;
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Adjudication detail" title={<span className="detail-id">{id}</span>} lede="The semantic result is read directly from the canonical Intelligent Contract." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><CanonicalUnavailable error={state.error} /></>;
  const adjudication = state.model.adjudications.find((item) => item.adjudicationId === id);
  if (!adjudication) return <><PageHeading eyebrow="Adjudication detail" title={<span className="detail-id">{id}</span>} lede="The semantic result is read directly from the canonical Intelligent Contract." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="empty"><strong>Canonical adjudication not found</strong>The live contract returned no record for {id}.</div></>;
  const permit = state.model.permits.find((item) => item.adjudicationId === adjudication.adjudicationId);
  return <><PageHeading eyebrow="Adjudication detail" title={<span className="detail-id">{id}</span>} lede="GenLayer contributes only the strict seven-field semantic result. The verdict is derived deterministically by the contract." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><CanonicalNetwork model={state.model} /><div className="panel"><div className="panel-header"><h2>Bounded semantic result</h2><span className="status safe">CANONICAL LIVE READ</span></div><div className="panel-body"><div className="detail-grid"><div><span className="field-label">Execution</span><Link className="result-link" href={`/executions/${adjudication.executionId}`}>{adjudication.executionId}</Link></div><div><span className="field-label">Generation</span><span>{adjudication.generation}</span></div><div><span className="field-label">Schema</span><span className="mono">{adjudication.semanticSchema}</span></div></div><SemanticMatrix adjudication={adjudication} /><CanonicalOutcome adjudication={adjudication} permit={permit} /></div></div></>;
}
