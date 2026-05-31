import {
  BattlefieldSide,
  BattlefieldStatus,
  ChatMessageType,
  CycleStatus,
  CycleRuleset,
  FortressKind,
  OrkScrapEventReason,
  Prisma,
  PrismaClient,
  RaceAbilityKind,
  ScoreEventType,
  type FortressRace,
} from "@/lib/prisma-client";
import {
  CARRY_CAPACITY_PER_SURVIVOR,
  getFortressDefenseMultiplier,
  MAX_FOOD_LOOT_PERCENT,
  MAX_POINT_LOOT_PERCENT,
} from "./balance";
import { GameError } from "./errors";
import { launchAttackUnit } from "./attack-units";
import {
  HOME_OF_A_BOSS_BUFF_HOURS,
  HOME_OF_A_BOSS_RESPAWN_HOURS,
  HOME_OF_A_TILE_ID,
  getHomeOfABossReward,
} from "./constants";
import {
  getTileBonus,
  getTileById,
  isHomeOfATile,
  sumTileBonuses,
} from "./territory";
import { ensureNpcSystemUser, getHomeOfAMapPosition } from "./mega-fortress";
import { getMaxSimultaneousAttacks } from "./upgrades";
import {
  applyOrkScrapDelta,
  getOrkTileBattleScrap,
  isRealOrkPlayerFortress,
} from "./orks";
import { DWARF_DEEP_MINING_RUNE_BOUNTY } from "./dwarf-deep-mining";
import { ensureBattlefieldPointRewardColumn } from "./schema-guards";
import { addHours } from "./time";
import { countCastleSpecializations } from "./specializations";
import {
  getLeaderboardTitleCastleLootMultiplier,
  getLeaderboardTitleHolders,
} from "./leaderboard-titles";
import {
  getCombatAttackPowerMultiplier,
  getCombatDefensePowerMultiplier,
  hasCombatStim,
  isPlayerCombatTarget,
} from "./combat-buffs";
import {
  getBattlefieldAttrition,
  getBattlefieldProgressDelta,
  getHomeOfABossBattleDamage,
} from "./battlefield-rules";
import { getDoctrineTier, getGuardDefenseDoctrineMultiplier } from "./doctrines";
import { getSkillModifiers } from "./race-skill-effects";
import { isFortressRace } from "./races";
export {
  getBattlefieldAttrition,
  getBattlefieldCasualtyBudget,
  getBattlefieldProgressDelta,
  getHomeOfABossBattleDamage,
} from "./battlefield-rules";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const CASTLE_PVP_POINT_LOOT_PERCENT = 0.05;

export function getBattlefieldTileDefensePowerMultiplier({
  targetTileId,
  defenderRace,
  ownedTileDefensePercent = 0,
  skillTileDefensePercent = 0,
  cycleId,
  tickAt,
}: {
  targetTileId: string | null;
  defenderRace?: string | null;
  ownedTileDefensePercent?: number;
  skillTileDefensePercent?: number;
  cycleId?: string | null;
  tickAt?: Date | null;
}) {
  if (!targetTileId || isHomeOfATile(targetTileId)) {
    return 1;
  }

  const tile = getTileById(targetTileId);
  const tileDefensePercent = getTileBonus(tile).defensePercent;
  const tileDefenseMultiplier = 1 + Math.max(0, tileDefensePercent) / 100;
  const ownedTileDefenseMultiplier =
    1 + Math.max(0, ownedTileDefensePercent) / 100;
  const skillTileDefenseMultiplier =
    1 + Math.max(0, skillTileDefensePercent) / 100;
  const dwarfOwnedTileMultiplier = defenderRace === "DWARFS" ? 1.25 : 1;

  return (
    tileDefenseMultiplier *
    ownedTileDefenseMultiplier *
    skillTileDefenseMultiplier *
    dwarfOwnedTileMultiplier
  );
}

export function getBattlefieldCastleDefensePowerMultiplier({
  targetFortress,
  ownedTileDefensePercent = 0,
  skillTileDefensePercent = 0,
}: {
  targetFortress: {
    fortressKind: FortressKind;
    isNpc: boolean;
    level: number;
    race?: FortressRace | null;
    castleUpgradeSpecializations?: Parameters<typeof countCastleSpecializations>[0];
  } | null;
  ownedTileDefensePercent?: number;
  skillTileDefensePercent?: number;
}) {
  if (
    !targetFortress ||
    targetFortress.fortressKind !== FortressKind.PLAYER ||
    targetFortress.isNpc
  ) {
    return 1;
  }

  return (
    getFortressDefenseMultiplier(
      targetFortress.level,
      targetFortress.race,
      countCastleSpecializations(targetFortress.castleUpgradeSpecializations ?? [])
    ) *
    (1 + Math.max(0, ownedTileDefensePercent) / 100) *
    (1 + Math.max(0, skillTileDefensePercent) / 100)
  );
}

function getSkillTileDefensePercent(fortress: {
  race?: FortressRace | null;
  skillPurchases?: Array<{ nodeKey: string }>;
} | null) {
  if (!fortress?.race || !isFortressRace(fortress.race)) return 0;
  return getSkillModifiers({
    race: fortress.race,
    purchases: fortress.skillPurchases ?? [],
  }).tileDefensePercent;
}

function getHomeOfABossDefeatAnnouncement({
  fortressName,
  commanderName,
  reward,
}: {
  fortressName: string;
  commanderName: string;
  reward: number;
}) {
  return `Home of A has been defeated by ${commanderName} of ${fortressName}. The accounting shrine coughed up ${reward} points, ${reward} food, ${reward} army, and a 12h buff. A will be back after a 24h dramatic nap.`;
}

export function distributeBattlefieldLosses<
  TParticipant extends {
    id: string;
    armyRemaining: number;
    armyCommitted: number;
  },
>(
  participants: TParticipant[],
  totalLosses: number,
  protectedParticipantIds = new Set<string>()
) {
  const livingParticipants = participants.filter(
    (participant) => participant.armyRemaining > 0
  );
  const livingArmy = livingParticipants.reduce(
    (sum, participant) => sum + participant.armyRemaining,
    0
  );

  if (totalLosses <= 0 || livingArmy <= 0) {
    return {
      lossesByParticipantId: new Map<string, number>(),
      appliedLosses: 0,
    };
  }

  const cappedLosses = Math.min(totalLosses, livingArmy);
  const lossesByParticipantId = new Map<string, number>();
  let appliedLosses = 0;
  let distributedLossShares = 0;

  for (const participant of livingParticipants) {
    const proportionalLoss = Math.floor(
      (cappedLosses * participant.armyRemaining) / livingArmy
    );
    distributedLossShares += proportionalLoss;

    if (protectedParticipantIds.has(participant.id)) {
      continue;
    }

    const loss = Math.min(participant.armyRemaining, proportionalLoss);

    if (loss > 0) {
      lossesByParticipantId.set(participant.id, loss);
      appliedLosses += loss;
    }
  }

  let remainder = cappedLosses - distributedLossShares;

  for (const participant of [...livingParticipants].sort(
    (left, right) =>
      right.armyRemaining - left.armyRemaining ||
      right.armyCommitted - left.armyCommitted ||
      left.id.localeCompare(right.id)
  )) {
    if (remainder <= 0) {
      break;
    }

    if (protectedParticipantIds.has(participant.id)) {
      continue;
    }

    const currentLoss = lossesByParticipantId.get(participant.id) ?? 0;
    const extraCapacity = participant.armyRemaining - currentLoss;

    if (extraCapacity <= 0) {
      continue;
    }

    const extraLoss = Math.min(extraCapacity, remainder);
    lossesByParticipantId.set(participant.id, currentLoss + extraLoss);
    appliedLosses += extraLoss;
    remainder -= extraLoss;
  }

  return {
    lossesByParticipantId,
    appliedLosses,
  };
}

