"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { WIKI_PAGES } from "./wiki-data";
import styles from "./layout.module.css";

export default function WikiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <h2 className={styles.heading}>
          <Link href="/wiki">Project-A Wiki</Link>
        </h2>
        <nav aria-label="Wiki sections">
          <ul className={styles.navList}>
            {WIKI_PAGES.map((page) => {
              const href = `/wiki/${page.slug}`;
              const isActive =
                pathname === href || (pathname === "/wiki" && page.slug === "getting-started");

              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    className={`${styles.navLink} ${
                      isActive ? styles.navLinkActive : ""
                    }`}
                  >
                    <span className={styles.navIcon}>{page.navIcon}</span>
                    <span>{page.navLabel}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={styles.backLink}>
          <Link href="/">Back to Battlefield</Link>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
