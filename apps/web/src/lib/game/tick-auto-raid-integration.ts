// =============================================================================
// Tick Auto-Raid Integration — Automated convoy interception
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

type ConvoySnapshot = {
  id: string;
  fromFortressId: string;
  toFortressId: string;
  gold: number;
  food: number;
  army: number;
};

export async function processAutoRaidDispatch(args: {
  db: PrismaClient;
  cycleId: string;
  now: Date;
  fortresses: FortressSnapshot[];
  diplomacyRelations: DiplomacySnapshot[];
}): Promise<void> {
  const { db, cycleId, now, fortresses, diplomacyRelations } = args;

  const warPairs = diplomacyRelations.filter((r) => r.status === "WAR");
  if (warPairs.length === 0) return;

  // Find enemy convoys in transit.
  const convoys = await db.convoyLeg.findMany({
    where: { cycleId, status: "IN_TRANSIT" },
    select: { id: true, fromFortressId: true, toFortressId: true, gold: true, food: true, army: true },
  });

  if (convoys.length === 0) return;

  let raidsCreated = 0;

  for (const war of warPairs) {
    if (raidsCreated >= 5) break; // Cap at 5 raids per tick.

    const attacker = fortresses.find((f) => f.id === war.fortressAId);
    if (!attacker) continue;

    // Find an enemy convoy going to/from the war target that we can raid.
    const targetConvoy = convoys.find(
      (c) =>
        c.toFortressId === war.fortressBId ||
        c.fromFortressId === war.fortressBId,
    );
    if (!targetConvoy) continue;

    // Find idle battalion with army.
    const battalions = await db.battalion.findMany({
      where: { fortressId: attacker.id, size: { gt: 0 } },
      orderBy: { size: "desc" },
      take: 1,
       select: { id: true, size: true },
    });
    if (battalions.length === 0) continue;

    const bn = battalions[0];
    const raidAmount = Math.min(bn.size, Math.max(1, Math.floor(bn.size * 0.3)));

    // Deduct army from battalion.
    await db.battalion.update({
      where: { id: bn.id },
      data: { size: { decrement: raidAmount } },
    });

    // Create RAID army order.
    try {
      await db.armyOrder.create({
        data: {
          cycleId,
          fortressId: attacker.id,
          type: "RAID",
          status: "ACTIVE",
          committedArmy: raidAmount,
          targetFortressId: war.fortressBId,
          startsAt: now,
        },
      });
      raidsCreated++;
      console.log(
        `[auto-raid] ${attacker.id} → convoy ${targetConvoy.id}: ${raidAmount} army raiding`,
      );
    } catch (_err) {
      // Fine.
    }
  }
}