async function incrementUnitsKilledForParticipants<
  TParticipant extends {
    fortressId: string;
    armyCommitted: number;
    fortress: {
      isNpc: boolean;
      fortressKind: FortressKind;
    };
  },
>({
  db,
  participants,
  totalKills,
}: {
  db: DatabaseClient;
  participants: TParticipant[];
  totalKills: number;
}) {
  if (totalKills <= 0) {
    return;
  }

  const eligibleParticipants = [...participants]
    .filter(
      (participant) =>
        participant.armyCommitted > 0 &&
        !participant.fortress.isNpc &&
        participant.fortress.fortressKind === FortressKind.PLAYER
    )
    .sort(
      (left, right) =>
        right.armyCommitted - left.armyCommitted ||
        left.fortressId.localeCompare(right.fortressId)
    );
  const committedArmy = eligibleParticipants.reduce(
    (sum, participant) => sum + participant.armyCommitted,
    0
  );

  if (committedArmy <= 0) {
    if (eligibleParticipants.length > 0) {
      // This should not happen, but log for debugging
      console.warn('[unitsKilled] All eligible participants have zero committed army. No kills distributed.');
    }
    return;
  }

  let distributedKills = 0;
  let participantReceivedKills = false;

  for (const [index, participant] of eligibleParticipants.entries()) {
    let kills;
    if (index === eligibleParticipants.length - 1) {
      // Always assign the remainder to the last eligible participant
      kills = totalKills - distributedKills;
    } else {
      kills = Math.floor((totalKills * participant.armyCommitted) / committedArmy);
    }

    // If this is the last participant and no one has received kills yet, assign all kills to them
    if (index === eligibleParticipants.length - 1 && !participantReceivedKills && kills <= 0) {
      kills = totalKills;
    }

    if (kills <= 0) {
      continue;
    }

    participantReceivedKills = true;
    distributedKills += kills;
    await db.fortress.update({
      where: {
        id: participant.fortressId,
      },
      data: {
        unitsKilled: {
          increment: kills,
        },
      },
    });
  }

  if (!participantReceivedKills && eligibleParticipants.length > 0) {
    // This should not happen, but log for debugging
    console.warn('[unitsKilled] No eligible participant received kills despite nonzero totalKills.');
  }
}

function distributeReturnedArmyToParticipants<
  TParticipant extends {
    id: string;
    fortressId: string;
    armyRemaining: number;
    armyCommitted: number;
  },
>(
  participants: TParticipant[],
  totalReturnedArmy: number,
  lossesByParticipantId: Map<string, number>
) {
  const survivors = participants
    .map((participant) => ({
      participant,
      survivingArmy: Math.max(
        0,
        participant.armyRemaining -
          (lossesByParticipantId.get(participant.id) ?? 0)
      ),
    }))
    .filter((entry) => entry.survivingArmy > 0)
    .sort(
      (left, right) =>
        right.survivingArmy - left.survivingArmy ||
        right.participant.armyCommitted - left.participant.armyCommitted ||
        left.participant.id.localeCompare(right.participant.id)
    );
  const survivingTotal = survivors.reduce(
    (sum, entry) => sum + entry.survivingArmy,
    0
  );

  if (totalReturnedArmy <= 0 || survivingTotal <= 0) {
    return new Map<string, number>();
  }

  const cappedReturnedArmy = Math.min(totalReturnedArmy, survivingTotal);
  const returnedByFortressId = new Map<string, number>();
  let distributedArmy = 0;

  for (const [index, entry] of survivors.entries()) {
    const returnedArmy =
      index === survivors.length - 1
        ? cappedReturnedArmy - distributedArmy
        : Math.floor((cappedReturnedArmy * entry.survivingArmy) / survivingTotal);

    if (returnedArmy <= 0) {
      continue;
    }

    returnedByFortressId.set(
      entry.participant.fortressId,
      (returnedByFortressId.get(entry.participant.fortressId) ?? 0) +
        returnedArmy
    );
    distributedArmy += returnedArmy;
  }

  return returnedByFortressId;
}

function calculateBattlefieldCastleLoot({
  survivingAttackers,
  defenderGold,
  defenderFood,
}: {
  survivingAttackers: number;
  defenderGold: number;
  defenderFood: number;
}) {
  const lootCapacity = Math.max(
    0,
    Math.floor(survivingAttackers * CARRY_CAPACITY_PER_SURVIVOR)
  );
  const goldLootCap = Math.floor(
    Math.max(0, defenderGold) * MAX_POINT_LOOT_PERCENT
  );
  const foodLootCap = Math.floor(
    Math.max(0, defenderFood) * MAX_FOOD_LOOT_PERCENT
  );
  let goldLooted = Math.min(goldLootCap, Math.ceil(lootCapacity / 2));
  let foodLooted = Math.min(
    foodLootCap,
    Math.max(0, lootCapacity - goldLooted)
  );
  let remainingCapacity = lootCapacity - goldLooted - foodLooted;

  while (remainingCapacity > 0) {
    const goldRemaining = goldLootCap - goldLooted;
    const foodRemaining = foodLootCap - foodLooted;

    if (goldRemaining <= 0 && foodRemaining <= 0) {
      break;
    }

    if (goldRemaining >= foodRemaining) {
      const extraGold = Math.min(remainingCapacity, goldRemaining);
      goldLooted += extraGold;
      remainingCapacity -= extraGold;
      continue;
    }

    const extraFood = Math.min(remainingCapacity, foodRemaining);
    foodLooted += extraFood;
    remainingCapacity -= extraFood;
  }

  return {
    goldLooted,
    foodLooted,
  };
}

