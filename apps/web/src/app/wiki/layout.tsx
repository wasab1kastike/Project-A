"use client";

import Link from "next/link";
import { ReactNode } from "react";

const WIKI_PAGES = [
  { slug: "getting-started", label: "Getting Started", icon: "🚀" },
  { slug: "races", label: "Races", icon: "🎭" },
  { slug: "economy", label: "Economy", icon: "💰" },
  { slug: "army", label: "Army & War", icon: "⚔️" },
  { slug: "expansion", label: "Expansion", icon: "🗺️" },
  { slug: "diplomacy", label: "Diplomacy", icon: "🤝" },
  { slug: "trade", label: "Trade", icon: "📦" },
  { slug: "abilities", label: "Abilities", icon: "✨" },
] as const;

export default function WikiLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", maxWidth: 960, margin: "0 auto", gap: 32, minHeight: "100vh", background: "#0d1117", color: "#c9d1d9" }}>
      <nav style={{ width: 220, flexShrink: 0, paddingTop: 24, paddingLeft: 16, borderRight: "1px solid #21262d" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#f0f6fc" }}>
          <Link href="/wiki" style={{ textDecoration: "none", color: "inherit" }}>📖 Project-A Wiki</Link>
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {WIKI_PAGES.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/wiki/${page.slug}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 14,
                  textDecoration: "none",
                  color: "#8b949e",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#21262d"; e.currentTarget.style.color = "#f0f6fc"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8b949e"; }}
              >
                <span>{page.icon}</span>
                <span>{page.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 24, padding: "12px", background: "#161b22", borderRadius: 8, border: "1px solid #21262d" }}>
          <p style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>
            <Link href="/" style={{ color: "#58a6ff" }}>← Back to Battlefield</Link>
          </p>
        </div>
      </nav>
      <main style={{ flex: 1, padding: "24px 16px", minWidth: 0, lineHeight: 1.7, fontSize: 15 }}>
        <style>{`
          main h1 { font-size: 2em; color: #f0f6fc; margin-top: 0; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
          main h2 { font-size: 1.4em; color: #f0f6fc; margin-top: 24px; border-bottom: 1px solid #21262d; padding-bottom: 6px; }
          main h3 { font-size: 1.15em; color: #f0f6fc; margin-top: 18px; }
          main h4 { font-size: 1em; color: #f0f6fc; }
          main table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
          main th { background: #161b22; padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid #30363d; color: #f0f6fc; }
          main td { padding: 6px 12px; border: 1px solid #30363d; }
          main tr:nth-child(even) { background: #0d1117; }
          main code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #f0883e; }
          main a { color: #58a6ff; text-decoration: none; }
          main a:hover { text-decoration: underline; }
          main strong { color: #f0f6fc; }
          main hr { border: none; border-top: 1px solid #21262d; margin: 16px 0; }
          main ul, main ol { padding-left: 20px; }
          main li { margin-bottom: 4px; }
          main blockquote { border-left: 3px solid #30363d; padding-left: 12px; margin: 12px 0; color: #8b949e; }
        `}</style>
        {children}
      </main>
    </div>
  );
}
