import Link from "next/link";
import { loadCanonical } from "../canonical";
import { CanonicalNetwork, CanonicalUnavailable } from "../canonical-ui";
import { PageHeading } from "../ui";

export const dynamic = "force-dynamic";

export default async function ExecutionsPage() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Executions" title="Exact packages" lede="Every execution record is read from the canonical contract and bound to its mandate, evidence, and adjudication." action={<Link className="button" href="/executions/new">Analyze local package</Link>} /><CanonicalUnavailable error={state.error} /></>;
  return <><PageHeading eyebrow="Executions" title="Exact execution packages" lede="The package that will actually execute is a first-class security object, not a label attached to a proposal." action={<Link className="button" href="/executions/new">Analyze local package</Link>} /><CanonicalNetwork model={state.model} /><div className="panel"><div className="panel-header"><h2>Canonical execution inventory</h2><span className="status safe">LIVE READ</span></div>{state.model.executions.length === 0 ? <div className="empty"><strong>No canonical executions</strong>The deployed contract returned an empty execution array.</div> : <div className="audit-list">{state.model.executions.map((execution) => { const adjudication = state.model.adjudications.find((item) => item.executionId === execution.executionId); return <div className="audit-row" key={execution.executionId}><Link className="audit-id" href={`/executions/${execution.executionId}`}>{execution.executionId}</Link><div className="audit-kind">{execution.state} · {adjudication?.verdict ?? "NO ADJUDICATION"}</div><div className="audit-time">chain {execution.chainId}</div></div>; })}</div>}</div></>;
}
