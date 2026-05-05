import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getHomePageState } from "@/lib/game/read-model";
import { CastleManagement } from "./castle-management";
import styles from "./page.module.css";

export default async function CastlePage() {
  const session = await auth();
  const state = await getHomePageState({
    userId: session?.user?.id,
  });

  if (!session?.user?.id) {
    redirect("/?error=Sign%20in%20to%20manage%20your%20castle.");
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
