"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CHAIN_ID = 61999;
const CHAIN_HEX = "0xf22f";
const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";

const nav = [
  ["Console", "/app"],
  ["Mandates", "/mandates"],
  ["Executions", "/executions"],
  ["Activity", "/activity"],
  ["Integrate", "/integrate"],
] as const;

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function NavigationHeader() {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

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

  async function connectWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("Please install an EIP-1193 compatible wallet (such as MetaMask) to sign on GenLayer Studionet.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.[0]) throw new Error("No account authorized");

      let chain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
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
                  rpcUrls: [RPC],
                  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
                  blockExplorerUrls: [EXPLORER],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }
      setWallet(accounts[0]);
    } catch (err: any) {
      console.error("Wallet connection error:", err);
    } finally {
      setConnecting(false);
    }
  }

  // 1. Landing Page Header: Only brand + section anchors + "⚡ Enter App"
  if (pathname === "/") {
    return (
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="Firewall home">
          <span className="brand-mark">F</span>
          <span>
            FIREWALL<span style={{ color: "var(--accent)" }}>.</span>
          </span>
        </Link>
        <nav className="landing-nav" aria-label="Landing navigation">
          <a href="#gap">Governance Gap</a>
          <a href="#how">How it Works</a>
          <a href="#live-proof">Live Proof</a>
          <a href="#model">Trust Model</a>
          <a
            href="https://github.com/GIFTEDLOV/firewall"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <Link className="button enter-app-btn" href="/app">
          ⚡ Enter App <span aria-hidden="true">↗</span>
        </Link>
      </header>
    );
  }

  // 2. Workspace Topbar: Internal workspace nav + Studionet chip + Connect Wallet
  return (
    <header className="topbar">
      <Link className="brand" href="/app" aria-label="Firewall workspace">
        <span className="brand-mark">F</span>
        <span>FIREWALL</span>
      </Link>
      <nav className="topnav" aria-label="Primary navigation">
        {nav.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            style={
              pathname === href || (href !== "/app" && pathname.startsWith(href))
                ? { color: "var(--text)", borderColor: "var(--accent)" }
                : undefined
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="network-chip">
        <span className="status-dot" />
        STUDIONET · CHAIN 61999
      </div>
      <button
        type="button"
        className="button secondary"
        style={{ minHeight: 34, padding: "0 14px", fontSize: 11 }}
        onClick={connectWallet}
        disabled={connecting}
      >
        {connecting ? (
          "Connecting…"
        ) : wallet ? (
          <>
            <span
              className="status-dot"
              style={{ width: 6, height: 6, display: "inline-block" }}
            />{" "}
            {short(wallet)}
          </>
        ) : (
          "Connect Wallet ↗"
        )}
      </button>
    </header>
  );
}
