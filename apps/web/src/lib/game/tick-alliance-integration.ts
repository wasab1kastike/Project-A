// =============================================================================
// Tick Alliance Integration - reinforce allied battlefields
// =============================================================================
// Called from tick.ts. ALLIANCE mode battalions auto-reinforce allied attack
// and defense battlefields according to each fortress' WarPolicy.
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import { getRoadAdjustedAttackArrival } from "./road-travel";

type DiplomacySnapshot = {
  status: string;
  fortressAId: string;
  fortressBId: string;
};

type BattlefieldSnapshot = {
  id: string;
  defenderBannerFortressId: string | null;
  attackerBannerFortressId: string | null;
  targetTileId?: string | null;
  status: string;
};

type SupportSide = "ATTACKER" | "DEFENDER";

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

    const fortA = ally.fortressAId;
    const fortB = ally.fortressBId;

    for (const bf of activeBfs) {
      if (reinforcesCreated >= 5) break;

      const opportunities: Array<{
        alliedFortressId: string | null;
        reinforcerId: string;
        targetFortressId: string;
        side: SupportSide;
      }> = [];
      const attackerId = bf.attackerBannerFortressId;
      const defenderId = bf.defenderBannerFortressId;

      if (attackerId === fortA && defenderId) {
        opportunities.push({
          alliedFortressId: attackerId,
          reinforcerId: fortB,
          targetFortressId: defenderId,
          side: "ATTACKER",
        });
      } else if (attackerId === fortB && defenderId) {
        opportunities.push({
          alliedFortressId: attackerId,
          reinforcerId: fortA,
          targetFortressId: defenderId,
          side: "ATTACKER",
        });
      }

      if (defenderId === fortA) {
        opportunities.push({
          alliedFortressId: defenderId,
          reinforcerId: fortB,
          targetFortressId: defenderId,
          side: "DEFENDER",
        });
      } else if (defenderId === fortB) {
        opportunities.push({
          alliedFortressId: defenderId,
          reinforcerId: fortA,
          targetFortressId: defenderId,
          side: "DEFENDER",
        });
      }

      for (const opportunity of opportunities) {
        if (reinforcesCreated >= 5) break;

        const created = await createAllianceReinforcement({
          db,
          cycleId,
          now,
          battlefieldId: bf.id,
          ...opportunity,
        });
        if (created) reinforcesCreated++;
      }
    }
  }
}

async function createAllianceReinforcement(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  battlefieldId: string;
  alliedFortressId: string | null;
  reinforcerId: string;
  targetFortressId: string;
  side: SupportSide;
}) {
  const { db, cycleId, now, battlefieldId, reinforcerId, targetFortressId, side } = args;
  if (reinforcerId === args.alliedFortressId) return false;

  const policy = await db.warPolicy.findUnique({
    where: {
      cycleId_fortressId: {
        cycleId,
        fortressId: reinforcerId,
      },
    },
    select: {
      allianceSupportAttack: true,
      allianceSupportDefense: true,
    },
  });
  const supportAttack = policy?.allianceSupportAttack ?? true;
  const supportDefense = policy?.allianceSupportDefense ?? true;
  if (side === "ATTACKER" && !supportAttack) return false;
  if (side === "DEFENDER" && !supportDefense) return false;

  const existingReinforce = await db.attackUnit.findFirst({
    where: {
      cycleId,
      attackerFortressId: reinforcerId,
      targetFortressId,
      reinforcementBattlefieldId: battlefieldId,
      reinforcementSide: side,
      resolvedAt: null,
      cancelledAt: null,
      arrivesAt: { gt: now },
    },
  });
  if (existingReinforce) return false;

  const allianceBattalions = await db.battalion.findMany({
    where: { fortressId: reinforcerId, size: { gt: 0 }, mode: "ALLIANCE" },
    orderBy: { size: "desc" },
    select: { id: true, size: true },
    take: 3,
  });
  if (allianceBattalions.length === 0) return false;

  const totalAvailable = allianceBattalions.reduce((sum, battalion) => sum + battalion.size, 0);
  const commitAmount = totalAvailable;
  if (commitAmount <= 0) return false;

  let remaining = commitAmount;
  for (const battalion of allianceBattalions) {
    if (remaining <= 0) break;
    const take = Math.min(battalion.size, remaining);
    await db.battalion.update({
      where: { id: battalion.id },
      data: { size: { decrement: take } },
    });
    remaining -= take;
  }

  const [reinforcer, target] = await Promise.all([
    db.fortress.findUnique({
      where: { id: reinforcerId },
      select: { mapX: true, mapY: true },
    }),
    db.fortress.findUnique({
      where: { id: targetFortressId },
      select: { mapX: true, mapY: true },
    }),
  ]);
  const dx = (reinforcer?.mapX ?? 0) - (target?.mapX ?? 0);
  const dy = (reinforcer?.mapY ?? 0) - (target?.mapY ?? 0);
  const baseMinutes = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 10));
  const { arrivesAt } = await getRoadAdjustedAttackArrival({
    db,
    cycleId,
    launchedAt: now,
    origin: { mapX: reinforcer?.mapX ?? 0, mapY: reinforcer?.mapY ?? 0 },
    target: { mapX: target?.mapX ?? 0, mapY: target?.mapY ?? 0 },
    baseMinutes,
  });

  await db.attackUnit.create({
    data: {
      cycleId,
      attackerFortressId: reinforcerId,
      targetFortressId,
      reinforcementBattlefieldId: battlefieldId,
      reinforcementSide: side,
      armyAmount: commitAmount,
      launchedAt: now,
      arrivesAt,
      returnOriginMapX: reinforcer?.mapX,
      returnOriginMapY: reinforcer?.mapY,
    },
  });

  return true;
}
