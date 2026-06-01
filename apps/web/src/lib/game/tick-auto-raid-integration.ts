// =============================================================================
// Tick Auto-Raid Integration - Automated convoy interception
// =============================================================================
// Called from tick.ts. When at war, idle battalions auto-intercept enemy convoys.
// =============================================================================

import type { PrismaClient } from "@prisma/client";

type FortressSnapshot = {
  id: string;
  army: number;
  ownerId: string;
};

type DiplomacySnapshot = {
  status: string;
  fortressAId: string;
  fortressBId: string;
};

export async function processAutoRaidDispatch(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  fortresses: FortressSnapshot[];
  diplomacyRelations: DiplomacySnapshot[];
}): Promise<void> {
  const { db, cycleId, now, fortresses, diplomacyRelations } = args;

  const warPairs = diplomacyRelations.filter((relation) => relation.status === "WAR");
  if (warPairs.length === 0) return;

  const convoys = await db.convoyLeg.findMany({
    where: { cycleId, status: "IN_TRANSIT" },
    select: { id: true, fromFortressId: true, toFortressId: true },
  });

  if (convoys.length === 0) return;

  const existingRaidOrders = await db.armyOrder.findMany({
    where: { cycleId, type: "RAID", status: "ACTIVE" },
    select: { fortressId: true, targetFortressId: true },
  });
  const activeRaidKeys = new Set(
    existingRaidOrders
      .filter((order) => order.targetFortressId)
      .map((order) => `${order.fortressId}:${order.targetFortressId}`)
  );
  let raidsCreated = 0;

  for (const war of warPairs) {
    if (raidsCreated >= 5) break;

    const sides = [
      { attackerId: war.fortressAId, targetId: war.fortressBId },
      { attackerId: war.fortressBId, targetId: war.fortressAId },
    ];

    for (const side of sides) {
      if (raidsCreated >= 5) break;

      const raidKey = `${side.attackerId}:${side.targetId}`;
      if (activeRaidKeys.has(raidKey)) continue;

      const attacker = fortresses.find((fortress) => fortress.id === side.attackerId);
      if (!attacker) continue;

      const targetConvoy = convoys.find(
        (convoy) =>
          (convoy.toFortressId === side.targetId ||
            convoy.fromFortressId === side.targetId) &&
          convoy.toFortressId !== attacker.id &&
          convoy.fromFortressId !== attacker.id
      );
      if (!targetConvoy) continue;

      const battalions = await db.battalion.findMany({
        where: { fortressId: attacker.id, size: { gt: 0 } },
        orderBy: { size: "desc" },
        take: 1,
        select: { id: true, size: true },
      });
      if (battalions.length === 0) continue;

      const battalion = battalions[0]!;
      const raidAmount = Math.min(
        battalion.size,
        Math.max(1, Math.floor(battalion.size * 0.3))
      );

      await db.battalion.update({
        where: { id: battalion.id },
        data: { size: { decrement: raidAmount } },
      });

      try {
        await db.armyOrder.create({
          data: {
            cycleId,
            fortressId: attacker.id,
            type: "RAID",
            status: "ACTIVE",
            committedArmy: raidAmount,
            targetFortressId: side.targetId,
            startsAt: now,
          },
        });
        activeRaidKeys.add(raidKey);
        raidsCreated++;
        console.log(
          `[auto-raid] ${attacker.id} -> convoy ${targetConvoy.id}: ${raidAmount} army raiding`
        );
      } catch (_err) {
        // Duplicate or stale orders can be ignored; the next tick re-evaluates.
      }
    }
  }
}
