"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "./tutorial-panel.module.css";

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  link?: { href: string; label: string };
  autoCheck?: (state: TutorialState) => boolean;
};

export type TutorialState = {
  hasBattalions: boolean;
  hasAssignedWorkers: boolean;
  hasOwnedTiles: boolean;
  hasTradePartners: boolean;
  hasAllies: boolean;
  battlefieldsJoined: boolean;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "find-fortress",
    title: "Find your fortress",
    description:
      "You're on the map! Click your fortress marker to open the command dock. Zoom and pan to explore the battlefield.",
    autoCheck: () => true, // Always shown first, manually checked
  },
  {
    id: "assign-workers",
    title: "Assign workers",
    description:
      "Go to Castle → Economy tab. Assign miners for gold, farmers for food, and recruiters for army.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasAssignedWorkers,
  },
  {
    id: "commission-battalion",
    title: "Commission a battalion",
    description:
      "In Castle, scroll to Battalions and click Commission. Set its mode to GUARD (defense), ATTACK (offense), or RESERVE (recovery).",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasBattalions,
  },
  {
    id: "claim-tile",
    title: "Claim your first tile",
    description:
      "Go to Castle → Expansion tab. Set a pressure priority on an adjacent tile. At 600 pressure, the tile becomes yours.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasOwnedTiles,
  },
  {
    id: "open-trade",
    title: "Open trade",
    description:
      "Go to Politics → find a neighbor with 'Trade' available. Send gold, food, or army. Convoys build roads over time.",
    link: { href: "/politics", label: "Open Politics" },
    autoCheck: (state) => state.hasTradePartners,
  },
  {
    id: "propose-alliance",
    title: "Propose an alliance",
    description:
      "In Politics, propose an alliance with a neighbor. You can include resource or tile terms. Allies share escrow against betrayal.",
    link: { href: "/politics", label: "Open Politics" },
    autoCheck: (state) => state.hasAllies,
  },
  {
    id: "explore-wiki",
    title: "Explore the wiki",
    description:
      "Read the wiki for deeper strategy: races, economy, combat, diplomacy, and trade mechanics.",
    link: { href: "/wiki/getting-started", label: "Open Wiki" },
  },
];

const STORAGE_KEY = "project-a:tutorial-steps";

function loadCompletedSteps(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCompletedSteps(steps: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]));
}

export function TutorialPanel({
  state,
  collapsed: forceCollapsed,
  onToggleCollapse,
}: {
  state: TutorialState | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  // Don't render if no player data
  if (!state) return null;
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(() =>
    loadCompletedSteps()
  );
  const [collapsed, setCollapsed] = useState(
    forceCollapsed ?? false
  );

  // Auto-check steps based on game state
  useEffect(() => {
    const newCompleted = new Set(completedSteps);
    let changed = false;
    for (const step of TUTORIAL_STEPS) {
      if (!newCompleted.has(step.id) && step.autoCheck?.(state)) {
        newCompleted.add(step.id);
        changed = true;
      }
    }
    if (changed) {
      setCompletedSteps(newCompleted);
      saveCompletedSteps(newCompleted);
    }
  }, [state, completedSteps]);

  const toggleStep = useCallback(
    (stepId: string) => {
      const next = new Set(completedSteps);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      setCompletedSteps(next);
      saveCompletedSteps(next);
    },
    [completedSteps]
  );

  const allDone = TUTORIAL_STEPS.every((s) => completedSteps.has(s.id));
  const doneCount = TUTORIAL_STEPS.filter((s) => completedSteps.has(s.id)).length;

  const handleToggle = () => {
    setCollapsed((c) => !c);
    onToggleCollapse?.();
  };

  // Always render something — collapsed state is a small badge
  if (collapsed || (allDone && !forceCollapsed)) {
    return (
      <button
        type="button"
        className={styles.collapsedBadge}
        onClick={handleToggle}
        title={`Tutorial (${doneCount}/${TUTORIAL_STEPS.length} done)`}
      >
        ?
      </button>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          📖 Getting Started ({doneCount}/{TUTORIAL_STEPS.length})
        </span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={handleToggle}
          title="Minimize"
        >
          _
        </button>
      </div>
      <ol className={styles.steps}>
        {TUTORIAL_STEPS.map((step) => {
          const done = completedSteps.has(step.id);
          return (
            <li
              key={step.id}
              className={`${styles.step} ${done ? styles.stepDone : ""}`}
            >
              <div className={styles.stepContent}>
                <span className={styles.stepTitle}>
                  {done ? "✅" : "⬜"} {step.title}
                </span>
                <p className={styles.stepDesc}>{step.description}</p>
                <div className={styles.stepActions}>
                  {step.link ? (
                    <Link href={step.link.href} className={styles.stepLink}>
                      {step.link.label} →
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={styles.stepCheck}
                    onClick={() => toggleStep(step.id)}
                  >
                    {done ? "Undo" : "Done"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Hook to compute tutorial state from game data */
export function useTutorialState(playerSummary: any): TutorialState {
  return {
    hasBattalions: (playerSummary?.battalions?.length ?? 0) > 0,
    hasAssignedWorkers:
      (playerSummary?.minersAssigned ?? 0) > 0 ||
      (playerSummary?.farmersAssigned ?? 0) > 0,
    hasOwnedTiles: (playerSummary?.ownedTileCount ?? 0) > 1,
    hasTradePartners: (playerSummary?.hasTradePartners as boolean) ?? false,
    hasAllies: (playerSummary?.hasAllies as boolean) ?? false,
    battlefieldsJoined: (playerSummary?.battlefieldsJoined as number ?? 0) > 0,
  };
}
