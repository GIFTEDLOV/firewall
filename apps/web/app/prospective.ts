import { unstable_noStore as noStore } from "next/cache";
import { createProspectiveReader, type ProspectiveCanonicalModel } from "@firewall/genlayer-client/prospective-reader";

export type ProspectivePageState =
  | { readonly status: "READY"; readonly model: ProspectiveCanonicalModel }
  | { readonly status: "UNAVAILABLE"; readonly error: string };

type ProspectiveReadGlobal = typeof globalThis & { __firewallProspectiveReadFlight?: Promise<ProspectivePageState> };

async function readLiveProspective(): Promise<ProspectivePageState> {
  const address = process.env.FIREWALL_PROSPECTIVE_CONTRACT_ADDRESS;
  const sourceHash = process.env.FIREWALL_PROSPECTIVE_SOURCE_SHA256;
  if (!address || !sourceHash) return { status: "UNAVAILABLE", error: "PROSPECTIVE_DEPLOYMENT_NOT_CONFIGURED" };
  try {
    const reader = createProspectiveReader({ contractAddress: address as `0x${string}`, chainId: 61999, rpcUrl: "https://studio.genlayer.com/api", expectedSourceSha256: sourceHash });
    return { status: "READY", model: await reader.read() };
  } catch (error) {
    return { status: "UNAVAILABLE", error: error instanceof Error ? error.message : "PROSPECTIVE_CANONICAL_READ_UNAVAILABLE" };
  }
}

export async function loadProspective(): Promise<ProspectivePageState> {
  noStore();
  const scope = globalThis as ProspectiveReadGlobal;
  if (scope.__firewallProspectiveReadFlight) return scope.__firewallProspectiveReadFlight;
  const flight = readLiveProspective();
  scope.__firewallProspectiveReadFlight = flight;
  try { return await flight; }
  finally { if (scope.__firewallProspectiveReadFlight === flight) delete scope.__firewallProspectiveReadFlight; }
}
