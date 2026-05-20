import Link from "next/link";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getCastlePageState } from "@/lib/game/castle-read-model";
import { CastleManagement } from "./castle-management";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function CastleLoadError({ errorId }: { errorId: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar} aria-label="Castle navigation">
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>Castle management</span>
            <h1>Castle temporarily unavailable</h1>
          </div>
          <Link href="/">Battlefield</Link>
        </nav>
        <section className={`${styles.panel} ${styles.errorPanel}`}>
          <span className={styles.eyebrow}>Status</span>
          <h2>Castle management needs a moment.</h2>
          <p>
            The battlefield is still available. Try castle management again in a
            moment.
          </p>
          <p className={styles.muted}>Error reference: {errorId}</p>
        </section>
      </div>
    </main>
  );
}

export default async function CastlePage() {
  let session: Session | null = null;

  try {
    session = await auth();
  } catch (error) {
    console.error("Failed to load castle session", error);
    redirect("/?error=Sign%20in%20again%20to%20manage%20your%20castle.");
  }

  if (!session?.user?.id) {
    redirect("/?error=Sign%20in%20to%20manage%20your%20castle.");
  }

  let state: Awaited<ReturnType<typeof getCastlePageState>>;

  try {
    state = await getCastlePageState({
      userId: session.user.id,
    });
  } catch (error) {
    const errorId = "castle-load-error";
    console.error("Failed to load castle page state", {
      errorId,
      userId: session.user.id,
      error,
    });
    return <CastleLoadError errorId={errorId} />;
  }

  if (!state.playerSummary) {
    redirect("/?error=Join%20a%20cycle%20before%20managing%20a%20castle.");
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar} aria-label="Castle navigation">
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>Castle management</span>
            <h1>{state.playerSummary.name}</h1>
          </div>
          <Link href="/">Battlefield</Link>
        </nav>
        <CastleManagement
          playerSummary={state.playerSummary}
          targets={state.availableTargets}
        />
      </div>
    </main>
  );
}
