import Link from "next/link";
import { EmptyCanonicalState, PageHeading } from "../../ui";
import { ControlledResult } from "../../workflow";

export default async function PermitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = id === "CONTROLLED_FIXTURE_PERMITTED";
  return <><PageHeading eyebrow="Permit detail" title={<span className="detail-id">{id}</span>} lede="A permit is usable only while its exact execution, evidence, generation, code facts, and expiry remain valid." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="panel"><div className="panel-header"><h2>Execution permit</h2><span className="status pending">{fixture ? "CONTROLLED_FIXTURE" : "NOT LOADED"}</span></div>{fixture ? <ControlledResult verdict="EXECUTION_PERMITTED" /> : <EmptyCanonicalState />}</div></>;
}
