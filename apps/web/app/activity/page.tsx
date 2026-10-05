import { EmptyCanonicalState, PageHeading } from "../ui";

export default function ActivityPage() {
  return <><PageHeading eyebrow="Activity" title="Canonical audit history" lede="Append-only adjudication and permit records, reconciled from the Intelligent Contract." /><div className="panel"><div className="panel-header"><h2>Audit events</h2><span className="status pending"><span className="status-dot" />NO CANONICAL READ</span></div><EmptyCanonicalState /></div></>;
}
