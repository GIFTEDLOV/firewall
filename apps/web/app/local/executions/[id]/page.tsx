import Link from "next/link";
import { PageHeading } from "../../../ui";
import { ExecutionForensicClient } from "../../../workflow";

export default async function LocalExecutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Local workspace / execution" title={<span className="detail-id">{id}</span>} lede="This is an off-chain, pre-chain package analysis. It cannot adjudicate, issue a permit, or mutate canonical GenLayer state." action={<Link className="button secondary" href="/executions/new">Analyze another package</Link>} /><ExecutionForensicClient id={id} /></>;
}
