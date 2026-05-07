import { Prisma, PrismaClient, RaceAbilityKind } from "@/lib/prisma-client";
import { getAttackArrivalAt } from "./attacks";
import { GameError } from "./errors";
import { getHelsinkiHourKey, getRaceBuffTier } from "./race-buffs";
import { getRaceModifiers } from "./races";
import type { FortressRace } from "./races";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type AttackFortress = {
  id: string;
  ownerId: string;
  points: number;
  army: number;
  mapX: number;
  mapY: number;
  race?: FortressRace | null;
};

export type AttackCycle = {
  id: string;
  status?: string;
  activeStartedAt?: Date | null;
  activeEndsAt: Date | null;
};

async function getOrkWaaghActive({
  db,
  fortress,
  now,
  raceBuffTier,
}: {
  db: DatabaseClient;
  fortress: { id: string; race?: FortressRace | null };
  now: Date;
  raceBuffTier: number;
}) {
  if (fortress.race !== "ORKS" || raceBuffTier < 3) {
    return false;
  }

  const active = await db.raceAbilityActivation.findFirst({
    where: {
      fortressId: fortress.id,
      kind: RaceAbilityKind.ORK_WAAAGH,
      activeFrom: { lte: now },
      activeUntil: { gt: now },
    },
    select: { id: true },
  });

  return Boolean(active);
}

function getDwarfAttackSpeedMultiplier(fortress: {
  race?: FortressRace | null;
}) {
  if (fortress.race !== "DWARFS") {
    return 1;
  }

  return getRaceModifiers(fortress.race).travelSpeedMultiplier;
}

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

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getAttackUnitPosition({
  launchedAt,
  arrivesAt,
  origin,
  target,
  now,
}: {
  launchedAt: Date;
  arrivesAt: Date;
  origin: Pick<AttackFortress, "mapX" | "mapY">;
  target: Pick<AttackFortress, "mapX" | "mapY">;
  now: Date;
}) {
  const duration = arrivesAt.getTime() - launchedAt.getTime();
  const progress =
    duration <= 0
      ? 1
      : clampProgress((now.getTime() - launchedAt.getTime()) / duration);

  return {
    mapX: Math.round(origin.mapX + (target.mapX - origin.mapX) * progress),
    mapY: Math.round(origin.mapY + (target.mapY - origin.mapY) * progress),
  };
}

export async function recallAttackUnit({
  db,
  cycle,
  userId,
  attackUnitId,
  instant = false,
  now,
}: {
  db: DatabaseClient;
  cycle: AttackCycle;
  userId: string;
  attackUnitId: string;
  instant?: boolean;
  now: Date;
}) {
  const attackUnit = await db.attackUnit.findUnique({
    where: {
      id: attackUnitId,
    },
    select: {
      id: true,
      armyAmount: true,
      launchedAt: true,
      arrivesAt: true,
      resolvedAt: true,
      cancelledAt: true,
      recalledAt: true,
      attackerFortress: {
        select: {
          id: true,
          ownerId: true,
          points: true,
          army: true,
          mapX: true,
          mapY: true,
          race: true,
        },
      },
      targetFortress: {
        select: {
          id: true,
          ownerId: true,
          points: true,
          army: true,
          mapX: true,
          mapY: true,
          race: true,
        },
      },
    },
  });

  if (!attackUnit || attackUnit.attackerFortress.ownerId !== userId) {
    throw new GameError("That army is not available to recall.");
  }

  if (
    attackUnit.resolvedAt ||
    attackUnit.cancelledAt ||
    attackUnit.recalledAt ||
    attackUnit.arrivesAt <= now
  ) {
    throw new GameError("That army is no longer on the way.");
  }

  const returnOrigin = getAttackUnitPosition({
    launchedAt: attackUnit.launchedAt,
    arrivesAt: attackUnit.arrivesAt,
    origin: attackUnit.attackerFortress,
    target: attackUnit.targetFortress,
    now,
  });

  if (attackUnit.attackerFortress.race === "SPACE_MURINES" && instant) {
    const hourKey = getHelsinkiHourKey(now);
    const latestInstantRecall = await db.raceAbilityActivation.findFirst({
      where: {
        fortressId: attackUnit.attackerFortress.id,
        kind: RaceAbilityKind.SPACE_MURINE_INSTANT_RECALL,
      },
      orderBy: [{ usedAt: "desc" }, { id: "desc" }],
      select: {
        usedAt: true,
      },
    });

    if (
      !latestInstantRecall ||
      getHelsinkiHourKey(latestInstantRecall.usedAt) !== hourKey
    ) {
      const lostArmy = Math.max(1, Math.ceil(attackUnit.armyAmount * 0.05));
      const returnedArmy = Math.max(0, attackUnit.armyAmount - lostArmy);

      await db.raceAbilityActivation.create({
        data: {
          fortressId: attackUnit.attackerFortress.id,
          kind: RaceAbilityKind.SPACE_MURINE_INSTANT_RECALL,
          activeFrom: now,
          activeUntil: now,
          usedAt: now,
        },
      });

      if (returnedArmy > 0) {
        await db.fortress.update({
          where: {
            id: attackUnit.attackerFortress.id,
          },
          data: {
            army: {
              increment: returnedArmy,
            },
          },
        });
      }

      return db.attackUnit.update({
        where: {
          id: attackUnit.id,
        },
        data: {
          recalledAt: now,
          returnOriginMapX: returnOrigin.mapX,
          returnOriginMapY: returnOrigin.mapY,
          arrivesAt: now,
          resolvedAt: now,
          defenderArmyAtBattleStart: null,
          resolvedAttackPower: 0,
          resolvedDefensePower: 0,
          attackerSurvivors: returnedArmy,
          attackerRetired: lostArmy,
          attackerReturned: returnedArmy,
          defenderLosses: 0,
          pointsLooted: 0,
          foodLooted: 0,
          armyLooted: 0,
        },
      });
    }
  }

  const raceBuffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt ?? null,
    now,
    isActiveSeason: cycle.status === "ACTIVE",
  });
  const arrivesAt = getAttackArrivalAt({
    launchedAt: now,
    origin: returnOrigin,
    target: attackUnit.attackerFortress,
    attackerRace: attackUnit.attackerFortress.race,
    raceBuffTier,
    speedMultiplier: getDwarfAttackSpeedMultiplier(
      attackUnit.attackerFortress
    ),
    waaagh: await getOrkWaaghActive({
      db,
      fortress: attackUnit.attackerFortress,
      now,
      raceBuffTier,
    }),
  });

  return db.attackUnit.update({
    where: {
      id: attackUnit.id,
    },
    data: {
      recalledAt: now,
      returnOriginMapX: returnOrigin.mapX,
      returnOriginMapY: returnOrigin.mapY,
      arrivesAt,
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

  const buffTier = getRaceBuffTier({
    activeStartedAt: cycle.activeStartedAt ?? null,
    now: launchedAt,
    isActiveSeason: cycle.status === "ACTIVE",
  });
  const arrivesAt = getAttackArrivalAt({
    launchedAt,
    origin: attacker,
    target,
    attackerRace: attacker.race,
    raceBuffTier: buffTier,
    speedMultiplier: getDwarfAttackSpeedMultiplier(attacker),
    waaagh: await getOrkWaaghActive({
      db,
      fortress: attacker,
      now: launchedAt,
      raceBuffTier: buffTier,
    }),
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
      // Seed origin so in-flight routes stay anchored even if the fortress moves later.
      returnOriginMapX: attacker.mapX,
      returnOriginMapY: attacker.mapY,
    },
  });
}
