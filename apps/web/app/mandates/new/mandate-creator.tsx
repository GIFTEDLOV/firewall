"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const CANONICAL_CONTRACT = "0x7Ab4Dc9B84f3fDEB90e9795976065F42Ea0b9528";
const CHAIN_ID = 61999;
const CHAIN_HEX = "0xf22f";
const RPC_URL = "https://studio.genlayer.com/api";
const EXPLORER_URL = "https://explorer-studio.genlayer.com";

function short(val: string): string {
  return val.length > 12 ? `${val.slice(0, 6)}…${val.slice(-4)}` : val;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return new Uint8Array(hash);
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function CustomMandateCreator() {
  const [wallet, setWallet] = useState("");
  const [governanceChainId, setGovernanceChainId] = useState("1");
  const [governanceContract, setGovernanceContract] = useState("0x954a62cbc5b48af7342dfd00e40bf2c9f6de9d19");
  const [proposalExternalId, setProposalExternalId] = useState("");
  const [proposalSource, setProposalSource] = useState("https://governance.uniswap.org/proposal/101");
  const [proposalText, setProposalText] = useState(
    "The Safe at 0x954a62cbc5b48af7342dfd00e40bf2c9f6de9d19 may execute batched withdrawals under the approved governance mandate. No new administrator authority. No ownership transfer. No mint authority."
  );

  const [textBytes, setTextBytes] = useState(0);
  const [textSha256, setTextSha256] = useState("");
  const [mandateDigestHex, setMandateDigestHex] = useState("");

  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [createdMandateId, setCreatedMandateId] = useState("");
  const [freezeTxHash, setFreezeTxHash] = useState("");
  const [mandateState, setMandateState] = useState("MANDATE_DRAFT");

  const [liveMandates, setLiveMandates] = useState<any[]>([]);
  const [loadingMandates, setLoadingMandates] = useState(false);

  // Generate random proposal id if empty on mount
  useEffect(() => {
    if (!proposalExternalId) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      setProposalExternalId(`PRP-CUSTOM-DAO-${rand}`);
    }
  }, [proposalExternalId]);

  // Check connected account
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts: any) => {
          if (Array.isArray(accounts) && accounts[0]) {
            setWallet(accounts[0]);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Compute live hashes on input change
  useEffect(() => {
    let active = true;
    const bytes = new TextEncoder().encode(proposalText);
    setTextBytes(bytes.length);

    sha256Bytes(bytes).then(async (hash) => {
      if (!active) return;
      const hashHex = bytesToHex(hash);
      setTextSha256(hashHex);

      const digestSource = new TextEncoder().encode(
        `FIREWALL_MANDATE_V2|${governanceChainId}|${governanceContract}|${hashHex}|1`
      );
      const digestBytes = await sha256Bytes(digestSource);
      if (active) {
        setMandateDigestHex(bytesToHex(digestBytes));
      }
    });

    return () => {
      active = false;
    };
  }, [proposalText, governanceChainId, governanceContract]);

  // Refresh live on-chain mandates
  const fetchLiveMandates = useCallback(async () => {
    setLoadingMandates(true);
    try {
      const res = await fetch("/api/read-model", { cache: "no-store" });
      const json = await res.json();
      if (json.model?.mandates) {
        setLiveMandates(json.model.mandates);
      }
    } catch {
      // Ignore background refresh errors
    } finally {
      setLoadingMandates(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveMandates();
  }, [fetchLiveMandates]);

  async function connectWallet() {
    setErrorMessage("");
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No Web3 wallet found. Please install MetaMask or an EIP-1193 compatible wallet.");
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.[0]) throw new Error("No account authorized");

      let chain = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      if (parseInt(chain, 16) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_HEX }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: CHAIN_HEX,
                  chainName: "GenLayer Studionet",
                  rpcUrls: [RPC_URL],
                  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
                  blockExplorerUrls: [EXPLORER_URL],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }
      setWallet(accounts[0]);
      setStatusMessage(`Connected: ${short(accounts[0])} on Studionet (61999)`);
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
    }
  }

  function fillSample() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    setGovernanceChainId("1");
    setGovernanceContract("0x954a62cbc5b48af7342dfd00e40bf2c9f6de9d19");
    setProposalExternalId(`PRP-SAMPLE-DAO-${rand}`);
    setProposalSource("https://governance.uniswap.org/proposal/101");
    setProposalText(
      "The Safe at 0x954a62cbc5b48af7342dfd00e40bf2c9f6de9d19 may execute batched withdrawals under the approved governance mandate. No new administrator authority. No ownership transfer. No mint authority."
    );
    setStatusMessage("Filled form with sample governance mandate.");
    setErrorMessage("");
  }

  async function handleCreateMandate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setTxHash("");
    setCreatedMandateId("");

    try {
      if (!wallet) {
        throw new Error("Please connect your Web3 wallet to GenLayer Studionet before submitting.");
      }
      if (!governanceChainId || isNaN(Number(governanceChainId)) || Number(governanceChainId) <= 0) {
        throw new Error("Governance Chain ID must be a positive integer.");
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(governanceContract)) {
        throw new Error("Governance Contract must be a valid 40-character 0x hexadecimal address.");
      }
      if (!proposalExternalId.trim()) {
        throw new Error("Proposal External ID cannot be empty.");
      }
      if (!proposalSource.trim()) {
        throw new Error("Proposal Source URL cannot be empty.");
      }
      if (!proposalText.trim()) {
        throw new Error("Proposal Text cannot be empty.");
      }

      setBusy(true);
      setStatusMessage("Preparing cryptographic parameters for GenLayer intelligent consensus...");

      const proposalBytes = new TextEncoder().encode(proposalText);
      const proposalHash = await sha256Bytes(proposalBytes);
      const digestSource = new TextEncoder().encode(
        `FIREWALL_MANDATE_V2|${governanceChainId}|${governanceContract}|${bytesToHex(proposalHash)}|1`
      );
      const mandateDigest = await sha256Bytes(digestSource);

      const [{ createClient }, { studionet }, { TransactionStatus }] = await Promise.all([
        import("genlayer-js"),
        import("genlayer-js/chains"),
        import("genlayer-js/types"),
      ]);

      const client = createClient({
        chain: studionet as any,
        endpoint: RPC_URL,
        account: wallet as `0x${string}`,
        provider: window.ethereum,
      });

      setStatusMessage("Submitting create_mandate transaction to GenLayer Studionet (chain 61999)...");

      const args = [
        BigInt(governanceChainId),
        governanceContract,
        proposalExternalId.trim(),
        proposalHash,
        proposalSource.trim(),
        proposalText,
        proposalHash,
        BigInt(proposalBytes.length),
        1n,
        mandateDigest,
      ];

      const hash = (await client.writeContract({
        address: CANONICAL_CONTRACT as `0x${string}`,
        functionName: "create_mandate",
        args: args as any,
        value: 0n,
      })) as `0x${string}`;

      setTxHash(hash);
      setStatusMessage(`Transaction submitted: ${hash}. Awaiting finalized consensus (do not refresh)...`);

      await client.waitForTransactionReceipt({
        hash: hash as any,
        status: TransactionStatus.FINALIZED,
        retries: 150,
      });

      const tx = await client.getTransaction({ hash: hash as any });
      const receipts = (tx.consensus_data as any)?.leader_receipt ?? [];
      const leader = receipts.find((entry: any) => entry.mode === "leader");
      const validator = receipts.find((entry: any) => entry.mode === "validator");

      const txResult = (tx as any).resultName || (tx as any).result_name;
      if (
        tx.statusName !== "FINALIZED" ||
        txResult !== "MAJORITY_AGREE" ||
        leader?.execution_result !== "SUCCESS"
      ) {
        throw new Error(
          `Transaction completed with status: ${tx.statusName}, result: ${txResult}. Inspect hash: ${hash}`
        );
      }

      // Read back all mandates to find our newly created mandate ID
      const mandates = (await client.readContract({
        address: CANONICAL_CONTRACT as `0x${string}`,
        functionName: "get_mandates",
        args: [],
      })) as any[];

      const matched = mandates.find((m: any) => m.proposal_external_id === proposalExternalId.trim()) || mandates[mandates.length - 1];
      const newId = matched?.mandate_id || "CREATED";
      setCreatedMandateId(newId);
      setMandateState("MANDATE_DRAFT");

      setStatusMessage(`Mandate successfully created on GenLayer Studionet! Mandate ID: ${newId}`);
      await fetchLiveMandates();
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFreezeMandate() {
    if (!createdMandateId || createdMandateId === "CREATED") return;
    setErrorMessage("");
    setStatusMessage("");
    setBusy(true);

    try {
      setStatusMessage(`Submitting freeze_mandate for ${createdMandateId}...`);

      const [{ createClient }, { studionet }, { TransactionStatus }] = await Promise.all([
        import("genlayer-js"),
        import("genlayer-js/chains"),
        import("genlayer-js/types"),
      ]);

      const client = createClient({
        chain: studionet as any,
        endpoint: RPC_URL,
        account: wallet as `0x${string}`,
        provider: window.ethereum,
      });

      const hash = (await client.writeContract({
        address: CANONICAL_CONTRACT as `0x${string}`,
        functionName: "freeze_mandate",
        args: [createdMandateId] as any,
        value: 0n,
      })) as `0x${string}`;

      setFreezeTxHash(hash);
      setStatusMessage(`Freeze transaction submitted: ${hash}. Awaiting finalized consensus...`);

      await client.waitForTransactionReceipt({
        hash: hash as any,
        status: TransactionStatus.FINALIZED,
        retries: 150,
      });

      setMandateState("MANDATE_FROZEN");
      setStatusMessage(`Mandate ${createdMandateId} successfully FROZEN and locked immutably on Studionet!`);
      await fetchLiveMandates();
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid two" style={{ gap: 24 }}>
      {/* LEFT: Custom Mandate Creation Form */}
      <div className="panel">
        <div className="panel-header">
          <h2>Create Custom Mandate</h2>
          <span className={`status ${wallet ? "safe" : "pending"}`}>
            {wallet ? `WALLET: ${short(wallet)}` : "CONNECT WALLET"}
          </span>
        </div>
        <div className="panel-body">
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
            Connect your Web3 wallet to GenLayer Studionet and define your own governance mandate.
            Once created, GenLayer validators independently adjudicate subsequent execution packages against this frozen policy.
          </p>

          {!wallet ? (
            <div className="callout" style={{ marginBottom: 20 }}>
              <strong>Web3 Wallet Required for On-Chain Writes</strong>
              <p style={{ margin: "8px 0 14px", fontSize: 12 }}>
                Connect an injected wallet (such as MetaMask) on GenLayer Studionet (Chain 61999) to sign and commit your custom mandate to the Intelligent Contract.
              </p>
              <button
                type="button"
                className="button"
                onClick={connectWallet}
                disabled={busy}
              >
                Connect Wallet to Studionet (61999) ↗
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                Connected Signer: {wallet}
              </span>
              <button
                type="button"
                className="button secondary"
                style={{ minHeight: 30, padding: "0 10px", fontSize: 10 }}
                onClick={fillSample}
              >
                Fill Example Data
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="callout" style={{ borderColor: "var(--danger)", color: "#fca5a5", marginBottom: 16 }}>
              <strong>Operation Error:</strong> {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div className="callout" style={{ borderColor: "var(--accent)", color: "var(--text)", marginBottom: 16 }}>
              {statusMessage}
              {txHash && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={`${EXPLORER_URL}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                    style={{ fontSize: 11 }}
                  >
                    View create_mandate on GenLayer Explorer ↗
                  </a>
                </div>
              )}
              {freezeTxHash && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={`${EXPLORER_URL}/tx/${freezeTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                    style={{ fontSize: 11 }}
                  >
                    View freeze_mandate on GenLayer Explorer ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {createdMandateId && (
            <div className="panel" style={{ background: "rgba(198, 246, 128, 0.06)", borderColor: "var(--accent)", marginBottom: 20 }}>
              <div className="panel-header">
                <h3 style={{ color: "var(--accent)", margin: 0 }}>On-Chain Mandate Created: {createdMandateId}</h3>
                <span className={`status ${mandateState === "MANDATE_FROZEN" ? "safe" : "pending"}`}>
                  {mandateState}
                </span>
              </div>
              <div className="panel-body">
                <p style={{ fontSize: 12, color: "var(--text)", margin: 0 }}>
                  Proposal: <strong>{proposalExternalId}</strong> · State: <strong>{mandateState}</strong>
                </p>
                {mandateState === "MANDATE_DRAFT" ? (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                      The mandate is currently in DRAFT. Freeze it to make the specification completely immutable before committing execution packages.
                    </p>
                    <button
                      type="button"
                      className="button"
                      onClick={handleFreezeMandate}
                      disabled={busy}
                    >
                      {busy ? "Freezing…" : "🔒 Freeze Mandate on GenLayer ↗"}
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--accent)", marginTop: 10, margin: 0 }}>
                    ✓ This mandate is now permanently FROZEN on-chain.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleCreateMandate} className="form-stack">
            <label>
              <span>Target Governance Chain ID</span>
              <input
                type="number"
                min="1"
                step="1"
                value={governanceChainId}
                onChange={(e) => setGovernanceChainId(e.target.value)}
                placeholder="1 (Ethereum), 11155111 (Sepolia), 42161 (Arbitrum)"
                disabled={busy}
                required
              />
              <span className="field-note" style={{ margin: 0 }}>The EVM chain where the governance proposal was approved.</span>
            </label>

            <label>
              <span>Governance Contract / Safe Address</span>
              <input
                type="text"
                value={governanceContract}
                onChange={(e) => setGovernanceContract(e.target.value)}
                placeholder="0x..."
                disabled={busy}
                required
              />
              <span className="field-note" style={{ margin: 0 }}>The DAO Governor or Gnosis Safe contract address.</span>
            </label>

            <label>
              <span>Proposal External ID</span>
              <input
                type="text"
                value={proposalExternalId}
                onChange={(e) => setProposalExternalId(e.target.value)}
                placeholder="e.g. PRP-CUSTOM-DAO-001"
                disabled={busy}
                required
              />
              <span className="field-note" style={{ margin: 0 }}>Unique identifier for this governance vote or proposal.</span>
            </label>

            <label>
              <span>Proposal Source URL</span>
              <input
                type="url"
                value={proposalSource}
                onChange={(e) => setProposalSource(e.target.value)}
                placeholder="https://..."
                disabled={busy}
                required
              />
              <span className="field-note" style={{ margin: 0 }}>Public canonical URL where the proposal specification is published.</span>
            </label>

            <label>
              <span>Proposal Specification & Mandate Rules</span>
              <textarea
                rows={5}
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                placeholder="Detail what governance approved, including allowed targets, value transfers, and prohibited authority changes..."
                disabled={busy}
                required
              />
              <span className="field-note" style={{ margin: 0 }}>
                The exact policy text that GenLayer intelligent validators will enforce.
              </span>
            </label>

            <div style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="button"
                style={{ width: "100%", minHeight: 46 }}
                disabled={busy || !wallet}
              >
                {busy ? "Processing on GenLayer…" : "🚀 Submit Mandate on GenLayer Studionet"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* RIGHT: Live Cryptographic Verification & On-Chain Mandates */}
      <div>
        {/* Cryptographic Preflight */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <h2>Cryptographic Preflight</h2>
            <span className="status safe">CANONICAL PROTOCOL</span>
          </div>
          <div className="panel-body detail-grid">
            <div>
              <span className="field-label">Target Intelligent Contract</span>
              <span className="mono" style={{ fontSize: 11 }}>{CANONICAL_CONTRACT}</span>
            </div>
            <div>
              <span className="field-label">Target Network</span>
              <span className="mono">GenLayer Studionet · Chain ID 61999 (0xf22f)</span>
            </div>
            <div>
              <span className="field-label">Proposal Text UTF-8 Byte Length</span>
              <span className="mono">{textBytes} bytes</span>
            </div>
            <div>
              <span className="field-label">Proposal Text SHA-256</span>
              <span className="mono" style={{ fontSize: 11 }}>{textSha256 || "Computing…"}</span>
            </div>
            <div>
              <span className="field-label">Computed Mandate Digest</span>
              <span className="mono" style={{ fontSize: 11 }}>{mandateDigestHex || "Computing…"}</span>
            </div>
          </div>
        </div>

        {/* Live Mandates Feed */}
        <div className="panel">
          <div className="panel-header">
            <h2>Live Mandates On-Chain</h2>
            <button
              type="button"
              className="text-link"
              onClick={fetchLiveMandates}
              disabled={loadingMandates}
              style={{ background: "none", border: 0, cursor: "pointer" }}
            >
              {loadingMandates ? "SYNCING…" : "↻ REFRESH"}
            </button>
          </div>
          <div className="panel-body">
            <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>
              Mandates read directly from the pinned contract on Studionet:
            </p>
            {liveMandates.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>
                Loading live mandates from Studionet…
              </div>
            ) : (
              <div className="audit-list">
                {liveMandates.map((m: any) => (
                  <div className="audit-row" key={m.mandateId}>
                    <Link className="audit-id" href={`/mandates/${m.mandateId}`}>
                      {m.mandateId}
                    </Link>
                    <div className="audit-kind">
                      <span className={`status ${m.state === "MANDATE_FROZEN" ? "safe" : "pending"}`} style={{ marginRight: 6 }}>
                        {m.state}
                      </span>
                      {m.proposalExternalId}
                    </div>
                    <div className="audit-time">
                      Chain {m.governanceChainId}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
