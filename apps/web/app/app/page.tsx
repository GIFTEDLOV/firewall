import Link from "next/link";
import { CanonicalActivity, CanonicalForensicComparison, CanonicalNetwork, CanonicalQualificationPaths, CanonicalStats, CanonicalUnavailable } from "../canonical-ui";
import { loadCanonical } from "../canonical";
import { PageHeading, RouteCard } from "../ui";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") return <><PageHeading eyebrow="Execution security / control plane" title="Keep the mandate intact." lede="The control plane reads the pinned Intelligent Contract directly. It will never replace unavailable canonical state with a fixture." /><CanonicalUnavailable error={state.error} /></>;
  const { model } = state;
  return <>
    <PageHeading eyebrow="Execution security / control plane" title="Keep the mandate intact." lede="Firewall binds what governance approved to the exact package that will execute, then makes the semantic gap explicit before a permit can exist." action={<Link className="button" href="/executions/new">Analyze package</Link>} />
    <CanonicalNetwork model={model} /><p className="canonical-context-note">The console reads Studio-dev chain {model.config.chainId}. Each execution retains its own recorded target-chain context below.</p>
    <CanonicalStats model={model} />
    <div className="grid two">
      <div className="panel panel-featured"><div className="panel-header"><h2>Canonical forensic comparison</h2><span className="status safe">LIVE READ</span></div><div className="panel-body"><CanonicalForensicComparison model={model} /></div></div>
      <div className="panel"><div className="panel-header"><h2>All live execution paths</h2><span className="status safe">NO RESULT SHOPPING</span></div><CanonicalQualificationPaths model={model} /></div>
      <div className="panel"><div className="panel-header"><h2>Recent canonical activity</h2><Link href="/activity" className="text-link">View all <span aria-hidden="true">→</span></Link></div><CanonicalActivity model={model} /></div>
    </div>
    <div className="panel panel-work"><div className="panel-header"><h2>Work surfaces</h2><span className="status pending">LOCAL / PRE-CHAIN</span></div><div className="panel-body route-grid"><RouteCard href="/mandates/new" title="Capture a mandate" body="Import proposal identity and bind explicit constraints in a local workspace." /><RouteCard href="/executions/new" title="Analyze a package" body="Inspect selectors, value, proxy, implementation, and unknowns before any chain action." /><RouteCard href="/integrate" title="Integrate Firewall" body="Review the typed lifecycle, trust boundary, and read-only contract edge." /></div></div>
    <p className="footer-note">Canonical state is read directly from the pinned Intelligent Contract · local workflows are explicitly non-canonical · no network writes</p>
  </>;
}
