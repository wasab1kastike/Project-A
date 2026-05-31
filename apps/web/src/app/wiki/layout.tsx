"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import styles from "./layout.module.css";

const WIKI_PAGES = [
  { slug: "getting-started", label: "Getting Started", icon: "🚀" },
  { slug: "races", label: "Races", icon: "🎭" },
  { slug: "economy", label: "Economy", icon: "💰" },
  { slug: "army", label: "Army & War", icon: "⚔️" },
  { slug: "expansion", label: "Expansion", icon: "🗺️" },
  { slug: "combat", label: "Combat", icon: "💥" },
  { slug: "diplomacy", label: "Diplomacy", icon: "🤝" },
  { slug: "trade", label: "Trade", icon: "📦" },
  { slug: "abilities", label: "Abilities", icon: "✨" },
] as const;

export default function WikiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <h2 className={styles.heading}>
          <Link href="/wiki">📖 Project-A Wiki</Link>
        </h2>
        <ul className={styles.navList}>
          {WIKI_PAGES.map((page) => {
            const href = `/wiki/${page.slug}`;
            const isActive = pathname === href;
            return (
              <li key={page.slug}>
                <Link
                  href={href}
                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                >
                  <span className={styles.navIcon}>{page.icon}</span>
                  <span>{page.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className={styles.backLink}>
          <Link href="/">← Back to Battlefield</Link>
        </div>
      </nav>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
