import Link from "next/link";
import { EmptyCanonicalState, PageHeading } from "../ui";

export default function MandatesPage() {
  return <><PageHeading eyebrow="Mandates" title="Frozen governance intent" lede="A mandate becomes immutable once proposal identity, text bytes, constraints, and source provenance are bound." action={<Link className="button" href="/mandates/new">New mandate</Link>} /><div className="panel"><div className="panel-header"><h2>Canonical mandates</h2><span className="status pending"><span className="status-dot" />READ MODEL EMPTY</span></div><EmptyCanonicalState /></div></>;
}
