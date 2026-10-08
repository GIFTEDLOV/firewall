import Link from "next/link";
import { loadCanonical } from "../../canonical";
import { CanonicalNetwork, CanonicalPermitRecord, CanonicalUnavailable } from "../../canonical-ui";
import { PageHeading } from "../../ui";
import { ControlledResult } from "../../workflow";

export default async function PermitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = id === "CONTROLLED_FIXTURE_PERMITTED";
  if (fixture) return <><PageHeading eyebrow="Permit detail" title={<span className="detail-id">{id}</span>} lede="A permit is usable only while its exact execution, evidence, generation, code facts, and expiry remain valid." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="panel"><div className="panel-header"><h2>Execution permit</h2><span className="status pending">CONTROLLED_FIXTURE</span></div><ControlledResult verdict="EXECUTION_PERMITTED" /></div></>;
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Permit detail" title={<span className="detail-id">{id}</span>} lede="The permit is read directly from the canonical Intelligent Contract." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><CanonicalUnavailable error={state.error} /></>;
  const permit = state.model.permits.find((item) => item.permitId === id);
  if (!permit) return <><PageHeading eyebrow="Permit detail" title={<span className="detail-id">{id}</span>} lede="The permit is read directly from the canonical Intelligent Contract." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><div className="empty"><strong>Canonical permit not found</strong>The live contract returned no record for {id}.</div></>;
  return <><PageHeading eyebrow="Permit detail" title={<span className="detail-id">{id}</span>} lede="A permit is usable only while its exact execution, evidence, generation, code facts, and expiry remain valid." action={<Link className="button secondary" href="/activity">Audit history</Link>} /><CanonicalNetwork model={state.model} /><div className="panel"><div className="panel-header"><h2>Execution permit</h2><span className="status safe">CANONICAL LIVE READ</span></div><CanonicalPermitRecord model={state.model} permit={permit} /></div></>;
}
