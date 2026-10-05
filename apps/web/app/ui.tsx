import Link from "next/link";

export function PageHeading({ eyebrow, title, lede, action }: { eyebrow: string; title: React.ReactNode; lede: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="lede">{lede}</p></div>{action}</div>;
}

export function EmptyCanonicalState({ label = "No canonical records available" }: { label?: string }) {
  return <div className="empty"><strong>{label}</strong>The read model is intentionally empty until a canonical contract read is configured. Firewall will not substitute sample mandates, inferred verdicts, or backend-only protocol state.</div>;
}

export function ForensicView() {
  return <div className="panel"><div className="panel-header"><h2>Forensic comparison</h2><span className="status pending"><span className="status-dot" />AWAITING PACKAGE</span></div><div className="forensic"><section className="forensic-pane"><header>What governance approved</header><EmptyCanonicalState label="Frozen mandate not loaded" /></section><section className="forensic-pane"><header>What will actually execute</header><EmptyCanonicalState label="Execution package not loaded" /></section></div><div className="panel-header"><h2>Semantic matrix</h2><span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>FIREWALL_MANDATE_V1</span></div><div className="matrix">{["Intent satisfied", "Scope expanded", "Prohibited effect", "Economic terms", "Admin authority", "Implementation behavior", "Evidence sufficient"].map((label) => <div key={label}>{label}</div>)}{["—", "—", "—", "—", "—", "—", "—"].map((value, index) => <div key={`${value}-${index}`}>{value}</div>)}</div><div className="callout">The verdict stays pending until authenticated evidence and a canonical adjudication read are available. Finality alone will not be shown as execution success.</div></div>;
}

export function RouteCard({ href, title, body }: { href: string; title: string; body: string }) {
  return <Link href={href} className="route-card"><strong>{title}</strong>{body}</Link>;
}
