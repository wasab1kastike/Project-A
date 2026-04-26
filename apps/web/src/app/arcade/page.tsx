import Link from "next/link";
import { auth } from "@/auth";
import { BuildArcadeGame } from "@/components/build-arcade-game";
import styles from "./page.module.css";
import { submitBuildArcadeScoreAction } from "@/app/game-actions";
import { getBuildArcadePageState } from "@/lib/game/build-arcade";

export const dynamic = "force-dynamic";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "Unknown";
}

export default async function ArcadePage() {
  const session = await auth();
  const state = await getBuildArcadePageState({
    userId: session?.user?.id,
  });

  const rewardLabel = state.bestRewardVariant
    ? `${state.bestRewardVariant} skin`
    : null;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.sectionLabel}>Arcade</span>
          <h1>Build phase mini game</h1>
          <p>
            The build phase runs while the next season is being prepared.
            Clear the board, unlock a skin, and head back when the next season
            goes live.
          </p>
        </div>
        <div className={styles.meta}>
          <div>
            <span>Build ends</span>
            <strong>{formatDateTime(state.buildEndsAt)}</strong>
          </div>
          <div>
            <span>Best score</span>
            <strong>{state.bestScore}</strong>
          </div>
          <div>
            <span>Skin</span>
            <strong>{rewardLabel ?? "Locked"}</strong>
          </div>
        </div>
      </header>

      {state.cycleId && state.canPlay ? (
        <BuildArcadeGame
          cycleId={state.cycleId}
          canPlay={state.canPlay}
          bestScore={state.bestScore}
          currentRewardVariant={state.currentRewardVariant}
          rewardPreviewLabel={state.nextRewardLabel}
          onSubmitScore={submitBuildArcadeScoreAction}
        />
      ) : (
        <section className={styles.lockedCard}>
          <span className={styles.sectionLabel}>Locked</span>
          <h2>The arcade opens during the build phase.</h2>
          <p>{state.submissionHint}</p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/">
              Back to home
            </Link>
            <Link className={styles.primaryButton} href="/history">
              Open history
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
