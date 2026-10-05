import Link from "next/link";
import { EmptyCanonicalState, PageHeading } from "../../ui";

export default async function ExecutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Execution detail" title={<span className="detail-id">{id}</span>} lede="The package identity is the ordered target/value/calldata and code-fact binding, not a UI label." action={<Link className="button secondary" href="/executions/new">New analysis</Link>} /><div className="panel"><div className="panel-header"><h2>Candidate execution</h2><span className="status pending"><span className="status-dot" />NOT LOADED</span></div><EmptyCanonicalState /></div></>;
}
