import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portinel — Cyber Reconnaissance Platform",
  description:
    "Production-grade attack-surface intelligence: port scanning, SSL/TLS analysis, HTTP fingerprinting, subdomain enumeration and AI-driven risk scoring.",
  applicationName: "Portinel",
  authors: [{ name: "Portinel" }],
  keywords: [
    "reconnaissance",
    "security",
    "attack surface",
    "port scanner",
    "ssl analysis",
    "osint",
    "penetration testing",
  ],
};

export const viewport: Viewport = {
  themeColor: "#060912",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body
        className="antialiased"
        style={{
          fontFamily:
            "var(--font-inter), var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
