import Link from "next/link";
import { PageHeading } from "../../ui";
import { ExecutionImportForm } from "../../workflow";

export default function NewExecutionPage() {
  return <><PageHeading eyebrow="Executions / local analysis" title="Analyze candidate package" lede="Import exact target, value, calldata, operation order, and deterministic target facts before semantic adjudication." action={<Link className="button secondary" href="/app">Back to console</Link>} /><div className="grid two"><ExecutionImportForm /><div className="panel"><div className="panel-header"><h2>Evidence prerequisites</h2></div><div className="panel-body"><p className="lede">Target code hash, proxy implementation, ABI provenance, selector decoding, and value effects remain explicit. Unknowns never become approval.</p></div></div></div></>;
}
