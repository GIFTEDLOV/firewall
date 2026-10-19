import Link from "next/link";
import { PageHeading } from "../ui";
import { RelayEnforcementStatus, StudionetWalletPanel } from "../integrate-wallet";

export default function IntegratePage() {
  return (
    <>
      <PageHeading
        eyebrow="Integrate"
        title="Put Firewall before execution"
        lede="Use the typed domain and lifecycle boundary to keep governance intent, exact execution facts, semantic adjudication, and permits separate."
        action={<Link className="button secondary" href="/app">Control plane</Link>}
      />
      <StudionetWalletPanel />
      <RelayEnforcementStatus />
      <div className="grid two">
        <div className="panel">
          <div className="panel-header"><h2>Integration contract</h2></div>
          <div className="panel-body">
            <div className="mono" style={{ color: "var(--accent)", lineHeight: 1.9, fontSize: 12 }}>
              verified canonical precondition read<br />
              → prepare<br />
              → broadcast once<br />
              → persist exact hash<br />
              → reconcile same hash<br />
              → finalized consensus<br />
              → execution result<br />
              → canonical readback
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h2>Trust boundary</h2></div>
          <div className="panel-body">
            <p className="lede">Deterministic EVM facts feed a bounded seven-field semantic judgment. The contract derives policy; finality is never treated as execution success.</p>
            <p className="footer-note">Local analysis is labeled separately. Contract writes stay locked while canonical V2 reads are unavailable.</p>
          </div>
        </div>
      </div>
    </>
  );
}
