import Link from "next/link";
import { CanonicalNetwork, CanonicalUnavailable } from "../canonical-ui";
import { loadCanonical } from "../canonical";
import { PageHeading } from "../ui";

export const dynamic = "force-dynamic";

export default async function MandatesPage() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Mandates" title="Frozen governance intent" lede="A mandate becomes immutable once proposal identity, text bytes, constraints, and source provenance are bound." action={<Link className="button" href="/mandates/new">New mandate</Link>} /><CanonicalUnavailable error={state.error} /></>;
  return <><PageHeading eyebrow="Mandates" title="Frozen governance intent" lede="A mandate becomes immutable once proposal identity, text bytes, constraints, and source provenance are bound." action={<Link className="button" href="/mandates/new">New mandate</Link>} /><CanonicalNetwork model={state.model} /><div className="panel"><div className="panel-header"><h2>Canonical mandates</h2><span className="status safe"><span className="status-dot" />LIVE READ</span></div>{state.model.mandates.length === 0 ? <div className="empty"><strong>No canonical mandates</strong>The deployed contract returned an empty mandate array.</div> : <div className="audit-list">{state.model.mandates.map((mandate) => <div className="audit-row" key={mandate.mandateId}><Link className="audit-id" href={`/mandates/${mandate.mandateId}`}>{mandate.mandateId}</Link><div className="audit-kind">{mandate.state} · {mandate.proposalExternalId}</div><div className="audit-time">v{mandate.mandateVersion}</div></div>)}</div>}</div></>;
}
