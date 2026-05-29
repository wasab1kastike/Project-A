"use client";

import { useState } from "react";
import {
  MAX_SKILL_POINTS,
  getRaceSkillTree,
  type RaceSkillTier,
} from "@/lib/game/race-skill-tree";
import type { FortressRace } from "@/lib/game/races";
import styles from "./race-skill-panel.module.css";

type SkillState = {
  race: FortressRace;
  unlockedTiers: Map<string, number>;
  earnedPoints: number;
  totalPurchased: number;
  playerLevel: number;
  tileCount: number;
};

type NodeState = "active" | "unlockable" | "locked";

function getNodeState({
  tier,
  currentTier,
  availablePoints,
  purchasePending,
}: {
  tier: RaceSkillTier;
  currentTier: number;
  availablePoints: number;
  purchasePending: string | null;
}): NodeState {
  if (tier.level <= currentTier) return "active";
  if (
    tier.level === currentTier + 1 &&
    availablePoints > 0 &&
    purchasePending === null
  ) {
    return "unlockable";
  }
  return "locked";
}

export function RaceSkillPanel({
  skillState,
  onPurchase,
}: {
  skillState: SkillState | null;
  onPurchase?: (pathKey: string) => Promise<void>;
}) {
  const [purchasePending, setPurchasePending] = useState<string | null>(null);

  if (!skillState) {
    return (
      <section className={styles.emptyState}>
        Choose a race to unlock its skill tree.
      </section>
    );
  }

  const tree = getRaceSkillTree(skillState.race);
  const { earnedPoints, totalPurchased, unlockedTiers } = skillState;
  const availablePoints = Math.max(
    0,
    Math.min(MAX_SKILL_POINTS, earnedPoints) - totalPurchased
  );
  const capReached = totalPurchased >= MAX_SKILL_POINTS;

  return (
    <section className={styles.panel} aria-label="Race skill tree">
      <div className={styles.tree}>
        <div className={styles.coreNode}>
          <span className={styles.coreEyebrow}>
            {tree.race.replaceAll("_", " ")}
          </span>
          <strong>{availablePoints} available</strong>
          <span>
            {totalPurchased} spent / {MAX_SKILL_POINTS} max
          </span>
        </div>

        {tree.paths.map((path, pathIndex) => {
          const currentTier = unlockedTiers.get(path.key) ?? 0;
          const nextTier = currentTier + 1;
          const isMaxed = currentTier >= path.tiers.length;
          const pathClassName = [
            styles.path,
            pathIndex === 0 ? styles.pathTop : "",
            pathIndex === 1 ? styles.pathLeft : "",
            pathIndex === 2 ? styles.pathRight : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div className={pathClassName} key={path.key}>
              <div className={styles.pathHeader}>
                <strong>{path.name}</strong>
                <span>
                  {currentTier}/{path.tiers.length}
                </span>
                <p>{path.description}</p>
              </div>

              <ol className={styles.tierList}>
                {path.tiers.map((tier) => {
                  const nodeState = getNodeState({
                    tier,
                    currentTier,
                    availablePoints,
                    purchasePending,
                  });
                  const isPending = purchasePending === path.key;
                  const isNextTier = tier.level === nextTier;
                  const canPurchase =
                    nodeState === "unlockable" && !isMaxed && !isPending;
                  const nodeClassName = [
                    styles.tierNode,
                    nodeState === "active" ? styles.activeNode : "",
                    nodeState === "unlockable" ? styles.unlockableNode : "",
                    nodeState === "locked" ? styles.lockedNode : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <li className={nodeClassName} key={tier.level}>
                      <div className={styles.tierBadge}>{tier.level}</div>
                      <div className={styles.tierBody}>
                        <div className={styles.tierTitleRow}>
                          <strong>{tier.name}</strong>
                          <span>
                            {nodeState === "active"
                              ? "Active"
                              : nodeState === "unlockable"
                                ? "Next"
                                : "Locked"}
                          </span>
                        </div>
                        <p>
                          {tier.rewards
                            .map((reward) => reward.label)
                            .join(", ")}
                        </p>
                        {isNextTier && capReached ? (
                          <span className={styles.lockReason}>
                            {MAX_SKILL_POINTS} point cap reached
                          </span>
                        ) : null}
                        {isNextTier && !capReached && availablePoints <= 0 ? (
                          <span className={styles.lockReason}>
                            No skill points available
                          </span>
                        ) : null}
                        {canPurchase ? (
                          <button
                            className={styles.unlockButton}
                            type="button"
                            onClick={async () => {
                              if (purchasePending) return;
                              setPurchasePending(path.key);
                              try {
                                await onPurchase?.(path.key);
                              } finally {
                                setPurchasePending(null);
                              }
                            }}
                          >
                            Unlock
                          </button>
                        ) : null}
                        {isPending && isNextTier ? (
                          <span className={styles.pendingLabel}>
                            Unlocking...
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
