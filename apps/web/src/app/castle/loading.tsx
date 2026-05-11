import styles from "./page.module.css";

export default function CastleLoading() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar} aria-label="Castle navigation">
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>Castle management</span>
            <h1>Loading castle...</h1>
          </div>
        </nav>
      </div>
    </main>
  );
}
