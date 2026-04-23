import Link from "next/link";
import styles from "./page.module.css";
import {
  PATCH_NOTES_RELEASES,
  getPatchNotesPageState,
} from "@/lib/game/patch-notes";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function formatReleaseDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export default function PatchNotesPage() {
  const state = getPatchNotesPageState(PATCH_NOTES_RELEASES);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Patch notes</p>
          <h1>What changed on the battlefield.</h1>
          <p>
            Review the latest player-facing updates in two quick passes: new
            features and bug fixes.
          </p>
          <p>
            These notes are the readable game-facing summary. The repo
            changelog stays separate for development and audit detail.
          </p>
        </div>

        <div className={styles.navRow}>
          <Link className={styles.linkButton} href="/">
            Back to battlefield
          </Link>
          <Link className={styles.linkButton} href="/history">
            Open cycle archive
          </Link>
        </div>
      </section>

      <section className={styles.stack}>
        {state.isEmpty ? (
          <article className={styles.card}>
            <span className={styles.sectionLabel}>No patch notes yet</span>
            <h2>The first release notes will appear here after the next update.</h2>
            <p>
              Once player-facing changes are shipped, this page will list them
              under New features and Bug fixes.
            </p>
          </article>
        ) : (
          state.releases.map((release) => (
            <article className={styles.card} key={release.date}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.sectionLabel}>
                    Release {release.date}
                  </span>
                  <h2>{release.title ?? formatReleaseDate(release.date)}</h2>
                  <p>{formatReleaseDate(release.date)}</p>
                </div>
              </div>

              <div className={styles.categoryGrid}>
                <section className={styles.categoryCard}>
                  <h3>New features</h3>
                  <ul className={styles.noteList}>
                    {release.newFeatures.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>

                <section className={styles.categoryCard}>
                  <h3>Bug fixes</h3>
                  <ul className={styles.noteList}>
                    {release.bugFixes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

