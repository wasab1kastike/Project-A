import styles from "./leaderboard-panel.module.css";
import { type HomePageState } from "@/lib/game/read-model";

type LeaderboardPanelProps = {
  leaderboard: HomePageState["leaderboard"];
  playerSummary: HomePageState["playerSummary"];
  isSpectator: boolean;
};

export function LeaderboardPanel({
  leaderboard,
  playerSummary,
  isSpectator,
}: LeaderboardPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.label}>Leaderboard</span>
        <h2>Top 3 fortresses</h2>
      </div>

      {leaderboard.length === 0 ? (
        <p className={styles.emptyState}>
          No fortresses have joined the current cycle yet.
        </p>
      ) : (
        <ol className={styles.list}>
          {leaderboard.map((entry) => (
            <li
              key={entry.id}
              className={entry.isCurrentUser ? styles.currentUserRow : styles.row}
            >
              <span className={styles.rank}>#{entry.rank}</span>
              <div className={styles.nameBlock}>
                <strong>{entry.name}</strong>
                {entry.isCurrentUser ? <span>You</span> : null}
              </div>
              <span className={styles.points}>{entry.points} pts</span>
            </li>
          ))}
        </ol>
      )}

      <div className={styles.summary}>
        <span className={styles.label}>
          {isSpectator ? "Session" : "Your fortress"}
        </span>
        {playerSummary ? (
          <>
            <strong className={styles.summaryName}>{playerSummary.name}</strong>
            <p className={styles.summaryText}>
              {playerSummary.points} pts · {playerSummary.currentAction}
              {playerSummary.currentTargetName
                ? ` -> ${playerSummary.currentTargetName}`
                : ""}
            </p>
          </>
        ) : (
          <p className={styles.summaryText}>
            Read-only mode. Join during registration to appear on the board.
          </p>
        )}
      </div>
    </div>
  );
}
