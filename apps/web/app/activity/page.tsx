import { CanonicalActivity, CanonicalNetwork, CanonicalStats, CanonicalUnavailable } from "../canonical-ui";
import { loadCanonical } from "../canonical";
import { PageHeading } from "../ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Activity" title="Canonical audit history" lede="Append-only adjudication and permit records, reconciled from the Intelligent Contract." /><CanonicalUnavailable error={state.error} /></>;
  return <><PageHeading eyebrow="Activity" title="Canonical audit history" lede="Append-only adjudication and permit records, reconciled from the Intelligent Contract." /><CanonicalNetwork model={state.model} /><CanonicalStats model={state.model} /><div className="panel"><div className="panel-header"><h2>Audit events</h2><span className="status safe"><span className="status-dot" />LIVE READ</span></div><CanonicalActivity model={state.model} /></div></>;
}
