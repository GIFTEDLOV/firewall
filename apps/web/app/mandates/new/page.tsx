import Link from "next/link";
import { PageHeading } from "../../ui";

export default function NewMandatePage() {
  return <><PageHeading eyebrow="Mandates / capture" title="Capture proposal identity" lede="This shell is ready for an adapter-backed import. No proposal is accepted until its authority, source, bytes, and hash reconcile." action={<Link className="button secondary" href="/mandates">Back to mandates</Link>} /><div className="panel"><div className="panel-header"><h2>Import source</h2><span className="status pending"><span className="status-dot" />PREPARING</span></div><div className="panel-body"><div className="callout">No governance adapter is connected in Gate 1. The form remains intentionally non-submitting so a URL cannot be mistaken for proposal identity.</div><p className="footer-note">Supported adapter interfaces: OpenZeppelin Governor, Safe, and manual canonical import.</p></div></div></>;
}
