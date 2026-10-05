import Link from "next/link";
import { EmptyCanonicalState, PageHeading } from "../../ui";

export default async function MandateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Mandate detail" title={<span className="detail-id">{id}</span>} lede="Only a canonical mandate read can populate this forensic surface." action={<Link className="button secondary" href="/mandates">Back to mandates</Link>} /><div className="panel"><div className="panel-header"><h2>Frozen mandate</h2><span className="status pending"><span className="status-dot" />NOT LOADED</span></div><EmptyCanonicalState /></div></>;
}
