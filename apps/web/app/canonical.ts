import { unstable_noStore as noStore } from "next/cache";
import { createCanonicalReaderFromEnv, type CanonicalLiveReadModel } from "@firewall/genlayer-client";

export type CanonicalPageState =
  | { readonly status: "READY"; readonly model: CanonicalLiveReadModel }
  | { readonly status: "UNAVAILABLE"; readonly error: string };

export async function loadCanonical(): Promise<CanonicalPageState> {
  noStore();
  try {
    if (process.env.NODE_ENV !== "production" && process.env.FIREWALL_TEST_CANONICAL === "1") {
      const { canonicalTestFixture } = await import("./canonical-test-fixture");
      return { status: "READY", model: canonicalTestFixture };
    }
    return { status: "READY", model: await createCanonicalReaderFromEnv().read() };
  } catch (error) {
    return { status: "UNAVAILABLE", error: error instanceof Error ? error.message : "CANONICAL_READ_UNAVAILABLE" };
  }
}
