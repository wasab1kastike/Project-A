"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./tutorial-panel.module.css";

type TutorialStep = {
  id: string;
  phase: string;
  title: string;
  objective: string;
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
    objective: "Start from the map.",
    description:
      "Click your fortress marker to open the command dock. The map is the main screen; Castle and Diplomacy support it.",
  },
  {
    id: "assign-workers",
    phase: "Castle",
    title: "Assign economy workers",
    objective: "Set your first economy split.",
    description:
      "Open Castle and assign miners for gold, farmers for food, and recruiters for queue processing.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasAssignedWorkers,
  },
  {
    id: "assign-pressure",
    phase: "Expansion",
    title: "Assign pressure workers",
    objective: "Start border pressure.",
    description:
      "Put workers into your race pressure lane, then choose connected neutral border priorities from the battlefield map.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasPressureWorkers,
  },
  {
    id: "order-recruits",
    phase: "Army",
    title: "Order paid recruits",
    objective: "Queue army with gold.",
    description:
      "Recruitment is not free passive growth. Spend gold on army orders; recruiters turn that queue into active army over ticks.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasRecruitmentQueued,
  },
  {
    id: "commission-battalion",
    phase: "Army",
    title: "Commission a battalion",
    objective: "Make army usable.",
    description:
      "Create a battalion so army can guard, attack, stay in reserve, or reinforce allies through standing modes.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasBattalions,
  },
  {
    id: "claim-tile",
    phase: "Expansion",
    title: "Claim your first tile",
    objective: "Expand beyond your castle.",
    description:
      "Pressure reaches 600 on a connected neutral tile to claim it if nobody is tied with you.",
    link: { href: "/wiki/expansion", label: "Expansion guide" },
    autoCheck: (state) => state.hasOwnedTiles,
  },
  {
    id: "open-trade",
    phase: "Politics",
    title: "Open trade",
    objective: "Send a convoy offer.",
    description:
      "Use the Castle Diplomacy tab to send gold, food, army, or allied tile deeds. Accepted cargo travels by convoy and can build roads.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasTradePartners,
  },
  {
    id: "propose-alliance",
    phase: "Politics",
    title: "Propose an alliance",
    objective: "Choose a treaty partner.",
    description:
      "Alliances use trust tiers and optional break collateral. Betrayal hurts, so choose partners with intent.",
    link: { href: "/castle", label: "Open Castle" },
    autoCheck: (state) => state.hasAllies,
  },
  {
    id: "learn-war",
    phase: "War",
    title: "Learn campaigns before war",
    objective: "Understand planned fighting.",
    description:
      "Season 4 fighting is planned through war fronts, campaign pressure, siege warnings, and battlefields.",
    link: { href: "/wiki/combat", label: "Combat guide" },
    autoCheck: (state) => state.battlefieldsJoined,
  },
  {
    id: "legacy-note",
    phase: "Rules",
    title: "Know retired PvE",
    objective: "Avoid legacy targets.",
    description:
      "Home of A and loot camps are not live Season 4 targets. If you see those names, they are legacy history.",
    link: { href: "/wiki/legacy", label: "Legacy rules" },
  },
];

const STORAGE_KEY = "project-a:tutorial-steps:v3";
const ACTIVE_STEP_STORAGE_KEY = "project-a:tutorial-active-step:v1";

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

function loadActiveStepId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_STEP_STORAGE_KEY);
}

