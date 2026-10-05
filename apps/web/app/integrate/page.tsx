import Link from "next/link";
import { PageHeading } from "../ui";

export default function IntegratePage() {
  return <><PageHeading eyebrow="Integrate" title="Put Firewall before execution" lede="Use the typed domain and lifecycle boundary to keep governance intent, exact execution facts, semantic adjudication, and permits separate." action={<Link className="button secondary" href="/">Dashboard</Link>} /><div className="grid two"><div className="panel"><div className="panel-header"><h2>Integration contract</h2></div><div className="panel-body"><div className="mono" style={{ color: "var(--accent)", lineHeight: 1.9, fontSize: 12 }}>freeze mandate<br />→ commit execution<br />→ authenticate evidence<br />→ adjudicate bounded result<br />→ derive policy<br />→ read canonical permit</div></div></div><div className="panel"><div className="panel-header"><h2>Transaction lifecycle</h2></div><div className="panel-body"><p className="lede">PREPARING → AWAITING_WALLET → BROADCAST → PENDING → ACCEPTED → FINALIZED → EXECUTION_RESULT_CHECK → CANONICAL_SUCCESS</p><p className="footer-note">Finalized is not synonymous with successful execution.</p></div></div></div></>;
}
