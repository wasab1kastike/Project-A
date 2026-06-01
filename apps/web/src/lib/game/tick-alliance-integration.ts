// =============================================================================
// Tick Alliance Integration - reinforce allied battlefields
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
  targetTileId?: string | null;
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

    const fortA = ally.fortressAId;
    const fortB = ally.fortressBId;

    for (const bf of activeBfs) {
      if (reinforcesCreated >= 5) break;

      const defenderId = bf.defenderBannerFortressId;
      if (!defenderId) continue;

      let reinforcerId: string | null = null;
      if (defenderId === fortA) reinforcerId = fortB;
      else if (defenderId === fortB) reinforcerId = fortA;
      if (!reinforcerId) continue;

      const existingReinforce = await db.attackUnit.findFirst({
        where: {
          cycleId,
          attackerFortressId: reinforcerId,
          targetFortressId: defenderId,
          reinforcementBattlefieldId: bf.id,
          reinforcementSide: "DEFENDER",
          resolvedAt: null,
          cancelledAt: null,
          arrivesAt: { gt: now },
        },
      });
      if (existingReinforce) continue;

      const allianceBattalions = await db.battalion.findMany({
        where: { fortressId: reinforcerId, size: { gt: 0 }, mode: "ALLIANCE" },
        orderBy: { size: "desc" },
        select: { id: true, size: true },
        take: 3,
      });
      if (allianceBattalions.length === 0) continue;

      const totalAvailable = allianceBattalions.reduce((s, b) => s + b.size, 0);
      const commitAmount = Math.max(1, Math.floor(totalAvailable * 0.5));

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

      const [reinforcer, defender] = await Promise.all([
        db.fortress.findUnique({
          where: { id: reinforcerId },
          select: { mapX: true, mapY: true },
        }),
        db.fortress.findUnique({
          where: { id: defenderId },
          select: { mapX: true, mapY: true },
        }),
      ]);
      const dx = (reinforcer?.mapX ?? 0) - (defender?.mapX ?? 0);
      const dy = (reinforcer?.mapY ?? 0) - (defender?.mapY ?? 0);
      const travelMinutes = Math.max(
        1,
        Math.ceil(Math.sqrt(dx * dx + dy * dy) / 10),
      );

      await db.attackUnit.create({
        data: {
          cycleId,
          attackerFortressId: reinforcerId,
          targetFortressId: defenderId,
          reinforcementBattlefieldId: bf.id,
          reinforcementSide: "DEFENDER",
          armyAmount: commitAmount,
          launchedAt: now,
          arrivesAt: new Date(now.getTime() + travelMinutes * 60_000),
          returnOriginMapX: reinforcer?.mapX,
          returnOriginMapY: reinforcer?.mapY,
        },
      });

      reinforcesCreated++;
    }
  }
}
