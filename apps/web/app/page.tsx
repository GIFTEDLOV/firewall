import Link from "next/link";
import { CanonicalActivity, CanonicalForensicComparison, CanonicalNetwork, CanonicalStats, CanonicalUnavailable } from "./canonical-ui";
import { loadCanonical } from "./canonical";
import { PageHeading, RouteCard } from "./ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Execution security / dashboard" title="Keep the mandate intact." lede="Firewall binds what governance approved to the exact package that will execute, then makes the semantic gap explicit before a permit can exist." /><CanonicalUnavailable error={state.error} /></>;
  const { model } = state;
  return <>
    <PageHeading eyebrow="Execution security / dashboard" title="Keep the mandate intact." lede="Firewall binds what governance approved to the exact package that will execute, then makes the semantic gap explicit before a permit can exist." action={<Link className="button" href="/executions/new">Analyze execution</Link>} />
    <CanonicalNetwork model={model} />
    <CanonicalStats model={model} />
    <div className="grid two">
      <div className="panel"><div className="panel-header"><h2>Canonical forensic comparison</h2><span className="status safe">LIVE READ</span></div><div className="panel-body"><CanonicalForensicComparison model={model} /></div></div>
      <div className="panel"><div className="panel-header"><h2>Recent canonical activity</h2><Link href="/activity" className="mono" style={{ color: "var(--info)", fontSize: 11 }}>View all →</Link></div><CanonicalActivity model={model} /></div>
    </div>
    <div className="panel" style={{ marginTop: 18 }}><div className="panel-header"><h2>Work surfaces</h2></div><div className="panel-body route-grid"><RouteCard href="/mandates/new" title="Capture a mandate" body="Import proposal identity and freeze explicit constraints." /><RouteCard href="/executions/new" title="Analyze a package" body="Inspect selectors, value, proxy, implementation, and unknowns." /><RouteCard href="/integrate" title="Integrate Firewall" body="Review the typed lifecycle and canonical read boundary." /></div></div>
    <p className="footer-note">Canonical state is read directly from the pinned Intelligent Contract · no network writes · no fabricated protocol state</p>
  </>;
}
