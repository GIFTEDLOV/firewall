import type { Metadata } from "next";
import "./globals.css";
import { NavigationHeader } from "./nav-header";

export const metadata: Metadata = {
  title: "Firewall · Semantic execution security",
  description: "Semantic execution security for on-chain governance. Bind what governance approved to what will actually execute.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="console-shell">
          <NavigationHeader />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