function saveActiveStepId(stepId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_STEP_STORAGE_KEY, stepId);
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
  const [activeStepId, setActiveStepId] = useState<string | null>(() =>
    loadActiveStepId()
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

  const { activeIndex, activeStep, allDone, doneCount, nextStep, progressPercent } =
    useMemo(() => {
      const completedCount = TUTORIAL_STEPS.filter((step) =>
        completedSteps.has(step.id)
      ).length;
      const firstIncomplete = TUTORIAL_STEPS.find(
        (step) => !completedSteps.has(step.id)
      );
      const selectedStep =
        TUTORIAL_STEPS.find((step) => step.id === activeStepId) ??
        firstIncomplete ??
        TUTORIAL_STEPS[0];

      return {
        activeIndex: TUTORIAL_STEPS.findIndex(
          (step) => step.id === selectedStep.id
        ),
        activeStep: selectedStep,
        allDone: TUTORIAL_STEPS.every((step) => completedSteps.has(step.id)),
        doneCount: completedCount,
        nextStep: firstIncomplete,
        progressPercent: Math.round(
          (completedCount / TUTORIAL_STEPS.length) * 100
        ),
      };
    }, [activeStepId, completedSteps]);

  useEffect(() => {
    if (activeStepId !== null || !nextStep) return;
    setActiveStepId(nextStep.id);
    saveActiveStepId(nextStep.id);
  }, [activeStepId, nextStep]);

  useEffect(() => {
    if (!activeStepId || !completedSteps.has(activeStepId)) return;

    const nextIncomplete = TUTORIAL_STEPS.find(
      (step) => !completedSteps.has(step.id)
    );

    if (nextIncomplete) {
      setActiveStepId(nextIncomplete.id);
      saveActiveStepId(nextIncomplete.id);
    }
  }, [activeStepId, completedSteps]);

  const handleToggle = () => {
    setCollapsed((current) => !current);
    onToggleCollapse?.();
  };

  const goToStep = (stepId: string) => {
    setActiveStepId(stepId);
    saveActiveStepId(stepId);
  };

  const goByOffset = (offset: number) => {
    const nextIndex =
      (activeIndex + offset + TUTORIAL_STEPS.length) % TUTORIAL_STEPS.length;
    goToStep(TUTORIAL_STEPS[nextIndex].id);
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
            {allDone ? "Guide complete" : `Next: ${nextStep?.title ?? activeStep.title}`}
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
        <span>{doneCount}/{TUTORIAL_STEPS.length}</span>
        <div className={styles.progressTrack}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className={styles.stepRail} aria-label="Tutorial steps">
        {TUTORIAL_STEPS.map((step, index) => {
          const done = completedSteps.has(step.id);
          const active = step.id === activeStep.id;

          return (
            <button
              key={step.id}
              type="button"
              className={styles.railDot}
              data-active={active}
              data-done={done}
              onClick={() => goToStep(step.id)}
              title={`${index + 1}. ${step.title}`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <section className={styles.focusStep} aria-live="polite">
        <div className={styles.stepMeta}>
          <span>{activeStep.phase}</span>
          <strong>Step {activeIndex + 1}</strong>
        </div>
        <h2>{activeStep.title}</h2>
        <p className={styles.objective}>{activeStep.objective}</p>
        <p className={styles.stepDesc}>{activeStep.description}</p>
        <div className={styles.stepActions}>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => goByOffset(-1)}
          >
            Back
          </button>
          {activeStep.link ? (
            <Link href={activeStep.link.href} className={styles.stepLink}>
              {activeStep.link.label}
            </Link>
          ) : null}
          <button
            type="button"
            className={styles.stepCheck}
            data-done={completedSteps.has(activeStep.id)}
            onClick={() => toggleStep(activeStep.id)}
          >
            {completedSteps.has(activeStep.id) ? "Completed" : "Mark done"}
          </button>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => goByOffset(1)}
          >
            Next
          </button>
        </div>
      </section>

      <details className={styles.stepDrawer}>
        <summary>All steps</summary>
        <ol className={styles.stepList}>
          {TUTORIAL_STEPS.map((step) => (
            <li key={step.id} data-done={completedSteps.has(step.id)}>
              <button type="button" onClick={() => goToStep(step.id)}>
                <span>{step.phase}</span>
                <strong>{step.title}</strong>
              </button>
            </li>
          ))}
        </ol>
      </details>
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
