import Link from "next/link";
import type { WikiPage, WikiSection } from "./wiki-data";
import { WIKI_PAGES } from "./wiki-data";
import styles from "./page.module.css";

function WikiDiagram({ steps }: { steps: NonNullable<WikiSection["diagram"]> }) {
  return (
    <ol className={styles.diagram}>
      {steps.map((step, index) => (
        <li className={styles.diagramStep} key={step.label}>
          <span className={styles.diagramNumber}>{index + 1}</span>
          <strong>{step.label}</strong>
          <p>{step.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function WikiTable({ table }: { table: NonNullable<WikiSection["table"]> }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WikiSectionView({ section }: { section: WikiSection }) {
  return (
    <section className={styles.section} id={section.id}>
      {section.image ? (
        <div className={styles.sectionImageFrame}>
          <img src={section.image} alt="" loading="lazy" />
        </div>
      ) : null}
      <div className={styles.sectionHeader}>
        {section.eyebrow ? <p className={styles.eyebrow}>{section.eyebrow}</p> : null}
        <h2>{section.title}</h2>
        {section.body ? <p>{section.body}</p> : null}
      </div>

      {section.bullets ? (
        <ul className={styles.noteList}>
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {section.diagram ? <WikiDiagram steps={section.diagram} /> : null}
      {section.table ? <WikiTable table={section.table} /> : null}

      {section.cards ? (
        <div className={styles.cardGrid}>
          {section.cards.map((card) => (
            <article className={styles.infoCard} key={card.title}>
              {card.image ? (
                <div className={styles.cardImageFrame}>
                  <img src={card.image} alt="" loading="lazy" />
                </div>
              ) : null}
              {card.eyebrow ? <p className={styles.cardEyebrow}>{card.eyebrow}</p> : null}
              <h3>{card.title}</h3>
              {card.body ? <p>{card.body}</p> : null}
              {card.bullets ? (
                <ul className={styles.compactList}>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function WikiPageView({ page }: { page: WikiPage }) {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        {page.heroImage ? (
          <img className={styles.heroImage} src={page.heroImage} alt="" />
        ) : null}
        <div className={styles.heroShade} />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Project-A Season 4 wiki</p>
          <h1>{page.title}</h1>
          <p>{page.subtitle}</p>
          <div className={styles.heroActions}>
            <Link href="/" className={styles.linkButton}>
              Back to battlefield
            </Link>
            <Link href="/patch-notes" className={styles.linkButton}>
              Patch notes
            </Link>
          </div>
        </div>
      </header>

      {page.highlights ? (
        <section className={styles.highlights} aria-label="Page highlights">
          {page.highlights.map((highlight) => (
            <p key={highlight}>{highlight}</p>
          ))}
        </section>
      ) : null}

      <nav className={styles.pageNav} aria-label="Wiki pages">
        {WIKI_PAGES.map((wikiPage) => (
          <Link href={`/wiki/${wikiPage.slug}`} key={wikiPage.slug}>
            <span>{wikiPage.navIcon}</span>
            {wikiPage.navLabel}
          </Link>
        ))}
      </nav>

      <div className={styles.stack}>
        {page.sections.map((section) => (
          <WikiSectionView key={section.id} section={section} />
        ))}
      </div>
    </article>
  );
}
