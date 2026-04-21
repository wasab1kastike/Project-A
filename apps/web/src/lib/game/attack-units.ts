import { Prisma, PrismaClient, ScoreEventType } from "@/lib/prisma-client";
import { getAttackArrivalAt } from "./attacks";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type AttackFortress = {
  id: string;
  ownerId: string;
  points: number;
  mapX: number;
  mapY: number;
};

export type AttackCycle = {
  id: string;
  activeEndsAt: Date | null;
};

export async function cancelActiveAttackUnits({
  db,
  attackerFortressId,
  cancelledAt,
}: {
  db: DatabaseClient;
  attackerFortressId: string;
  cancelledAt: Date;
}) {
  await db.attackUnit.updateMany({
    where: {
      attackerFortressId,
      resolvedAt: null,
      cancelledAt: null,
    },
    data: {
      cancelledAt,
    },
  });
}

export async function getActiveAttackUnit(
  db: DatabaseClient,
  attackerFortressId: string
) {
  return db.attackUnit.findFirst({
    where: {
      attackerFortressId,
      resolvedAt: null,
      cancelledAt: null,
    },
    select: {
      id: true,
      targetFortressId: true,
    },
  });
}

export async function launchAttackUnit({
  db,
  cycle,
  attacker,
  target,
  launchedAt,
}: {
  db: DatabaseClient;
  cycle: AttackCycle;
  attacker: AttackFortress;
  target: AttackFortress;
  launchedAt: Date;
}) {
  const activeUnit = await getActiveAttackUnit(db, attacker.id);

  if (activeUnit) {
    return null;
  }

  const arrivesAt = getAttackArrivalAt({
    launchedAt,
    origin: attacker,
    target,
  });

  if (cycle.activeEndsAt && arrivesAt > cycle.activeEndsAt) {
    return null;
  }

  const attackerLoss = Math.min(attacker.points, 1);

  if (attackerLoss > 0) {
    await db.fortress.update({
      where: {
        id: attacker.id,
      },
      data: {
        points: attacker.points - attackerLoss,
      },
    });
  }

  await db.scoreEvent.create({
    data: {
      cycleId: cycle.id,
      fortressId: attacker.id,
      actorId: attacker.ownerId,
      targetFortressId: attacker.id,
      eventType: ScoreEventType.ATTACK_SELF,
      delta: -attackerLoss,
      createdAt: launchedAt,
    },
  });

  return db.attackUnit.create({
    data: {
      cycleId: cycle.id,
      attackerFortressId: attacker.id,
      targetFortressId: target.id,
      launchedAt,
      arrivesAt,
    },
  });
}
