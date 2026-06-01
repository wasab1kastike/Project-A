"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./tutorial-panel.module.css";

type TutorialStep = {
  id: string;
  phase: string;
  title: string;
  description: string;
  link?: { href: string; label: string };
  autoCheck?: (state: TutorialState) => boolean;
};

export type TutorialState = {
  hasBattalions: boolean;
  hasAssignedWorkers: boolean;
  hasPressureWorkers: boolean;
  hasRecruitmentQueued: boolean;
  hasOwnedTiles: boolean;
  hasTradePartners: boolean;
  hasAllies: boolean;
  battlefieldsJoined: boolean;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "find-fortress",
    phase: "Map",
    title: "Find your fortress",
    description:
      "Click your fortress marker to open the command dock. The map is the main screen; Castle and Politics support it.",
  },
  {
    id: "assign-workers",
    phase: "Castle",
    title: "Assign economy workers",
    description:
      "Open Castle and assign miners for gold, farmers for food, and recruiters for queue processing.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasAssignedWorkers,
  },
  {
    id: "assign-pressure",
    phase: "Expansion",
    title: "Assign pressure workers",
    description:
      "Put workers into your race pressure lane, then choose connected neutral border priorities from the battlefield map.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasPressureWorkers,
  },
  {
    id: "order-recruits",
    phase: "Army",
    title: "Order paid recruits",
    description:
      "Recruitment is not free passive growth. Spend gold on army orders; recruiters turn that queue into active army over ticks.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasRecruitmentQueued,
  },
  {
    id: "commission-battalion",
    phase: "Army",
    title: "Commission a battalion",
    description:
      "Create a battalion so army can guard, attack, stay in reserve, or reinforce allies through standing modes.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasBattalions,
  },
  {
    id: "claim-tile",
    phase: "Expansion",
    title: "Claim your first tile",
    description:
      "Pressure reaches 600 on a connected neutral tile to claim it if nobody is tied with you.",
    link: { href: "/wiki/expansion", label: "Expansion guide" },
    autoCheck: (state) => state.hasOwnedTiles,
  },
  {
    id: "open-trade",
    phase: "Politics",
    title: "Open trade",
    description:
      "Use Politics to send gold, food, army, or allied tile deeds. Accepted cargo travels by convoy and can build roads.",
    link: { href: "/politics", label: "Open Politics" },
    autoCheck: (state) => state.hasTradePartners,
  },
  {
    id: "propose-alliance",
    phase: "Politics",
    title: "Propose an alliance",
    description:
      "Alliances use escrow and trust tiers. Betrayal hurts, so choose partners with intent.",
    link: { href: "/politics", label: "Open Politics" },
    autoCheck: (state) => state.hasAllies,
  },
  {
    id: "learn-war",
    phase: "War",
    title: "Learn campaigns before war",
    description:
      "Season 4 fighting is planned through war fronts, campaign pressure, siege warnings, and battlefields.",
    link: { href: "/wiki/combat", label: "Combat guide" },
    autoCheck: (state) => state.battlefieldsJoined,
  },
  {
    id: "legacy-note",
    phase: "Rules",
    title: "Know retired PvE",
    description:
      "Home of A and loot camps are not live Season 4 targets. If you see those names, they are legacy history.",
    link: { href: "/wiki/legacy", label: "Legacy rules" },
  },
];

const STORAGE_KEY = "project-a:tutorial-steps:v2";

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
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(() =>
    loadCompletedSteps()
  );
  const [collapsed, setCollapsed] = useState(forceCollapsed ?? false);

  useEffect(() => {
    if (forceCollapsed === undefined) return;
    setCollapsed(forceCollapsed);
  }, [forceCollapsed]);

  useEffect(() => {
    if (!state) return;

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

  const { allDone, doneCount, nextStep, progressPercent } = useMemo(() => {
    const completedCount = TUTORIAL_STEPS.filter((step) =>
      completedSteps.has(step.id)
    ).length;

    return {
      allDone: TUTORIAL_STEPS.every((step) => completedSteps.has(step.id)),
      doneCount: completedCount,
      nextStep: TUTORIAL_STEPS.find((step) => !completedSteps.has(step.id)),
      progressPercent: Math.round((completedCount / TUTORIAL_STEPS.length) * 100),
    };
  }, [completedSteps]);

  const handleToggle = () => {
    setCollapsed((current) => !current);
    onToggleCollapse?.();
  };

  if (!state) return null;

  if (collapsed || (allDone && !forceCollapsed)) {
    return (
      <button
        type="button"
        className={styles.collapsedBadge}
        onClick={handleToggle}
        title={`Guide (${doneCount}/${TUTORIAL_STEPS.length} done)`}
      >
        Guide
      </button>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span className={styles.title}>Season 4 Guide</span>
          <p className={styles.subtitle}>
            Next: {nextStep?.title ?? "Review the wiki"}
          </p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={handleToggle}
          title="Minimize"
        >
          -
        </button>
      </div>

      <div className={styles.progressWrap} aria-label="Tutorial progress">
        <span>
          {doneCount}/{TUTORIAL_STEPS.length}
        </span>
        <div className={styles.progressTrack}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
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
                <span className={styles.stepPhase}>{step.phase}</span>
                <span className={styles.stepTitle}>
                  <span className={styles.stepState} data-done={done}>
                    {done ? "OK" : ""}
                  </span>
                  {step.title}
                </span>
                <p className={styles.stepDesc}>{step.description}</p>
                <div className={styles.stepActions}>
                  {step.link ? (
                    <Link href={step.link.href} className={styles.stepLink}>
                      {step.link.label}
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

/** Hook to compute tutorial state from game data. */
export function useTutorialState(playerSummary: any): TutorialState {
  return {
    hasBattalions: (playerSummary?.battalions?.length ?? 0) > 0,
    hasAssignedWorkers:
      (playerSummary?.minersAssigned ?? 0) > 0 ||
      (playerSummary?.farmersAssigned ?? 0) > 0 ||
      (playerSummary?.recruitersAssigned ?? 0) > 0,
    hasPressureWorkers: (playerSummary?.pressureWorkersAssigned ?? 0) > 0,
    hasRecruitmentQueued:
      (playerSummary?.recruitmentQueue ?? 0) > 0 ||
      (playerSummary?.battalions ?? []).some((b: any) => (b?.size ?? 0) > 0),
    hasOwnedTiles: (playerSummary?.ownedTileCount ?? 0) > 1,
    hasTradePartners: (playerSummary?.hasTradePartners as boolean) ?? false,
    hasAllies: (playerSummary?.hasAllies as boolean) ?? false,
    battlefieldsJoined: ((playerSummary?.battlefieldsJoined as number) ?? 0) > 0,
  };
}