export async function createBattlefieldFromAttackUnit({
  db,
  attackUnitId,
  tickAt,
}: {
  db: DatabaseClient;
  attackUnitId: string;
  tickAt: Date;
}) {
  const unit = await db.attackUnit.findUnique({
    where: {
      id: attackUnitId,
    },
    select: {
      id: true,
      cycleId: true,
      armyAmount: true,
      arrivesAt: true,
      resolvedAt: true,
      attackerFortressId: true,
      targetFortressId: true,
      attackerFortress: {
        select: {
          id: true,
          ownerId: true,
        },
      },
      targetFortress: {
        select: {
          id: true,
          army: true,
          points: true,
          gold: true,
          food: true,
          health: true,
          maxHealth: true,
          level: true,
          race: true,
          doctrine: true,
          isNpc: true,
          fortressKind: true,
          raceAbilityActivations: {
            where: {
              activeUntil: {
                gt: tickAt,
              },
            },
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          orkBossOrders: {
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          castleUpgradeSpecializations: {
            select: {
              level: true,
              specialization: true,
            },
          },
        },
      },
    },
  });

  if (!unit || unit.resolvedAt) {
    return null;
  }

  const existing = await db.battlefield.findFirst({
    where: {
      cycleId: unit.cycleId,
      targetFortressId: unit.targetFortressId,
      status: BattlefieldStatus.ACTIVE,
    },
    select: {
      id: true,
    },
  });

  const isHomeOfABossTarget =
    unit.targetFortress.isNpc &&
    unit.targetFortress.fortressKind === FortressKind.MEGA;
  const bossReward = isHomeOfABossTarget
    ? getHomeOfABossReward(unit.targetFortress.maxHealth)
    : 0;
  // Add guard army from garrisoned battalions on the target fortress tile.
  let guardArmy = 0;
  if (!isHomeOfABossTarget && unit.targetFortress) {
    const targetTile = await db.mapHexOwnership.findUnique({
      where: { cycleId_tileId: { cycleId: unit.cycleId, tileId: HOME_OF_A_TILE_ID } },
    });
    const fortTiles = await db.mapHexOwnership.findMany({
      where: { cycleId: unit.cycleId, ownerFortressId: unit.targetFortressId },
      select: { tileId: true },
    });
    const fortTileIds = fortTiles.map((t) => t.tileId);
    const garrisons = await db.fortressGarrison.findMany({
      where: { cycleId: unit.cycleId, tileId: { in: fortTileIds } },
      select: { army: true },
    });
    guardArmy = garrisons.reduce((s, g) => s + g.army, 0);
  }

  const battlefield =
    existing ??
    (await db.battlefield.create({
      data: {
        cycleId: unit.cycleId,
        targetFortressId: unit.targetFortressId,
        targetTileId: isHomeOfABossTarget ? HOME_OF_A_TILE_ID : null,
        attackerBannerFortressId: unit.attackerFortressId,
        defenderBannerFortressId: isHomeOfABossTarget
          ? null
          : unit.targetFortressId,
        attackerArmyRemaining: unit.armyAmount,
        defenderArmyRemaining: isHomeOfABossTarget
          ? unit.targetFortress.health
          : unit.targetFortress.army + guardArmy,
        pointReward: isHomeOfABossTarget ? bossReward : 0,
        pointsReward: isHomeOfABossTarget
          ? bossReward
          : Math.floor(unit.targetFortress.gold * 0.7),
        foodReward: isHomeOfABossTarget
          ? bossReward
          : Math.floor(unit.targetFortress.food * 0.7),
        startedAt:
          unit.targetFortress.fortressKind === FortressKind.PLAYER &&
          !unit.targetFortress.isNpc
            ? addHours(unit.arrivesAt, 1)
            : tickAt,
      },
      select: {
        id: true,
      },
    }));

  if (existing) {
    await db.battlefield.update({
      where: {
        id: battlefield.id,
      },
      data: {
        attackerArmyRemaining: {
          increment: unit.armyAmount,
        },
      },
    });
  }

  await db.battlefieldParticipant.upsert({
    where: {
      battlefieldId_fortressId: {
        battlefieldId: battlefield.id,
        fortressId: unit.attackerFortressId,
      },
    },
    update: {
      armyCommitted: {
        increment: unit.armyAmount,
      },
      armyRemaining: {
        increment: unit.armyAmount,
      },
    },
    create: {
      battlefieldId: battlefield.id,
      fortressId: unit.attackerFortressId,
      side: BattlefieldSide.ATTACKER,
      armyCommitted: unit.armyAmount,
      armyRemaining: unit.armyAmount,
      maintenanceDrains: true,
      joinedAt: tickAt,
    },
  });

  await db.attackUnit.update({
    where: {
      id: unit.id,
    },
    data: {
      resolvedAt: tickAt,
      defenderArmyAtBattleStart: unit.targetFortress.army,
      resolvedAttackPower: 0,
      resolvedDefensePower: 0,
      attackerSurvivors: unit.armyAmount,
      attackerRetired: 0,
      attackerReturned: 0,
      defenderLosses: 0,
      pointsLooted: 0,
      foodLooted: 0,
      armyLooted: 0,
    },
  });

  return battlefield;
}

export async function joinBattlefield({
  db,
  userId,
  battlefieldId,
  side,
  armyAmount,
  now,
}: {
  db: PrismaClient;
  userId: string;
  battlefieldId: string;
  side: BattlefieldSide;
  armyAmount: number;
  now: Date;
}) {
  return db.$transaction(async (tx) => {
    if (!Number.isInteger(armyAmount) || armyAmount <= 0) {
      throw new GameError("Commit at least 1 army.");
    }

    const battlefield = await tx.battlefield.findUnique({
      where: {
        id: battlefieldId,
      },
      select: {
        id: true,
        cycleId: true,
        status: true,
        targetTileId: true,
        targetFortressId: true,
        defenderBannerFortressId: true,
        cycle: {
          select: {
            id: true,
            status: true,
            activeStartedAt: true,
            activeEndsAt: true,
          },
        },
        targetFortress: {
          select: {
            id: true,
            ownerId: true,
            points: true,
            gold: true,
            army: true,
            level: true,
            mapX: true,
            mapY: true,
            race: true,
          },
        },
        attackerBannerFortress: {
          select: {
            id: true,
            ownerId: true,
            points: true,
            gold: true,
            army: true,
            level: true,
            mapX: true,
            mapY: true,
            race: true,
          },
        },
      },
    });

    if (!battlefield || battlefield.status !== BattlefieldStatus.ACTIVE) {
      throw new GameError("That battlefield is no longer active.");
    }

    if (!battlefield.targetFortress) {
      throw new GameError(
        "That battlefield cannot receive reinforcements yet."
      );
    }

    if (
      battlefield.targetTileId &&
      isHomeOfATile(battlefield.targetTileId) &&
      side === BattlefieldSide.DEFENDER
    ) {
      throw new GameError("Home of A has no defender side.");
    }

    const fortress = await tx.fortress.findUnique({
      where: {
        cycleId_ownerId: {
          cycleId: battlefield.cycleId,
          ownerId: userId,
        },
      },
      select: {
        id: true,
        ownerId: true,
        points: true,
        gold: true,
        army: true,
        level: true,
        mapX: true,
        mapY: true,
        race: true,
      },
    });

    if (!fortress) {
      throw new GameError("You are not participating in this cycle.");
    }

    if (fortress.army < armyAmount) {
      throw new GameError("You do not have enough idle army.");
    }

    const outboundAttackCount = await tx.attackUnit.count({
      where: {
        attackerFortressId: fortress.id,
        resolvedAt: null,
        cancelledAt: null,
      },
    });
    const maxAttacks = getMaxSimultaneousAttacks(fortress.level, fortress.race);

    if (outboundAttackCount >= maxAttacks) {
      throw new GameError(
        `You have reached the maximum number of simultaneous attacks (${maxAttacks}).`
      );
    }

    const existing = await tx.battlefieldParticipant.findUnique({
      where: {
        battlefieldId_fortressId: {
          battlefieldId,
          fortressId: fortress.id,
        },
      },
      select: {
        side: true,
      },
    });

    if (existing && existing.side !== side) {
      throw new GameError(
        "Your fortress is already committed to the other side."
      );
    }

    const pendingCommitment = await tx.attackUnit.findFirst({
      where: {
        attackerFortressId: fortress.id,
        reinforcementBattlefieldId: battlefield.id,
        resolvedAt: null,
        cancelledAt: null,
      },
      select: {
        reinforcementSide: true,
      },
    });

    if (
      pendingCommitment?.reinforcementSide &&
      pendingCommitment.reinforcementSide !== side
    ) {
      throw new GameError(
        "Your fortress already has reinforcements marching for the other side."
      );
    }

    if (
      side === BattlefieldSide.DEFENDER &&
      !battlefield.defenderBannerFortressId
    ) {
      await tx.battlefield.update({
        where: {
          id: battlefield.id,
        },
        data: {
          defenderBannerFortressId: fortress.id,
        },
      });
    }

    const tilePosition = battlefield.targetTileId
      ? isHomeOfATile(battlefield.targetTileId)
        ? getHomeOfAMapPosition()
        : (() => {
            const t = getTileById(battlefield.targetTileId);
            return t
              ? { mapX: Math.round(t.xPercent), mapY: Math.round(t.yPercent) }
              : null;
          })()
      : null;
    const targetPosition = tilePosition ?? {
      mapX: battlefield.targetFortress.mapX,
      mapY: battlefield.targetFortress.mapY,
    };
    const travelTargetFortress =
      battlefield.targetFortress.id === fortress.id
        ? battlefield.attackerBannerFortress
        : battlefield.targetFortress;
    const reinforcementTarget = {
      ...travelTargetFortress,
      ...targetPosition,
    };

    const launchedUnit = await launchAttackUnit({
      db: tx,
      cycle: battlefield.cycle,
      attacker: fortress,
      target: reinforcementTarget,
      launchedAt: now,
      armyAmount,
    });

    if (!launchedUnit) {
      throw new GameError(
        "That reinforcement would arrive after the cycle ends."
      );
    }

    await tx.attackUnit.update({
      where: {
        id: launchedUnit.id,
      },
      data: {
        reinforcementBattlefieldId: battlefield.id,
        reinforcementSide: side,
      },
    });

    return launchedUnit;
  });
}

export async function processActiveBattlefields({
  db,
  cycleId,
  tickAt,
}: {
  db: DatabaseClient;
  cycleId: string;
  tickAt: Date;
}) {
  await ensureBattlefieldPointRewardColumn(db);

  const battlefields = await db.battlefield.findMany({
    where: {
      cycleId,
      status: BattlefieldStatus.ACTIVE,
      startedAt: {
        lte: tickAt,
      },
    },
    include: {
      attackerBannerFortress: {
        select: {
          id: true,
          race: true,
          doctrine: true,
          isNpc: true,
          fortressKind: true,
          orkBossOrders: {
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          dwarfGrudges: {
            select: {
              targetFortressId: true,
              bonusMultiplier: true,
            },
          },
          orkWaaaghInvestments: {
            where: {
              waaaghActivation: {
                activeFrom: {
                  lte: tickAt,
                },
                activeUntil: {
                  gt: tickAt,
                },
              },
            },
            select: {
              kind: true,
            },
          },
          skillPurchases: {
            select: { nodeKey: true },
          },
        },
      },
      defenderBannerFortress: {
        select: {
          id: true,
          race: true,
          doctrine: true,
          isNpc: true,
          fortressKind: true,
          raceAbilityActivations: {
            where: {
              activeUntil: {
                gt: tickAt,
              },
            },
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          orkBossOrders: {
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          dwarfGrudges: {
            select: {
              targetFortressId: true,
              bonusMultiplier: true,
            },
          },
          orkWaaaghInvestments: {
            where: {
              waaaghActivation: {
                activeFrom: {
                  lte: tickAt,
                },
                activeUntil: {
                  gt: tickAt,
                },
              },
            },
            select: {
              kind: true,
            },
          },
          skillPurchases: {
            select: { nodeKey: true },
          },
        },
      },
      targetFortress: {
        select: {
          id: true,
          army: true,
          points: true,
          gold: true,
          food: true,
          health: true,
          maxHealth: true,
          level: true,
          race: true,
          isNpc: true,
          fortressKind: true,
          raceAbilityActivations: {
            where: {
              activeUntil: {
                gt: tickAt,
              },
            },
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          orkBossOrders: {
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          castleUpgradeSpecializations: {
            select: {
              level: true,
              specialization: true,
            },
          },
          dwarfGrudges: {
            select: {
              targetFortressId: true,
              bonusMultiplier: true,
            },
          },
          orkWaaaghInvestments: {
            where: {
              waaaghActivation: {
                activeFrom: {
                  lte: tickAt,
                },
                activeUntil: {
                  gt: tickAt,
                },
              },
            },
            select: {
              kind: true,
            },
          },
          skillPurchases: {
            select: { nodeKey: true },
          },
        },
      },
      participants: {
        select: {
          id: true,
          fortressId: true,
          side: true,
          armyRemaining: true,
          armyCommitted: true,
          maintenanceDrains: true,
          fortress: {
            select: {
              id: true,
              ownerId: true,
              isNpc: true,
              fortressKind: true,
              race: true,
              raceAbilityActivations: {
                where: {
                  activeUntil: {
                    gt: tickAt,
                  },
                },
                select: {
                  kind: true,
                  activeFrom: true,
                  activeUntil: true,
                },
              },
              orkBossOrders: {
                select: {
                  kind: true,
                  activeFrom: true,
                  activeUntil: true,
                },
              },
              dwarfGrudges: {
                select: {
                  targetFortressId: true,
                  bonusMultiplier: true,
                },
              },
              orkWaaaghInvestments: {
                where: {
                  waaaghActivation: {
                    activeFrom: {
                      lte: tickAt,
                    },
                    activeUntil: {
                      gt: tickAt,
                    },
                  },
                },
                select: {
                  kind: true,
                },
              },
              skillPurchases: {
                select: { nodeKey: true },
              },
            },
          },
        },
      },
    },
  });
  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      id: true,
      status: true,
      ruleset: true,
      megaFortressDestroyCount: true,
      crownedFortressId: true,
      upgradesUnlockedAt: true,
    },
  });
  const titleFortresses = await db.fortress.findMany({
    where: {
      cycleId,
    },
    select: {
      id: true,
      name: true,
      points: true,
      unitsKilled: true,
      goblinsKilled: true,
      resourcesStolen: true,
      deliveredCargoValue: true,
      interceptedCargoValue: true,
      joinedAt: true,
      isNpc: true,
      fortressKind: true,
    },
  });
  const titleOwnerships = await db.mapHexOwnership.findMany({
    where: {
      cycleId,
    },
    select: {
      ownerFortressId: true,
      tileId: true,
    },
  });
  const titleTileCountsByFortressId = new Map<string, number>();
  const ownedTileDefensePercentByFortressId = new Map<string, number>();
  const ownedTileBiomesByFortressId = new Map<
    string,
    NonNullable<ReturnType<typeof getTileById>>["biome"][]
  >();

  for (const ownership of titleOwnerships) {
    if (isHomeOfATile(ownership.tileId)) {
      continue;
    }

    const tile = getTileById(ownership.tileId);

    titleTileCountsByFortressId.set(
      ownership.ownerFortressId,
      (titleTileCountsByFortressId.get(ownership.ownerFortressId) ?? 0) + 1
    );
    if (tile) {
      const biomes =
        ownedTileBiomesByFortressId.get(ownership.ownerFortressId) ?? [];
      biomes.push(tile.biome);
      ownedTileBiomesByFortressId.set(ownership.ownerFortressId, biomes);
      ownedTileDefensePercentByFortressId.set(
        ownership.ownerFortressId,
        (ownedTileDefensePercentByFortressId.get(
          ownership.ownerFortressId
        ) ?? 0) + sumTileBonuses([tile]).defensePercent
      );
    }
  }

  const leaderboardTitleHolders = getLeaderboardTitleHolders({
    fortresses: titleFortresses,
    tileCountsByFortressId: titleTileCountsByFortressId,
    cycleStatus: cycle?.status ?? CycleStatus.RESOLUTION,
    ruleset: cycle?.ruleset,
  });
  const isSeasonFour = cycle?.ruleset === CycleRuleset.SEASON_4;
  const getSeasonFourDefenseDoctrineMultiplier = (fortress: {
    race?: FortressRace | null;
    doctrine?: import("@/lib/prisma-client").FortressDoctrine | null;
    id: string;
  }) =>
    isSeasonFour
      ? getGuardDefenseDoctrineMultiplier(
          fortress.doctrine,
          getDoctrineTier({
            race: fortress.race,
            ownedTileBiomes: ownedTileBiomesByFortressId.get(fortress.id) ?? [],
          })
        )
      : 1;

  let resolved = 0;
  let scoreEventsCreated = 0;

  for (const battlefield of battlefields) {
    const battleAgeMinutes = Math.max(
      0,
      Math.floor((tickAt.getTime() - battlefield.startedAt.getTime()) / 60_000)
    );
    const progressDelta = getBattlefieldProgressDelta({
      battlefieldId: battlefield.id,
      tickAt,
    });
    const nextProgress = Math.min(100, battlefield.progress + progressDelta);
    const attackerParticipants = battlefield.participants.filter(
      (participant) => participant.side === BattlefieldSide.ATTACKER
    );
    const defenderParticipants = battlefield.participants.filter(
      (participant) => participant.side === BattlefieldSide.DEFENDER
    );
    const attackerArmyBefore = attackerParticipants.reduce(
      (sum, participant) => sum + participant.armyRemaining,
      0
    );
    const defenderParticipantArmyBefore = defenderParticipants.reduce(
      (sum, participant) => sum + participant.armyRemaining,
      0
    );
    const isHomeBossBattle =
      battlefield.targetTileId !== null &&
      isHomeOfATile(battlefield.targetTileId) &&
      battlefield.targetFortress?.fortressKind === FortressKind.MEGA;

    if (isSeasonFour && isHomeBossBattle) {
      continue;
    }

    const isRegularTileBattle =
      battlefield.targetTileId !== null &&
      !isHomeOfATile(battlefield.targetTileId);

    if (isSeasonFour && !isRegularTileBattle) {
      continue;
    }
    const storedDefenderArmy = isHomeBossBattle
      ? battlefield.defenderArmyRemaining
      : isRegularTileBattle
      ? defenderParticipantArmyBefore
      : battlefield.defenderArmyRemaining > 0
        ? battlefield.defenderArmyRemaining
        : battlefield.targetTileId !== null &&
            isHomeOfATile(battlefield.targetTileId) &&
            battlefield.defenderBannerFortressId
          ? (battlefield.targetFortress?.army ?? 0)
          : 0;
    const nativeDefenderArmyBefore = Math.max(
      0,
      storedDefenderArmy - defenderParticipantArmyBefore
    );
    const defenderArmyBefore =
      nativeDefenderArmyBefore + defenderParticipantArmyBefore;
    const nativeDefenderFortress =
      battlefield.defenderBannerFortress ?? battlefield.targetFortress;
    const defenderTileDefenseMultiplier =
      getBattlefieldTileDefensePowerMultiplier({
        targetTileId: battlefield.targetTileId,
        defenderRace: nativeDefenderFortress?.race,
        ownedTileDefensePercent:
          isRegularTileBattle && battlefield.defenderBannerFortressId
            ? (ownedTileDefensePercentByFortressId.get(
                battlefield.defenderBannerFortressId
              ) ?? 0)
            : 0,
        skillTileDefensePercent: getSkillTileDefensePercent(
          nativeDefenderFortress
        ),
        cycleId,
        tickAt,
      });
    const defenderCastleDefenseMultiplier =
      battlefield.targetTileId === null
        ? getBattlefieldCastleDefensePowerMultiplier({
            targetFortress: battlefield.targetFortress,
            ownedTileDefensePercent: battlefield.targetFortressId
              ? (ownedTileDefensePercentByFortressId.get(
                  battlefield.targetFortressId
                ) ?? 0)
              : 0,
            skillTileDefensePercent: getSkillTileDefensePercent(
              battlefield.targetFortress
            ),
          })
        : 1;
    const getWeightedParticipantMultiplier = ({
      participants,
      getMultiplier,
    }: {
      participants: typeof battlefield.participants;
      getMultiplier: (
        participant: (typeof battlefield.participants)[number]
      ) => number;
    }) => {
      const totalArmy = participants.reduce(
        (sum, participant) => sum + participant.armyRemaining,
        0
      );

      if (totalArmy <= 0) {
        return 1;
      }

      const effectiveArmy = participants.reduce(
        (sum, participant) =>
          sum + participant.armyRemaining * getMultiplier(participant),
        0
      );

      return effectiveArmy / totalArmy;
    };
    const attackerTargetFortress =
      battlefield.defenderBannerFortress ?? battlefield.targetFortress;
    const attackerTargetFortressId =
      battlefield.defenderBannerFortressId ?? battlefield.targetFortressId;
    const attackerPowerMultiplier = getWeightedParticipantMultiplier({
      participants: attackerParticipants,
      getMultiplier: (participant) =>
        getCombatAttackPowerMultiplier({
          fortress: participant.fortress,
          now: tickAt,
          targetFortressId: attackerTargetFortressId,
          targetIsPlayerFortress: isPlayerCombatTarget(attackerTargetFortress),
          leaderboardTitleHolders,
          leaderboardRuleset: cycle?.ruleset,
          enableLegacyAbilities: !isSeasonFour,
        }),
    });
    const defenderParticipantPower = defenderParticipants.reduce(
      (sum, participant) =>
        sum +
        participant.armyRemaining *
          getCombatDefensePowerMultiplier({
            fortress: participant.fortress,
            now: tickAt,
            opponentFortressId: battlefield.attackerBannerFortressId,
            opponentIsPlayerFortress: isPlayerCombatTarget(
              battlefield.attackerBannerFortress
            ),
            enableLegacyAbilities: !isSeasonFour,
          }) * getSeasonFourDefenseDoctrineMultiplier(participant.fortress),
      0
    );
    const nativeDefenderPower =
      nativeDefenderArmyBefore *
      (nativeDefenderFortress
        ? getCombatDefensePowerMultiplier({
            fortress: nativeDefenderFortress,
            now: tickAt,
            opponentFortressId: battlefield.attackerBannerFortressId,
            opponentIsPlayerFortress: isPlayerCombatTarget(
              battlefield.attackerBannerFortress
            ),
            enableLegacyAbilities: !isSeasonFour,
          }) * getSeasonFourDefenseDoctrineMultiplier(nativeDefenderFortress)
        : 1);
    const defenderPowerMultiplier =
      (defenderArmyBefore > 0
        ? (defenderParticipantPower + nativeDefenderPower) / defenderArmyBefore
        : 1) *
      defenderTileDefenseMultiplier *
      defenderCastleDefenseMultiplier;
    const attrition = isHomeBossBattle
      ? {
          attackerLosses: 0,
          defenderLosses: getHomeOfABossBattleDamage({
            attackerArmy: attackerArmyBefore,
            attackPowerMultiplier: attackerPowerMultiplier,
            bossHealth: nativeDefenderArmyBefore,
          }),
        }
      : getBattlefieldAttrition({
          battleAgeMinutes,
          attackerArmy: attackerArmyBefore,
          defenderArmy: defenderArmyBefore,
          attackerPowerMultiplier,
          defenderPowerMultiplier,
        });
    const stimAttackerParticipantIds = new Set(
      attackerParticipants
        .filter((participant) => hasCombatStim(participant.fortress, tickAt))
        .map((participant) => participant.id)
    );
    const stimDefenderParticipantIds = new Set(
      defenderParticipants
        .filter((participant) => hasCombatStim(participant.fortress, tickAt))
        .map((participant) => participant.id)
    );
    const attackerParticipantLosses = distributeBattlefieldLosses(
      attackerParticipants,
      attrition.attackerLosses,
      stimAttackerParticipantIds
    );
    const defenderParticipantLossBudget =
      defenderArmyBefore > 0
        ? Math.floor(
            (attrition.defenderLosses * defenderParticipantArmyBefore) /
              defenderArmyBefore
          )
        : 0;
    const defenderParticipantLosses = distributeBattlefieldLosses(
      defenderParticipants,
      defenderParticipantLossBudget,
      stimDefenderParticipantIds
    );
    const defenderNativeLosses = Math.min(
      nativeDefenderArmyBefore,
      attrition.defenderLosses - defenderParticipantLosses.appliedLosses
    );
    if (isHomeBossBattle && cycle && defenderNativeLosses > 0) {
      const weightedAttackers = attackerParticipants
        .filter((participant) => participant.armyRemaining > 0)
        .map((participant) => ({
          participant,
          weight:
            participant.armyRemaining *
            getCombatAttackPowerMultiplier({
              fortress: participant.fortress,
              now: tickAt,
              targetFortressId: battlefield.targetFortressId,
              targetIsPlayerFortress: isPlayerCombatTarget(
                battlefield.targetFortress
              ),
              leaderboardTitleHolders,
              leaderboardRuleset: cycle?.ruleset,
              enableLegacyAbilities: !isSeasonFour,
            }),
        }));
      const totalWeight = weightedAttackers.reduce(
        (sum, entry) => sum + entry.weight,
        0
      );
      let distributedDamage = 0;

      for (const [index, entry] of weightedAttackers.entries()) {
        const damage =
          index === weightedAttackers.length - 1
            ? defenderNativeLosses - distributedDamage
            : Math.floor((defenderNativeLosses * entry.weight) / totalWeight);

        if (damage <= 0) {
          continue;
        }

        distributedDamage += damage;
        await db.homeOfABossDamageContribution.upsert({
          where: {
            cycleId_bossGeneration_fortressId: {
              cycleId,
              bossGeneration: cycle.megaFortressDestroyCount,
              fortressId: entry.participant.fortressId,
            },
          },
          create: {
            cycleId,
            bossGeneration: cycle.megaFortressDestroyCount,
            fortressId: entry.participant.fortressId,
            damage,
            firstDamagedAt: tickAt,
            lastDamagedAt: tickAt,
          },
          update: {
            damage: {
              increment: damage,
            },
            lastDamagedAt: tickAt,
          },
        });
        if (battlefield.targetFortressId) {
          scoreEventsCreated += 1;
          await db.scoreEvent.create({
            data: {
              cycleId,
              fortressId: battlefield.targetFortressId,
              actorId: entry.participant.fortress.ownerId,
              targetFortressId: battlefield.targetFortressId,
              eventType: ScoreEventType.MEGA_DAMAGE,
              delta: -damage,
              createdAt: tickAt,
            },
          });
        }
      }
    }
    const attackerArmy = attackerParticipants.reduce(
      (sum, participant) => sum + participant.armyRemaining,
      0
    );
    const defenderParticipantArmy = defenderParticipants.reduce(
      (sum, participant) => sum + participant.armyRemaining,
      0
    );
    const attackerArmyAfter = Math.max(
      0,
      attackerArmy - attackerParticipantLosses.appliedLosses
    );
    const defenderParticipantArmyAfter = Math.max(
      0,
      defenderParticipantArmy - defenderParticipantLosses.appliedLosses
    );
    const nativeDefenderArmyAfter = Math.max(
      0,
      nativeDefenderArmyBefore - defenderNativeLosses
    );
    const targetDefenderArmy =
      nativeDefenderArmyAfter + defenderParticipantArmyAfter;
    if (isHomeBossBattle && battlefield.targetFortressId) {
      await db.fortress.update({
        where: {
          id: battlefield.targetFortressId,
        },
        data: {
          health: targetDefenderArmy,
        },
      });
    }
    const attritionUpdates = [
      ...Array.from(attackerParticipantLosses.lossesByParticipantId.entries()),
      ...Array.from(defenderParticipantLosses.lossesByParticipantId.entries()),
    ];

    for (const [participantId, losses] of attritionUpdates) {
      await db.battlefieldParticipant.update({
        where: {
          id: participantId,
        },
        data: {
          armyRemaining: {
            decrement: losses,
          },
        },
      });
    }

    const engaged = attackerArmyBefore > 0 && defenderArmyBefore > 0;
    const battlefieldResolved =
      targetDefenderArmy <= 0 || (engaged && attackerArmyAfter <= 0);

    if (attackerArmyBefore <= 0 && targetDefenderArmy > 0) {
      await db.battlefield.update({
        where: {
          id: battlefield.id,
        },
        data: {
          progress: Math.min(99, nextProgress),
          attackerArmyRemaining: 0,
          defenderArmyRemaining: targetDefenderArmy,
        },
      });
      continue;
    }

    if (!battlefieldResolved) {
      await db.battlefield.update({
        where: {
          id: battlefield.id,
        },
        data: {
          progress: nextProgress,
          attackerArmyRemaining: attackerArmyAfter,
          defenderArmyRemaining: targetDefenderArmy,
        },
      });
      continue;
    }

    const winnerSide =
      targetDefenderArmy <= 0 && attackerArmyAfter > 0
        ? BattlefieldSide.ATTACKER
        : BattlefieldSide.DEFENDER;
    const participantLosses =
      winnerSide === BattlefieldSide.ATTACKER
        ? attackerParticipantLosses.lossesByParticipantId
        : defenderParticipantLosses.lossesByParticipantId;
    const getParticipantSurvivors = (
      participant: (typeof battlefield.participants)[number]
    ) =>
      Math.max(
        0,
        participant.armyRemaining - (participantLosses.get(participant.id) ?? 0)
      );
    const winningParticipants = battlefield.participants.filter(
      (participant) => participant.side === winnerSide
    );
    const winnerArmyTotal = winningParticipants.reduce(
      (sum, participant) => sum + getParticipantSurvivors(participant),
      0
    );
    const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];

    const isTileBattle = battlefield.targetTileId !== null;
    const isRuneBattle =
      !isTileBattle &&
      battlefield.targetFortress?.fortressKind === "DWARF_RUNE";
    const attackerKilled = attackerParticipantLosses.appliedLosses;
    const defenderKilled =
      defenderParticipantLosses.appliedLosses + defenderNativeLosses;
    if (!isHomeBossBattle) {
      await incrementUnitsKilledForParticipants({
        db,
        participants: attackerParticipants,
        totalKills: defenderKilled,
      });
      await incrementUnitsKilledForParticipants({
        db,
        participants: defenderParticipants,
        totalKills: attackerKilled,
      });
    }
    const enemyKilled =
      winnerSide === BattlefieldSide.ATTACKER ? defenderKilled : attackerKilled;
    const killRewardPool = isHomeBossBattle ? 0 : Math.floor(enemyKilled * 0.2);
    const stealsFromPlayerCastle =
      !isTileBattle &&
      !isRuneBattle &&
      winnerSide === BattlefieldSide.ATTACKER &&
      battlefield.targetFortress &&
      !battlefield.targetFortress.isNpc &&
      battlefield.targetFortress.fortressKind === FortressKind.PLAYER;
    const castleLoot =
      !isTileBattle && winnerSide === BattlefieldSide.ATTACKER
        ? calculateBattlefieldCastleLoot({
            survivingAttackers: attackerArmyAfter,
            defenderGold: battlefield.targetFortress?.gold ?? 0,
            defenderFood: battlefield.targetFortress?.food ?? 0,
          })
        : { goldLooted: 0, foodLooted: 0 };
    const castleBankGoldLooted =
      !isTileBattle && winnerSide === BattlefieldSide.ATTACKER
        ? castleLoot.goldLooted
        : 0;
    const castleBankFoodLooted =
      !isTileBattle && winnerSide === BattlefieldSide.ATTACKER
        ? castleLoot.foodLooted
        : 0;
    const castlePointsLooted =
      !isTileBattle &&
      !isRuneBattle &&
      winnerSide === BattlefieldSide.ATTACKER &&
      battlefield.targetFortress
        ? Math.min(
            battlefield.targetFortress.points,
            Math.max(
              1,
              Math.floor(
                battlefield.targetFortress.points *
                  CASTLE_PVP_POINT_LOOT_PERCENT
              )
            )
          )
        : 0;

    let distributedGoldLoot = 0;
    let distributedFoodLoot = 0;
    let distributedPointLoot = 0;
    let distributedBaseGoldLoot = 0;
    let distributedBaseFoodLoot = 0;
    let distributedBasePointLoot = 0;

    for (const [participantIndex, participant] of winningParticipants.entries()) {
      const isLastParticipant =
        participantIndex === winningParticipants.length - 1;
      const share =
        winnerArmyTotal > 0
          ? getParticipantSurvivors(participant) / winnerArmyTotal
          : 0;
      const killReward = Math.floor(killRewardPool * share);
      const baseGoldLootShare = isLastParticipant
        ? castleBankGoldLooted - distributedBaseGoldLoot
        : Math.floor(castleBankGoldLooted * share);
      const baseFoodLootShare = isLastParticipant
        ? castleBankFoodLooted - distributedBaseFoodLoot
        : Math.floor(castleBankFoodLooted * share);
      const basePointLootShare =
        isLastParticipant
          ? castlePointsLooted - distributedBasePointLoot
          : Math.floor(castlePointsLooted * share);
      const castleLootMultiplier = stealsFromPlayerCastle
          ? getLeaderboardTitleCastleLootMultiplier(
            leaderboardTitleHolders,
            participant.fortressId,
            cycle?.ruleset
          )
        : 1;
      const goldLootShare = Math.min(
        Math.max(
          0,
          (battlefield.targetFortress?.gold ?? castleBankGoldLooted) -
            distributedGoldLoot
        ),
        Math.floor(baseGoldLootShare * castleLootMultiplier)
      );
      const foodLootShare = Math.min(
        Math.max(
          0,
          (battlefield.targetFortress?.food ?? castleBankFoodLooted) -
            distributedFoodLoot
        ),
        Math.floor(baseFoodLootShare * castleLootMultiplier)
      );
      const pointLootShare = Math.min(
        Math.max(
          0,
          (battlefield.targetFortress?.points ?? castlePointsLooted) -
            distributedPointLoot
        ),
        Math.floor(basePointLootShare * castleLootMultiplier)
      );
      const goldReward = killReward + goldLootShare;
      distributedBaseGoldLoot += baseGoldLootShare;
      distributedBaseFoodLoot += baseFoodLootShare;
      distributedBasePointLoot += basePointLootShare;
      distributedGoldLoot += goldLootShare;
      distributedFoodLoot += foodLootShare;
      distributedPointLoot += pointLootShare;
      const resourcesStolen =
        stealsFromPlayerCastle
          ? goldLootShare + foodLootShare + pointLootShare
          : 0;

      if (goldReward <= 0 && foodLootShare <= 0 && pointLootShare <= 0) {
        continue;
      }

      await db.fortress.update({
        where: {
          id: participant.fortressId,
        },
        data: {
          gold: {
            increment: goldReward,
          },
          points: {
            increment: pointLootShare,
          },
          food: {
            increment: foodLootShare,
          },
          ...(resourcesStolen > 0
            ? {
                resourcesStolen: {
                  increment: resourcesStolen,
                },
              }
            : {}),
        },
      });
      if (pointLootShare > 0) {
        scoreEvents.push({
          cycleId,
          fortressId: participant.fortressId,
          targetFortressId: battlefield.targetFortressId,
          eventType: ScoreEventType.BATTLEFIELD_REWARD,
          delta: pointLootShare,
          createdAt: tickAt,
        });
      }
      if (goldReward > 0) {
        scoreEvents.push({
          cycleId,
          fortressId: participant.fortressId,
          targetFortressId: battlefield.targetFortressId,
          eventType: isTileBattle
            ? ScoreEventType.TILE_BATTLE_REWARD
            : ScoreEventType.BATTLEFIELD_REWARD,
          delta: goldReward,
          createdAt: tickAt,
        });
      }
    }

    const targetGoldLooted = stealsFromPlayerCastle
      ? distributedGoldLoot
      : castleBankGoldLooted;
    const targetFoodLooted = stealsFromPlayerCastle
      ? distributedFoodLoot
      : castleBankFoodLooted;
    const targetPointsLooted = stealsFromPlayerCastle
      ? distributedPointLoot
      : castlePointsLooted;

    if (battlefield.targetFortressId && !isTileBattle) {
      const fortressUpdateData: Prisma.FortressUpdateInput = {
        army: Math.max(0, targetDefenderArmy),
      };

      fortressUpdateData.gold = {
        decrement:
          winnerSide === BattlefieldSide.ATTACKER ? targetGoldLooted : 0,
      };
      fortressUpdateData.food = {
        decrement:
          winnerSide === BattlefieldSide.ATTACKER ? targetFoodLooted : 0,
      };
      fortressUpdateData.points = {
        decrement:
          winnerSide === BattlefieldSide.ATTACKER ? targetPointsLooted : 0,
      };

      await db.fortress.update({
        where: {
          id: battlefield.targetFortressId,
        },
        data: fortressUpdateData,
      });

      if (isRuneBattle && winnerSide === BattlefieldSide.ATTACKER) {
        await db.fortress.update({
          where: {
            id: battlefield.targetFortressId,
          },
          data: {
            health: 0,
            army: 0,
            expiresAt: tickAt,
          },
        });

        await db.raceAbilityActivation.updateMany({
          where: {
            kind: "DWARF_RUNE_GRUDGES",
            runeFortressId: battlefield.targetFortressId,
            consumedAt: null,
            activeUntil: {
              gt: tickAt,
            },
          },
          data: {
            consumedAt: tickAt,
            activeUntil: tickAt,
          },
        });

        await db.fortress.update({
          where: {
            id: battlefield.attackerBannerFortressId,
          },
          data: {
            gold: {
              increment: DWARF_DEEP_MINING_RUNE_BOUNTY,
            },
          },
        });

        scoreEvents.push({
          cycleId,
          fortressId: battlefield.attackerBannerFortressId,
          targetFortressId: battlefield.targetFortressId,
          eventType: ScoreEventType.DWARF_RUNE_BOUNTY,
          delta: DWARF_DEEP_MINING_RUNE_BOUNTY,
          createdAt: tickAt,
        });
      }
    }

    // Handle defender fortress army losses for owned Home of A battles
    if (
      battlefield.targetTileId !== null &&
      isHomeOfATile(battlefield.targetTileId) &&
      battlefield.defenderBannerFortressId &&
      battlefield.targetFortressId &&
      winnerSide === BattlefieldSide.ATTACKER
    ) {
      await db.fortress.update({
        where: {
          id: battlefield.targetFortressId,
        },
        data: {
          army: {
            decrement: defenderNativeLosses,
          },
        },
      });
    }

    if (battlefield.targetTileId !== null) {
      const isHomeTileBattle = isHomeOfATile(battlefield.targetTileId);

      if (!isHomeTileBattle && winnerSide === BattlefieldSide.ATTACKER) {
        await db.mapHexOwnership.upsert({
          where: {
            cycleId_tileId: {
              cycleId,
              tileId: battlefield.targetTileId,
            },
          },
          create: {
            cycleId,
            tileId: battlefield.targetTileId,
            ownerFortressId: battlefield.attackerBannerFortressId,
            claimedAt: tickAt,
          },
          update: {
            ownerFortressId: battlefield.attackerBannerFortressId,
            claimedAt: tickAt,
          },
        });
      }

      const garrisonParticipants =
        winnerSide === BattlefieldSide.ATTACKER
          ? attackerParticipants
          : defenderParticipants;
      const garrisonLosses =
        winnerSide === BattlefieldSide.ATTACKER
          ? attackerParticipantLosses.lossesByParticipantId
          : defenderParticipantLosses.lossesByParticipantId;

      if (!isHomeTileBattle) {
        // Create garrisons for each winning participant with surviving army.
        for (const participant of garrisonParticipants) {
          const surviving = Math.max(
            0,
            (participant.armyRemaining ?? 0) -
              (garrisonLosses.get(participant.id) ?? 0)
          );

          if (surviving > 0) {
            await db.fortressGarrison.upsert({
              where: {
                battlefieldId_fortressId: {
                  battlefieldId: battlefield.id,
                  fortressId: participant.fortressId,
                },
              },
              create: {
                cycleId,
                battlefieldId: battlefield.id,
                fortressId: participant.fortressId,
                tileId: battlefield.targetTileId,
                army: surviving,
                maintenanceDrains: participant.maintenanceDrains,
              },
              update: {
                army: {
                  increment: surviving,
                },
                maintenanceDrains: participant.maintenanceDrains,
              },
            });
          }
        }
      }

      if (
        winnerSide === BattlefieldSide.ATTACKER &&
        battlefield.attackerBannerFortress &&
        isRealOrkPlayerFortress(battlefield.attackerBannerFortress)
      ) {
        await applyOrkScrapDelta({
          db,
          cycleId,
          fortressId: battlefield.attackerBannerFortress.id,
          delta: getOrkTileBattleScrap(isHomeOfATile(battlefield.targetTileId)),
          reason: isHomeOfATile(battlefield.targetTileId)
            ? OrkScrapEventReason.HOME_OF_A_BATTLE
            : OrkScrapEventReason.TILE_BATTLE,
          now: tickAt,
          targetFortressId: battlefield.targetFortressId,
          tileId: battlefield.targetTileId,
          battlefieldId: battlefield.id,
        });
      }

      if (
        winnerSide === BattlefieldSide.ATTACKER &&
        isHomeTileBattle
      ) {
        await db.homeOfAHolder.deleteMany({ where: { cycleId } });
      }
    }

    if (isHomeBossBattle && battlefield.targetFortressId) {
      for (const participant of attackerParticipants) {
        const surviving = Math.max(
          0,
          participant.armyRemaining -
            (attackerParticipantLosses.lossesByParticipantId.get(
              participant.id
            ) ?? 0)
        );

        if (surviving > 0) {
          await db.fortress.update({
            where: {
              id: participant.fortressId,
            },
            data: {
              army: {
                increment: surviving,
              },
            },
          });
        }
      }

      const homeBossArrivalReports = await db.attackUnit.findMany({
        where: {
          cycleId,
          targetFortressId: battlefield.targetFortressId,
          attackerFortressId: {
            in: attackerParticipants.map(
              (participant) => participant.fortressId
            ),
          },
          reinforcementBattlefieldId: null,
          fortifyTargetTileId: null,
          cancelledAt: null,
          recalledAt: null,
          resolvedAt: {
            not: null,
            lte: tickAt,
          },
          arrivesAt: {
            gte: battlefield.startedAt,
            lte: tickAt,
          },
          resolvedAttackPower: 0,
          resolvedDefensePower: 0,
          attackerRetired: 0,
          attackerReturned: 0,
          defenderLosses: 0,
          pointsLooted: 0,
          foodLooted: 0,
          armyLooted: 0,
        },
        select: {
          id: true,
          armyAmount: true,
        },
      });

      for (const report of homeBossArrivalReports) {
        await db.attackUnit.update({
          where: {
            id: report.id,
          },
          data: {
            attackerSurvivors: report.armyAmount,
            attackerReturned: report.armyAmount,
          },
        });
      }

      if (
        cycle &&
        winnerSide === BattlefieldSide.ATTACKER &&
        targetDefenderArmy <= 0
      ) {
        const winnerContribution =
          await db.homeOfABossDamageContribution.findFirst({
            where: {
              cycleId,
              bossGeneration: cycle.megaFortressDestroyCount,
            },
            orderBy: [
              { damage: "desc" },
              { firstDamagedAt: "asc" },
              { fortressId: "asc" },
            ],
            include: {
              fortress: {
                select: {
                  id: true,
                  ownerId: true,
                  name: true,
                  commanderName: true,
                },
              },
            },
          });

        if (winnerContribution) {
          const reward = getHomeOfABossReward(
            battlefield.targetFortress?.maxHealth ?? 0
          );

          await db.fortress.update({
            where: {
              id: winnerContribution.fortressId,
            },
            data: {
              points: {
                increment: reward,
              },
              food: {
                increment: reward,
              },
              army: {
                increment: reward,
              },
            },
          });
          scoreEvents.push({
            cycleId,
            fortressId: winnerContribution.fortressId,
            actorId: winnerContribution.fortress.ownerId,
            targetFortressId: battlefield.targetFortressId,
            eventType: ScoreEventType.MEGA_DESTROY_BONUS,
            delta: reward,
            createdAt: tickAt,
          });
          await db.raceAbilityActivation.create({
            data: {
              fortressId: winnerContribution.fortressId,
              kind: RaceAbilityKind.HOME_OF_A_BOSS_BUFF,
              activeFrom: tickAt,
              activeUntil: addHours(tickAt, HOME_OF_A_BOSS_BUFF_HOURS),
              usedAt: tickAt,
              expiresAt: addHours(tickAt, HOME_OF_A_BOSS_BUFF_HOURS),
              targetFortressId: battlefield.targetFortressId,
            },
          });
          const systemUser = await ensureNpcSystemUser(db);
          await db.chatMessage.create({
            data: {
              cycleId,
              authorId: systemUser.id,
              type: ChatMessageType.TEXT,
              body: getHomeOfABossDefeatAnnouncement({
                fortressName: winnerContribution.fortress.name,
                commanderName: winnerContribution.fortress.commanderName,
                reward,
              }),
              createdAt: tickAt,
            },
          });
          await db.cycle.update({
            where: {
              id: cycleId,
            },
            data: {
              crownedFortressId:
                cycle.crownedFortressId ?? winnerContribution.fortressId,
              upgradesUnlockedAt: cycle.upgradesUnlockedAt ?? tickAt,
              homeOfABossRespawnsAt: addHours(
                tickAt,
                HOME_OF_A_BOSS_RESPAWN_HOURS
              ),
              megaFortressDestroyCount: {
                increment: 1,
              },
            },
          });
        }
      }
    }

    if (
      !isTileBattle &&
      !isHomeBossBattle &&
      winnerSide === BattlefieldSide.ATTACKER &&
      attackerArmyAfter > 0
    ) {
      const returnedArmyByFortressId = distributeReturnedArmyToParticipants(
        attackerParticipants,
        attackerArmyAfter,
        attackerParticipantLosses.lossesByParticipantId
      );

      for (const [fortressId, returnedArmy] of returnedArmyByFortressId) {
        await db.fortress.update({
          where: {
            id: fortressId,
          },
          data: {
            army: {
              increment: returnedArmy,
            },
          },
        });
      }
    }

    await db.battlefield.update({
      where: {
        id: battlefield.id,
      },
      data: {
        status: BattlefieldStatus.RESOLVED,
        progress: nextProgress,
        attackerArmyRemaining: attackerArmyAfter,
        defenderArmyRemaining: targetDefenderArmy,
        pointsReward: isTileBattle
          ? battlefield.pointsReward
          : targetGoldLooted,
        foodReward: isTileBattle
          ? battlefield.foodReward
          : targetFoodLooted,
        pointReward: isTileBattle ? 0 : targetPointsLooted,
        resolvedWinnerSide: winnerSide,
        resolvedAt: tickAt,
      },
    });

    if (scoreEvents.length > 0) {
      await db.scoreEvent.createMany({
        data: scoreEvents,
      });
      scoreEventsCreated += scoreEvents.length;
    }

    resolved += 1;
  }

  return {
    resolved,
    scoreEventsCreated,
  };
}
