import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firewall · Semantic execution security",
  description: "Semantic execution security for on-chain governance. Bind what governance approved to what will actually execute.",
};

const nav = [
  ["Console", "/app"],
  ["Mandates", "/mandates"],
  ["Executions", "/executions"],
  ["Activity", "/activity"],
  ["Integrate", "/integrate"],
] as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="console-shell">
          <header className="topbar">
            <Link className="brand" href="/" aria-label="Firewall home">
              <span className="brand-mark">F</span>
              <span>FIREWALL</span>
            </Link>
            <nav className="topnav" aria-label="Primary navigation">
              {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
            <div className="network-chip"><span className="status-dot" />STUDIO-DEV · READ ONLY</div>
          </header>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
