import Link from "next/link";
import { EmptyCanonicalState, PageHeading } from "../../ui";

export default async function AdjudicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Adjudication detail" title={<span className="detail-id">{id}</span>} lede="GenLayer contributes only the strict seven-field semantic result. The verdict is derived deterministically." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="panel"><div className="panel-header"><h2>Bounded semantic result</h2><span className="status pending"><span className="status-dot" />NOT LOADED</span></div><EmptyCanonicalState /></div></>;
}
