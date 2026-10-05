import Link from "next/link";
import { PageHeading } from "../../ui";
import { ControlledForensicFixture, ExecutionForensicClient } from "../../workflow";

export default async function ExecutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = id.startsWith("CONTROLLED_FIXTURE");
  return <><PageHeading eyebrow="Execution detail" title={<span className="detail-id">{id}</span>} lede="The package identity is the ordered target/value/calldata and code-fact binding, not a UI label." action={<Link className="button secondary" href="/executions/new">New analysis</Link>} /><div className="panel"><div className="panel-header"><h2>Forensic comparison</h2><span className="status pending">{fixture ? "CONTROLLED_FIXTURE" : "LOCAL READ MODEL"}</span></div>{fixture ? <ControlledForensicFixture /> : <ExecutionForensicClient id={id} />}</div></>;
}
