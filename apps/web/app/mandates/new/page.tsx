import Link from "next/link";
import { PageHeading } from "../../ui";
import { MandateImportForm } from "../../workflow";

export default function NewMandatePage() {
  return <><PageHeading eyebrow="Mandates / capture" title="Capture proposal identity" lede="Import binds authority, source, exact bytes, content hash, and constraints before a mandate can be frozen." action={<Link className="button secondary" href="/mandates">Back to mandates</Link>} /><MandateImportForm /><p className="footer-note">Supported adapters: OpenZeppelin Governor, Safe, and manual canonical import.</p></>;
}
