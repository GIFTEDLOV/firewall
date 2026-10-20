import Link from "next/link";
import { CanonicalNetwork, CanonicalUnavailable } from "../canonical-ui";
import { loadCanonical } from "../canonical";
import { PageHeading } from "../ui";

export const dynamic = "force-dynamic";

export default async function MandatesPage() {
  const state = await loadCanonical();
  if (state.status === "UNAVAILABLE") {
    return (
      <>
        <PageHeading
          eyebrow="Mandates"
          title="Frozen governance intent"
          lede="A mandate becomes immutable once proposal identity, text bytes, constraints, and source provenance are bound."
          action={<Link className="button" href="/mandates/new">+ Create Custom Mandate</Link>}
        />
        <CanonicalUnavailable error={state.error} />
      </>
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="Mandates"
        title="Frozen governance intent"
        lede="A mandate becomes immutable once proposal identity, text bytes, constraints, and source provenance are bound on GenLayer Studionet."
        action={<Link className="button" href="/mandates/new">+ Create Custom Mandate</Link>}
      />
      <CanonicalNetwork model={state.model} />
      <div className="panel">
        <div className="panel-header">
          <h2>Canonical mandates</h2>
          <span className="status safe"><span className="status-dot" />CANONICAL RECORDS</span>
        </div>
        {state.model.mandates.length === 0 ? (
          <div className="empty">
            <strong>No canonical mandates</strong>
            The deployed contract returned an empty mandate array.
          </div>
        ) : (
          <div className="audit-list">
            {state.model.mandates.map((mandate) => (
              <div className="audit-row" key={mandate.mandateId}>
                <Link className="audit-id" href={`/mandates/${mandate.mandateId}`}>
                  {mandate.mandateId}
                </Link>
                <div className="audit-kind">
                  <span className={`status ${mandate.state === "MANDATE_FROZEN" ? "safe" : "pending"}`} style={{ marginRight: 6 }}>
                    {mandate.state}
                  </span>
                  {mandate.proposalExternalId}
                </div>
                <div className="audit-time">
                  Chain {mandate.governanceChainId} · v{mandate.mandateVersion}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
