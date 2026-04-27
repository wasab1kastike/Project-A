import { Prisma, PrismaClient } from "@/lib/prisma-client";
import { getAttackArrivalAt } from "./attacks";
import { GameError } from "./errors";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type AttackFortress = {
  id: string;
  ownerId: string;
  points: number;
  army: number;
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
      armyAmount: true,
    },
  });
}

export async function launchAttackUnit({
  db,
  cycle,
  attacker,
  target,
  launchedAt,
  armyAmount = 1,
}: {
  db: DatabaseClient;
  cycle: AttackCycle;
  attacker: AttackFortress;
  target: AttackFortress;
  launchedAt: Date;
  armyAmount?: number;
}) {
  if (!Number.isInteger(armyAmount) || armyAmount <= 0) {
    throw new GameError("You must send at least 1 army.");
  }

  if (armyAmount > attacker.army) {
    throw new GameError("You do not have enough army to send that many units.");
  }

  const arrivesAt = getAttackArrivalAt({
    launchedAt,
    origin: attacker,
    target,
  });

  if (cycle.activeEndsAt && arrivesAt > cycle.activeEndsAt) {
    return null;
  }

  await db.fortress.update({
    where: {
      id: attacker.id,
    },
    data: {
      army: attacker.army - armyAmount,
    },
  });

  return db.attackUnit.create({
    data: {
      cycleId: cycle.id,
      attackerFortressId: attacker.id,
      targetFortressId: target.id,
      armyAmount,
      launchedAt,
      arrivesAt,
    },
  });
}
