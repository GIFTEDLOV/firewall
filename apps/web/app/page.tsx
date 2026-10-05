import Link from "next/link";
import { EmptyCanonicalState, ForensicView, PageHeading, RouteCard } from "./ui";
import { emptyCanonicalReadModel } from "./read-model";

export default function Dashboard() {
  return <>
    <PageHeading eyebrow="Execution security / dashboard" title="Keep the mandate intact." lede="Firewall binds what governance approved to the exact package that will execute, then makes the semantic gap explicit before a permit can exist." action={<Link className="button" href="/executions/new">Analyze execution</Link>} />
    <div className="grid stats">
      {[['Frozen mandates', emptyCanonicalReadModel.mandates.length, 'awaiting canonical read'], ['Pending adjudications', emptyCanonicalReadModel.adjudications.length, 'awaiting canonical read'], ['Active permits', emptyCanonicalReadModel.permits.length, 'awaiting canonical read'], ['Audit events', '—', 'no canonical history loaded']].map(([label, value, note]) => <div className="panel stat" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value === 0 ? '—' : value}</div><div className="stat-note">{note}</div></div>)}
    </div>
    <div className="grid two">
      <ForensicView />
      <div className="panel"><div className="panel-header"><h2>Recent canonical activity</h2><Link href="/activity" className="mono" style={{ color: "var(--info)", fontSize: 11 }}>View all →</Link></div><EmptyCanonicalState label="No activity indexed" /></div>
    </div>
    <div className="panel" style={{ marginTop: 18 }}><div className="panel-header"><h2>Work surfaces</h2></div><div className="panel-body route-grid"><RouteCard href="/mandates/new" title="Capture a mandate" body="Import proposal identity and freeze explicit constraints." /><RouteCard href="/executions/new" title="Analyze a package" body="Inspect selectors, value, proxy, implementation, and unknowns." /><RouteCard href="/integrate" title="Integrate Firewall" body="Review the typed lifecycle and canonical read boundary." /></div></div>
    <p className="footer-note">Gate 1 local shell · no network writes · no fabricated protocol state</p>
  </>;
}
