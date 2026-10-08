import Link from "next/link";
import { loadCanonical } from "../../canonical";
import { CanonicalEvidence, CanonicalForensicComparison, CanonicalNetwork, CanonicalUnavailable } from "../../canonical-ui";
import { PageHeading } from "../../ui";
import { ControlledForensicFixture, ExecutionForensicClient } from "../../workflow";

export default async function ExecutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = id.startsWith("CONTROLLED_FIXTURE");
  if (fixture) return <><PageHeading eyebrow="Execution detail" title={<span className="detail-id">{id}</span>} lede="The package identity is the ordered target/value/calldata and code-fact binding, not a UI label." action={<Link className="button secondary" href="/executions/new">New analysis</Link>} /><div className="panel"><div className="panel-header"><h2>Forensic comparison</h2><span className="status pending">CONTROLLED_FIXTURE</span></div><ControlledForensicFixture /></div></>;
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Execution detail" title={<span className="detail-id">{id}</span>} lede="The package identity is read directly from the canonical Intelligent Contract." action={<Link className="button secondary" href="/executions/new">New analysis</Link>} /><CanonicalUnavailable error={state.error} /></>;
  const execution = state.model.executions.find((item) => item.executionId === id);
  if (!execution) return <><PageHeading eyebrow="Execution detail" title={<span className="detail-id">{id}</span>} lede="The package identity is read directly from the canonical Intelligent Contract." action={<Link className="button secondary" href="/executions/new">New analysis</Link>} /><div className="empty"><strong>Canonical execution not found</strong>The live contract returned no record for {id}.</div></>;
  return <><PageHeading eyebrow="Execution detail" title={<span className="detail-id">{id}</span>} lede="The package identity is the ordered target/value/calldata and code-fact binding, not a UI label." action={<Link className="button secondary" href="/executions/new">New analysis</Link>} /><CanonicalNetwork model={state.model} /><div className="panel"><div className="panel-header"><h2>Forensic comparison</h2><span className="status safe">CANONICAL LIVE READ</span></div><div className="panel-body"><CanonicalForensicComparison model={state.model} executionId={execution.executionId} /></div></div><div className="panel" style={{ marginTop: 18 }}><div className="panel-header"><h2>Authenticated evidence</h2></div><div className="panel-body"><CanonicalEvidence model={state.model} executionId={execution.executionId} /></div></div></>;
}
