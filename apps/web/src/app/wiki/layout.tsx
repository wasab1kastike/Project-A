import Link from "next/link";
import { ReactNode } from "react";

const WIKI_PAGES = [
  { slug: "getting-started", label: "Getting Started" },
  { slug: "races", label: "Races" },
  { slug: "economy", label: "Economy" },
  { slug: "combat", label: "Combat" },
  { slug: "diplomacy", label: "Diplomacy" },
  { slug: "trade", label: "Trade" },
  { slug: "abilities", label: "Abilities" },
] as const;

export default function WikiLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", maxWidth: 960, margin: "0 auto", gap: 32 }}>
      <nav style={{ width: 200, flexShrink: 0, paddingTop: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          <Link href="/wiki">Project-A Wiki</Link>
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {WIKI_PAGES.map((page) => (
            <li key={page.slug} style={{ marginBottom: 4 }}>
              <Link
                href={`/wiki/${page.slug}`}
                style={{ fontSize: 14, textDecoration: "none" }}
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, paddingTop: 16, minWidth: 0 }}>{children}</main>
    </div>
  );
}
