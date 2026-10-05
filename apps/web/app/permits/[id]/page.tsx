import Link from "next/link";
import { EmptyCanonicalState, PageHeading } from "../../ui";

export default async function PermitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><PageHeading eyebrow="Permit detail" title={<span className="detail-id">{id}</span>} lede="A permit is usable only while its exact execution, evidence, generation, code facts, and expiry remain valid." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="panel"><div className="panel-header"><h2>Execution permit</h2><span className="status pending"><span className="status-dot" />NOT LOADED</span></div><EmptyCanonicalState /></div></>;
}
