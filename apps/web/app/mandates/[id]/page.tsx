import Link from "next/link";
import { PageHeading } from "../../ui";
import { MandateDetailClient } from "../../workflow";

export default async function MandateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Mandate detail" title={<span className="detail-id">{id}</span>} lede="Draft reads are local orchestration state; canonical frozen state must be reconciled from the Intelligent Contract." action={<Link className="button secondary" href="/mandates">Back to mandates</Link>} /><div className="panel"><div className="panel-header"><h2>Mandate record</h2><span className="status pending"><span className="status-dot" />LOCAL READ MODEL</span></div><MandateDetailClient id={id} /></div></>;
}
