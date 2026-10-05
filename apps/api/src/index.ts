import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CanonicalReadModel, CanonicalStateReader } from "@firewall/indexer";
import { CrashSafeTransactionJournal, FileTransactionJournalStore, type PersistedTransaction } from "@firewall/genlayer-client";
import { createLocalWorkflowState, FirewallApplicationService } from "./services.js";

export type FirewallApiDependencies = { readonly canonical: CanonicalStateReader };

export function createEmptyCanonicalReader(): CanonicalStateReader {
  return { async read(): Promise<CanonicalReadModel> { return { mandates: [], executions: [], adjudications: [], permits: [], asOf: new Date(0).toISOString() }; } };
}

export function createFirewallApi(dependencies: FirewallApiDependencies) {
  const service = new FirewallApplicationService(createLocalWorkflowState(dependencies.canonical));
  return {
    service,
    async getCanonicalReadModel() { return service.readModel(); },
    authority: "CANONICAL_CONTRACT_ONLY" as const,
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

export function createFirewallHttpServer(dependencies: FirewallApiDependencies = { canonical: createEmptyCanonicalReader() }) {
  const api = createFirewallApi(dependencies);
  const journal = new CrashSafeTransactionJournal(new FileTransactionJournalStore("artifacts/local-transaction-journal.json"));
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true, authority: api.authority });
      if (request.method === "GET" && url.pathname === "/api/read-model") return send(response, 200, await api.getCanonicalReadModel());
      if (request.method === "POST" && url.pathname === "/api/transactions/prepare") { const body = await readJson(request) as { id: string; transaction: Omit<PersistedTransaction, "stage"> }; return send(response, 201, journal.prepare(body.id, body.transaction)); }
      const transaction = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
      if (request.method === "GET" && transaction) return send(response, 200, journal.recover(transaction[1]!));
      const transactionBroadcast = url.pathname.match(/^\/api\/transactions\/([^/]+)\/broadcast$/);
      if (request.method === "POST" && transactionBroadcast) { const body = await readJson(request) as { hash: `0x${string}` }; return send(response, 200, journal.recordBroadcast(transactionBroadcast[1]!, body.hash)); }
      if (request.method === "GET" && url.pathname === "/api/mandates") { const model = await api.getCanonicalReadModel(); return send(response, 200, [...model.mandates, ...model.localDrafts]); }
      if (request.method === "POST" && url.pathname === "/api/mandates") return send(response, 201, api.service.saveMandate(api.service.createMandate(await readJson(request))));
      const freeze = url.pathname.match(/^\/api\/mandates\/(MAN-[0-9]{8})\/freeze$/);
      if (request.method === "POST" && freeze) return send(response, 200, api.service.freezeMandate(freeze[1]!));
      const mandate = url.pathname.match(/^\/api\/mandates\/(MAN-[0-9]{8})$/);
      if (request.method === "GET" && mandate) return send(response, 200, api.service.getMandate(mandate[1]!) ?? { error: "MANDATE_NOT_FOUND" });
      if (request.method === "POST" && url.pathname === "/api/executions/analyze") return send(response, 201, api.service.analyzeExecution(await readJson(request) as never));
      const execution = url.pathname.match(/^\/api\/executions\/(EXE-[0-9]{8})$/);
      if (request.method === "GET" && execution) {
        return send(response, 200, api.service.getExecution(execution[1]!) ?? { error: "EXECUTION_NOT_CANONICAL" });
      }
      const evidence = url.pathname.match(/^\/api\/executions\/(EXE-[0-9]{8})\/evidence$/);
      if (request.method === "POST" && evidence) return send(response, 201, api.service.authenticateEvidence(await readJson(request)));
      if (request.method === "GET" && url.pathname === "/api/activity") return send(response, 200, (await api.getCanonicalReadModel()).adjudications);
      return send(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : "BAD_REQUEST" });
    }
  });
}

if (!process.env.VITEST) {
  createFirewallHttpServer().listen(Number(process.env.PORT ?? 4001), "127.0.0.1", () => console.log("Firewall API listening on http://127.0.0.1:4001"));
}
