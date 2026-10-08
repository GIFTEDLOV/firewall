import Link from "next/link";
import { PageHeading } from "../../../ui";
import { MandateDetailClient } from "../../../workflow";

export default async function LocalMandateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Local workspace / mandate" title={<span className="detail-id">{id}</span>} lede="This is an off-chain, pre-chain analysis record. It is deliberately separate from the canonical mandate inventory." action={<Link className="button secondary" href="/mandates/new">Capture another draft</Link>} /><MandateDetailClient id={id} /></>;
}
