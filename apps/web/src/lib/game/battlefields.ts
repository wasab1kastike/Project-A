import {
  BattlefieldSide,
  BattlefieldStatus,
  OrkScrapEventReason,
  Prisma,
  PrismaClient,
  ScoreEventType,
} from "@/lib/prisma-client";
import { calculateRaidOutcome } from "./balance";
import { GameError } from "./errors";
import { countCastleSpecializations } from "./specializations";
import { launchAttackUnit } from "./attack-units";
import { getDwarfGrudgeMultiplier } from "./race-buffs";
import { isHomeOfATile } from "./territory";
import { getMaxSimultaneousAttacks } from "./upgrades";
import {
  applyOrkScrapDelta,
  getOrkBossOrderAttackMultiplier,
  getOrkBossOrderDefenseMultiplier,
  getOrkTileBattleScrap,
  isRealOrkPlayerFortress,
} from "./orks";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function hashBattleTick(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getBattlefieldProgressDelta({
  battlefieldId,
  tickAt,
}: {
  battlefieldId: string;
  tickAt: Date;
}) {
  return 1 + (hashBattleTick(`${battlefieldId}:${tickAt.toISOString()}`) % 5);
}

export function getBattlefieldAttrition({
  battlefieldId,
  tickAt,
  attackerArmy,
  defenderArmy,
  attackerPowerMultiplier = 1,
  defenderPowerMultiplier = 1,
}: {
  battlefieldId: string;
  tickAt: Date;
  attackerArmy: number;
  defenderArmy: number;
  attackerPowerMultiplier?: number;
  defenderPowerMultiplier?: number;
}) {
  if (attackerArmy <= 0 || defenderArmy <= 0) {
    return {
      attackerLosses: 0,
      defenderLosses: 0,
    };
  }

  const attackerPressure =
    2 +
    (hashBattleTick(`${battlefieldId}:attacker:${tickAt.toISOString()}`) % 5);
  const defenderPressure =
    2 +
    (hashBattleTick(`${battlefieldId}:defender:${tickAt.toISOString()}`) % 5);
  const effectiveAttackerArmy = Math.max(
    1,
    Math.floor(attackerArmy * Math.max(0, attackerPowerMultiplier))
  );
  const effectiveDefenderArmy = Math.max(
    1,
    Math.floor(defenderArmy * Math.max(0, defenderPowerMultiplier))
  );

  // Sublinear attrition: losses = 2.3 * army^0.28 * pressure/4
  // Calibrated so equal armies of 1k resolve in ~1h, 10k ~5h, 100k ~24h
  const ATTRITION_SCALE = 2.3;
  const ATTRITION_EXPONENT = 0.28;
  const PRESSURE_BASE = 4;
  // Faster resolution when force sizes are uneven.
  // ratio 1.0 => 1.0x (unchanged), ratio 2.0 => 1.5x (~40 min for 1k vs 2k)
  const imbalanceRatio =
    Math.max(effectiveAttackerArmy, effectiveDefenderArmy) /
    Math.max(1, Math.min(effectiveAttackerArmy, effectiveDefenderArmy));
  const imbalanceSpeedMultiplier = Math.min(
    2.5,
    1 + (imbalanceRatio - 1) * 0.5
  );

  return {
    attackerLosses: Math.min(
      attackerArmy,
      Math.max(
        1,
        Math.floor(
          ATTRITION_SCALE *
            Math.pow(effectiveDefenderArmy, ATTRITION_EXPONENT) *
            (defenderPressure / PRESSURE_BASE) *
            imbalanceSpeedMultiplier
        )
      )
    ),
    defenderLosses: Math.min(
      defenderArmy,
      Math.max(
        1,
        Math.floor(
          ATTRITION_SCALE *
            Math.pow(effectiveAttackerArmy, ATTRITION_EXPONENT) *
            (attackerPressure / PRESSURE_BASE) *
            imbalanceSpeedMultiplier
        )
      )
    ),
  };
}

function distributeLosses<
  TParticipant extends {
    id: string;
    armyRemaining: number;
    armyCommitted: number;
  },
>(participants: TParticipant[], totalLosses: number) {
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

  for (const participant of livingParticipants) {
    const proportionalLoss = Math.floor(
      (cappedLosses * participant.armyRemaining) / livingArmy
    );
    const loss = Math.min(participant.armyRemaining, proportionalLoss);

    if (loss > 0) {
      lossesByParticipantId.set(participant.id, loss);
      appliedLosses += loss;
    }
  }

  let remainder = cappedLosses - appliedLosses;

  for (const participant of [...livingParticipants].sort(
    (left, right) =>
      right.armyRemaining - left.armyRemaining ||
      right.armyCommitted - left.armyCommitted ||
      left.id.localeCompare(right.id)
  )) {
    if (remainder <= 0) {
      break;
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
          level: true,
          race: true,
          isNpc: true,
          fortressKind: true,
          orkBossOrders: {
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          castleUpgradeSpecializations: {
            select: {
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

  const battlefield =
    existing ??
    (await db.battlefield.create({
      data: {
        cycleId: unit.cycleId,
        targetFortressId: unit.targetFortressId,
        attackerBannerFortressId: unit.attackerFortressId,
        defenderBannerFortressId: unit.targetFortressId,
        attackerArmyRemaining: unit.armyAmount,
        defenderArmyRemaining: unit.targetFortress.army,
        pointsReward: Math.floor(unit.targetFortress.gold * 0.7),
        foodReward: Math.floor(unit.targetFortress.food * 0.7),
        startedAt: tickAt,
      },
      select: {
        id: true,
      },
    }));

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
      side === BattlefieldSide.DEFENDER &&
      !battlefield.defenderBannerFortressId
    ) {
      throw new GameError("Neutral Home of A has no player defender side yet.");
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

    const launchedUnit = await launchAttackUnit({
      db: tx,
      cycle: battlefield.cycle,
      attacker: fortress,
      target: battlefield.targetFortress,
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
  const battlefields = await db.battlefield.findMany({
    where: {
      cycleId,
      status: BattlefieldStatus.ACTIVE,
    },
    include: {
      attackerBannerFortress: {
        select: {
          id: true,
          race: true,
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
        },
      },
      defenderBannerFortress: {
        select: {
          id: true,
          race: true,
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
        },
      },
      targetFortress: {
        select: {
          id: true,
          army: true,
          points: true,
          gold: true,
          food: true,
          level: true,
          race: true,
          isNpc: true,
          fortressKind: true,
          orkBossOrders: {
            select: {
              kind: true,
              activeFrom: true,
              activeUntil: true,
            },
          },
          castleUpgradeSpecializations: {
            select: {
              specialization: true,
            },
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
        },
      },
    },
  });

  let resolved = 0;
  let scoreEventsCreated = 0;

  for (const battlefield of battlefields) {
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
    const storedDefenderArmy =
      battlefield.defenderArmyRemaining > 0
        ? battlefield.defenderArmyRemaining
        : (battlefield.targetFortress?.army ?? 0);
    const nativeDefenderArmyBefore = Math.max(
      0,
      storedDefenderArmy - defenderParticipantArmyBefore
    );
    const defenderArmyBefore =
      nativeDefenderArmyBefore + defenderParticipantArmyBefore;
    const attackerGrudgeMultiplier =
      battlefield.attackerBannerFortress?.race === "DWARFS"
        ? battlefield.targetFortressId
          ? getDwarfGrudgeMultiplier(
              battlefield.attackerBannerFortress.dwarfGrudges,
              battlefield.targetFortressId
            )
          : 1
        : 1;
    const defenderGrudgeMultiplier =
      battlefield.defenderBannerFortress?.race === "DWARFS"
        ? getDwarfGrudgeMultiplier(
            battlefield.defenderBannerFortress.dwarfGrudges,
            battlefield.attackerBannerFortressId
          )
        : 1;
    const defenderTileDefenseMultiplier =
      battlefield.targetTileId !== null &&
      (battlefield.defenderBannerFortress?.race === "DWARFS" ||
        battlefield.targetFortress?.race === "DWARFS")
        ? 1.25
        : 1;
    const attackerBossOrderMultiplier =
      battlefield.attackerBannerFortress?.race === "ORKS"
        ? getOrkBossOrderAttackMultiplier(
            battlefield.attackerBannerFortress.orkBossOrders,
            tickAt
          )
        : 1;
    const defenderBossOrderMultiplier =
      battlefield.defenderBannerFortress?.race === "ORKS"
        ? getOrkBossOrderDefenseMultiplier(
            battlefield.defenderBannerFortress.orkBossOrders,
            tickAt
          )
        : battlefield.targetFortress?.race === "ORKS"
          ? getOrkBossOrderDefenseMultiplier(
              battlefield.targetFortress.orkBossOrders,
              tickAt
            )
          : 1;
    const attrition = getBattlefieldAttrition({
      battlefieldId: battlefield.id,
      tickAt,
      attackerArmy: attackerArmyBefore,
      defenderArmy: defenderArmyBefore,
      attackerPowerMultiplier: attackerGrudgeMultiplier * attackerBossOrderMultiplier,
      defenderPowerMultiplier:
        defenderGrudgeMultiplier *
        defenderTileDefenseMultiplier *
        defenderBossOrderMultiplier,
    });
    const attackerParticipantLosses = distributeLosses(
      attackerParticipants,
      attrition.attackerLosses
    );
    const defenderParticipantLossBudget =
      defenderArmyBefore > 0
        ? Math.floor(
            (attrition.defenderLosses * defenderParticipantArmyBefore) /
              defenderArmyBefore
          )
        : 0;
    const defenderParticipantLosses = distributeLosses(
      defenderParticipants,
      defenderParticipantLossBudget
    );
    const defenderNativeLosses = Math.min(
      nativeDefenderArmyBefore,
      attrition.defenderLosses - defenderParticipantLosses.appliedLosses
    );
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
    const earlyResolved =
      engaged && (attackerArmyAfter <= 0 || targetDefenderArmy <= 0);

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

    if (nextProgress < 100 && !earlyResolved) {
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

    const outcome =
      targetDefenderArmy <= 0 && attackerArmyAfter > 0
        ? calculateRaidOutcome({
            attackArmy: attackerArmyAfter,
            defenderArmy: 0,
            defenderDbLevel: 0,
            defenderRace: null,
            defenderGold: battlefield.targetFortress?.gold ?? 0,
            defenderFood: battlefield.targetFortress?.food ?? 0,
            attackPowerMultiplier: attackerGrudgeMultiplier * attackerBossOrderMultiplier,
            defensePowerMultiplier:
              defenderGrudgeMultiplier *
              defenderTileDefenseMultiplier *
              defenderBossOrderMultiplier,
          })
        : calculateRaidOutcome({
            attackArmy: attackerArmyAfter,
            defenderArmy: targetDefenderArmy,
            defenderDbLevel: battlefield.targetFortress?.level ?? 0,
            defenderRace: battlefield.targetFortress?.race ?? null,
            defenderCastleSpecializations: battlefield.targetFortress
              ? countCastleSpecializations(
                  battlefield.targetFortress.castleUpgradeSpecializations
                )
              : undefined,
            attackPowerMultiplier: attackerGrudgeMultiplier * attackerBossOrderMultiplier,
            defensePowerMultiplier:
              defenderGrudgeMultiplier *
              defenderTileDefenseMultiplier *
              defenderBossOrderMultiplier,
            defenderGold: battlefield.targetFortress?.gold ?? 0,
            defenderFood: battlefield.targetFortress?.food ?? 0,
          });
    const winnerSide =
      outcome.outcome === "ATTACKER_WIN"
        ? BattlefieldSide.ATTACKER
        : BattlefieldSide.DEFENDER;
    const winningParticipants = battlefield.participants.filter(
      (participant) => participant.side === winnerSide
    );
    const winnerArmyTotal = winningParticipants.reduce(
      (sum, participant) => sum + participant.armyCommitted,
      0
    );
    const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];

    const isTileBattle = battlefield.targetTileId !== null;

    for (const participant of winningParticipants) {
      const share =
        winnerArmyTotal > 0 ? participant.armyCommitted / winnerArmyTotal : 0;
      const rewardPool = isTileBattle
        ? 0
        : outcome.goldLooted + battlefield.pointsReward;
      const reward =
        winnerSide === BattlefieldSide.ATTACKER
          ? Math.floor(rewardPool * share)
          : Math.max(1, Math.floor(participant.armyCommitted * 0.2));

      if (reward <= 0) {
        continue;
      }

      await db.fortress.update({
        where: {
          id: participant.fortressId,
        },
        data: {
          gold: {
            increment: reward,
          },
        },
      });
      scoreEvents.push({
        cycleId,
        fortressId: participant.fortressId,
        targetFortressId: battlefield.targetFortressId,
        eventType: isTileBattle
          ? ScoreEventType.TILE_BATTLE_REWARD
          : ScoreEventType.BATTLEFIELD_REWARD,
        delta: reward,
        createdAt: tickAt,
      });
    }

    if (battlefield.targetFortressId) {
      const fortressUpdateData: Prisma.FortressUpdateInput = {
        army: Math.max(0, targetDefenderArmy - outcome.defenderLosses),
      };

      // Only apply gold/food losses for direct fortress battles, not tile battles
      if (!isTileBattle) {
        fortressUpdateData.gold = {
          decrement:
            winnerSide === BattlefieldSide.ATTACKER ? outcome.goldLooted : 0,
        };
        fortressUpdateData.food = {
          decrement:
            winnerSide === BattlefieldSide.ATTACKER ? outcome.foodLooted : 0,
        };
      }

      await db.fortress.update({
        where: {
          id: battlefield.targetFortressId,
        },
        data: fortressUpdateData,
      });
    }

    if (
      winnerSide === BattlefieldSide.ATTACKER &&
      battlefield.targetTileId !== null
    ) {
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

      // Create garrisons for each attacker participant with surviving army
      for (const participant of attackerParticipants) {
        const surviving = Math.max(
          0,
          (participant.armyRemaining ?? 0) - (attackerParticipantLosses.lossesByParticipantId.get(participant.id) ?? 0)
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
            },
            update: {
              army: {
                increment: surviving,
              },
            },
          });
        }
      }

      if (
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

      if (isHomeOfATile(battlefield.targetTileId)) {
        await db.homeOfAHolder.deleteMany({
          where: {
            cycleId,
          },
        });

        const winningWeight = winningParticipants.reduce(
          (sum, participant) => sum + Math.max(0, participant.armyCommitted),
          0
        );
        const holders =
          winningWeight > 0
            ? winningParticipants
                .filter((participant) => participant.armyCommitted > 0)
                .map((participant) => ({
                  cycleId,
                  fortressId: participant.fortressId,
                  bannerFortressId: battlefield.attackerBannerFortressId,
                  contributionWeight: participant.armyCommitted,
                  capturedAt: tickAt,
                }))
            : [
                {
                  cycleId,
                  fortressId: battlefield.attackerBannerFortressId,
                  bannerFortressId: battlefield.attackerBannerFortressId,
                  contributionWeight: 1,
                  capturedAt: tickAt,
                },
              ];

        await db.homeOfAHolder.createMany({
          data: holders,
        });
      }
    }

    await db.battlefield.update({
      where: {
        id: battlefield.id,
      },
      data: {
        status: BattlefieldStatus.RESOLVED,
        progress: earlyResolved ? nextProgress : 100,
        attackerArmyRemaining: outcome.attackerReturned,
        defenderArmyRemaining: Math.max(
          0,
          targetDefenderArmy - outcome.defenderLosses
        ),
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
