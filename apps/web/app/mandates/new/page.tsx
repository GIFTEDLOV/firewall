import Link from "next/link";
import { PageHeading } from "../../ui";
import { CustomMandateCreator } from "./mandate-creator";
import { MandateImportForm } from "../../workflow";

export default function NewMandatePage() {
  return (
    <>
      <PageHeading
        eyebrow="Mandates / create"
        title="Create Mandate on GenLayer"
        lede="Connect your Web3 wallet and commit custom governance mandates directly to the Intelligent Contract on Studionet."
        action={
          <Link className="button secondary" href="/mandates">
            ← Back to mandates
          </Link>
        }
      />
      <CustomMandateCreator />

      <div style={{ marginTop: 45 }}>
        <div className="panel-header" style={{ marginBottom: 12 }}>
          <h2>Pre-Chain Analysis / Local Workspace</h2>
        </div>
        <MandateImportForm />
      </div>

      <p className="footer-note">
        Every on-chain mandate is verified and stored immutably on GenLayer Studionet (Chain ID 61999).
        Once frozen, no party can modify or rewrite the approved policy.
      </p>
    </>
  );
}
