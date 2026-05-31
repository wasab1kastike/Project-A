// =============================================================================
// Tick Alliance Integration — Reinforce allied battlefields
// =============================================================================
// Called from tick.ts. ALLIANCE mode battalions auto-reinforce allied battlefields.
// =============================================================================

import type { PrismaClient } from "@prisma/client";

type DiplomacySnapshot = {
  status: string;
  fortressAId: string;
  fortressBId: string;
};

type BattlefieldSnapshot = {
  id: string;
  defenderBannerFortressId: string | null;
  attackerBannerFortressId: string | null;
  status: string;
};

export async function processAllianceReinforcements(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  diplomacyRelations: DiplomacySnapshot[];
  activeBattlefields: BattlefieldSnapshot[];
}): Promise<void> {
  const { db, cycleId, now, diplomacyRelations, activeBattlefields } = args;

  const allies = diplomacyRelations.filter((r) => r.status === "ALLIED");
  if (allies.length === 0) return;

  const activeBfs = activeBattlefields.filter((bf) => bf.status === "ACTIVE");
  if (activeBfs.length === 0) return;

  let reinforcesCreated = 0;

  for (const ally of allies) {
    if (reinforcesCreated >= 5) break;

    // Find which fortress is allied to which.
    const fortA = ally.fortressAId;
    const fortB = ally.fortressBId;

    // For each fortress, find if they have an active battlefield where they're the defender.
    for (const bf of activeBfs) {
      if (reinforcesCreated >= 5) break;

      // Is this battlefield defending an ally?
      const defenderId = bf.defenderBannerFortressId;
      if (!defenderId) continue;

      // Determine which allied fortress can reinforce.
      let reinforcerId: string | null = null;
      if (defenderId === fortA) reinforcerId = fortB;
      else if (defenderId === fortB) reinforcerId = fortA;
      if (!reinforcerId) continue;

      // Check if already reinforcing this battlefield.
      const existingReinforce = await db.attackUnit.findFirst({
        where: {
          cycleId,
          attackerFortressId: reinforcerId,
          targetFortressId: defenderId, // reinforcing to ally, not against them
          resolvedAt: null,
          cancelledAt: null,
          arrivesAt: { gt: now },
        },
      });
      if (existingReinforce) continue;

      // Find ALLIANCE mode battalions with army.
      const allianceBattalions = await db.battalion.findMany({
        where: { fortressId: reinforcerId, size: { gt: 0 }, mode: "ALLIANCE" },
        orderBy: { size: "desc" },
        select: { id: true, size: true },
        take: 3,
      });
      if (allianceBattalions.length === 0) continue;

      // Commit up to 50% of alliance battalion army.
      const totalAvailable = allianceBattalions.reduce((s, b) => s + b.size, 0);
      const commitAmount = Math.max(1, Math.floor(totalAvailable * 0.5));

      // Deduct from battalions proportionally.
      let remaining = commitAmount;
      for (const bn of allianceBattalions) {
        if (remaining <= 0) break;
        const take = Math.min(bn.size, remaining);
        await db.battalion.update({
          where: { id: bn.id },
          data: { size: { decrement: take } },
        });
        remaining -= take;
      }

      // Directly reinforce the allied battlefield.
      await db.battlefield.update({
        where: { id: bf.id },
        data: {
          defenderArmyRemaining: { increment: commitAmount },
        },
      });

      reinforcesCreated++;
      console.log(
        `[alliance] ${reinforcerId} → ${defenderId}: ${commitAmount} army reinforced battlefield ${bf.id}`,
      );
    }
  }
}
