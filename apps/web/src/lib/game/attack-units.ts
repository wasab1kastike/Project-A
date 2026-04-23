import { Prisma, PrismaClient } from "@/lib/prisma-client";
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
  const result = await db.attackUnit.updateMany({
    where: {
      attackerFortressId,
      resolvedAt: null,
      cancelledAt: null,
    },
    data: {
      cancelledAt,
    },
  });

  return result.count;
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
  const arrivesAt = getAttackArrivalAt({
    launchedAt,
    origin: attacker,
    target,
  });

  if (cycle.activeEndsAt && arrivesAt > cycle.activeEndsAt) {
    return null;
  }

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
