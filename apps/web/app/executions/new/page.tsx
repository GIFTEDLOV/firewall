import Link from "next/link";
import { PageHeading } from "../../ui";

export default function NewExecutionPage() {
  return <><PageHeading eyebrow="Executions / analysis" title="Analyze candidate package" lede="Import exact target, value, calldata, operation order, and deterministic target facts before semantic adjudication." action={<Link className="button secondary" href="/">Cancel</Link>} /><div className="grid two"><div className="panel"><div className="panel-header"><h2>Execution package</h2><span className="status pending"><span className="status-dot" />PREPARING</span></div><div className="panel-body"><div className="callout">No mandate is loaded. Analysis is disabled until a frozen mandate and chain are known.</div></div></div><div className="panel"><div className="panel-header"><h2>Evidence prerequisites</h2></div><div className="panel-body"><p className="lede">Target code hash, proxy implementation, ABI provenance, selector decoding, and value effects will be shown here. Unknowns remain explicit.</p></div></div></div></>;
}
