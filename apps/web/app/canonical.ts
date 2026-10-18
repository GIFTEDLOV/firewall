import { unstable_noStore as noStore } from "next/cache";
import { createCanonicalReaderFromEnv, type CanonicalLiveReadModel } from "@firewall/genlayer-client";

export type CanonicalPageState =
  | { readonly status: "READY"; readonly model: CanonicalLiveReadModel }
  | { readonly status: "UNAVAILABLE"; readonly error: string };

type CanonicalReadGlobal = typeof globalThis & { __firewallCanonicalReadFlight?: Promise<CanonicalPageState> };

function isRetryableReadError(error: unknown): boolean {
  let current: unknown = error;
  const messages: string[] = [];
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else if (typeof current === "object" && current !== null) {
      const detail = current as Record<string, unknown>;
      if (typeof detail.message === "string") messages.push(detail.message);
      if (typeof detail.shortMessage === "string") messages.push(detail.shortMessage);
      current = detail.cause;
    } else {
      messages.push(String(current));
      break;
    }
  }
  return /invalid transaction is rolled back|temporarily unavailable|\b429\b|\b502\b|\b503\b|\b504\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(messages.join(" "));
}

async function readLiveCanonical(): Promise<CanonicalPageState> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return { status: "READY", model: await createCanonicalReaderFromEnv().read() };
    } catch (error) {
      if (attempt < 2 && isRetryableReadError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      return { status: "UNAVAILABLE", error: error instanceof Error ? error.message : "CANONICAL_READ_UNAVAILABLE" };
    }
  }
  return { status: "UNAVAILABLE", error: "CANONICAL_READ_UNAVAILABLE" };
}

export async function loadCanonical(): Promise<CanonicalPageState> {
  noStore();
  if (process.env.NODE_ENV !== "production" && process.env.FIREWALL_TEST_CANONICAL === "1") {
    const { canonicalTestFixture } = await import("./canonical-test-fixture");
    return { status: "READY", model: canonicalTestFixture };
  }

  const scope = globalThis as CanonicalReadGlobal;
  if (scope.__firewallCanonicalReadFlight) return scope.__firewallCanonicalReadFlight;
  const flight = readLiveCanonical();
  scope.__firewallCanonicalReadFlight = flight;
  try {
    return await flight;
  } finally {
    if (scope.__firewallCanonicalReadFlight === flight) delete scope.__firewallCanonicalReadFlight;
  }
}
