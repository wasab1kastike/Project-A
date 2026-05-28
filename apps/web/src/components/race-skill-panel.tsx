"use client";

import { useState } from "react";
import {
  getRaceSkillTree,
  type RaceSkillTier,
} from "@/lib/game/race-skill-tree";
import { getEarnedSkillPoints } from "@/lib/game/race-skill-service";
import type { FortressRace } from "@/lib/game/races";

type SkillState = {
  race: FortressRace;
  unlockedTiers: Map<string, number>;
  earnedPoints: number;
  totalPurchased: number;
  playerLevel: number;
  tileCount: number;
};

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
      <section>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Choose a race to unlock its skill tree.
        </p>
      </section>
    );
  }

  const tree = getRaceSkillTree(skillState.race);
  const { earnedPoints, totalPurchased, unlockedTiers } = skillState;
  const availablePoints = Math.max(0, earnedPoints - totalPurchased);

  return (
    <section style={{ display: "grid", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
          Skill Points
        </span>
        <span style={{ color: "var(--color-accent, #48f)", fontSize: "0.85rem" }}>
          {availablePoints} available / {earnedPoints} earned
        </span>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: 0 }}>
        Earn points from castle levels (+1 per level) and territory (+1 per 3
        tiles). Invest them in one of three paths.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "8px",
        }}
      >
        {tree.paths.map((path) => {
          const currentTier = unlockedTiers.get(path.key) ?? 0;
          const nextTier = currentTier + 1;
          const nextNode = path.tiers.find((t) => t.level === nextTier);
          const isMaxed = currentTier >= path.tiers.length;
          const canPurchase =
            availablePoints > 0 && !isMaxed && purchasePending === null;
          const isPending = purchasePending === path.key;

          return (
            <div
              key={path.key}
              style={{
                border: "1px solid var(--border-soft)",
                borderRadius: "8px",
                padding: "10px",
                background: "rgba(8, 16, 25, 0.6)",
                display: "grid",
                gap: "6px",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--foreground)",
                  }}
                >
                  {path.name}
                </span>
                <span
                  style={{
                    fontSize: "0.65rem",
                    color: "var(--text-muted)",
                    marginLeft: "8px",
                  }}
                >
                  Tier {currentTier}/{path.tiers.length}
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                {path.description}
              </p>

              {/* Current tier rewards */}
              {currentTier > 0 && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--color-accent, #48f)",
                    fontWeight: 600,
                  }}
                >
                  Active:{" "}
                  {path.tiers[currentTier - 1]?.rewards
                    .map((r) => r.label)
                    .join(", ")}
                </div>
              )}

              {/* Next tier preview */}
              {nextNode && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-dim)",
                    borderTop: "1px solid var(--border-soft)",
                    paddingTop: "4px",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Next: {nextNode.name}</span>
                  <br />
                  <span style={{ fontSize: "0.65rem" }}>
                    {nextNode.rewards.map((r) => r.label).join(", ")}
                  </span>
                </div>
              )}

              {isMaxed && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--color-success, #4c1)",
                    fontWeight: 600,
                  }}
                >
                  Fully unlocked ✓
                </span>
              )}

              {canPurchase && nextNode && (
                <button
                  type="button"
                  disabled={false}
                  onClick={async () => {
                    if (purchasePending) return;
                    setPurchasePending(path.key);
                    try {
                      await onPurchase?.(path.key);
                    } finally {
                      setPurchasePending(null);
                    }
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "5px",
                    border: "1px solid var(--color-accent, #48f)",
                    background: "rgba(72, 128, 255, 0.12)",
                    color: "var(--color-accent, #48f)",
                    cursor: "pointer",
                  }}
                >
                  {isPending ? "Unlocking..." : `Unlock Tier ${nextTier}`}
                </button>
              )}

              {!canPurchase && !isMaxed && currentTier < path.tiers.length && (
                <span
                  style={{
                    fontSize: "0.65rem",
                    color: "var(--text-muted)",
                  }}
                >
                  No points available
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
