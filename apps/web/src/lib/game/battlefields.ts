import {
  BattlefieldSide,
  BattlefieldStatus,
  Prisma,
  PrismaClient,
  ScoreEventType,
} from "@/lib/prisma-client";
import { calculateRaidOutcome } from "./balance";
import { GameError } from "./errors";
import { countCastleSpecializations } from "./specializations";
import { launchAttackUnit } from "./attack-units";
import { isHomeOfATile } from "./territory";

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
          food: true,
          level: true,
          race: true,
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
        pointsReward: Math.floor(unit.targetFortress.points * 0.7),
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
            army: true,
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
      throw new GameError("That battlefield cannot receive reinforcements yet.");
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
        army: true,
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
      throw new GameError("Your fortress is already committed to the other side.");
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
      throw new GameError("That reinforcement would arrive after the cycle ends.");
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
      targetFortress: {
        select: {
          id: true,
          army: true,
          points: true,
          food: true,
          level: true,
          race: true,
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
    const attackerArmy = battlefield.participants
      .filter((participant) => participant.side === BattlefieldSide.ATTACKER)
      .reduce((sum, participant) => sum + participant.armyRemaining, 0);
    const defenderArmy = battlefield.participants
      .filter((participant) => participant.side === BattlefieldSide.DEFENDER)
      .reduce((sum, participant) => sum + participant.armyRemaining, 0);
    const targetDefenderArmy =
      defenderArmy > 0 ? defenderArmy : (battlefield.targetFortress?.army ?? 0);

    if (nextProgress < 100) {
      await db.battlefield.update({
        where: {
          id: battlefield.id,
        },
        data: {
          progress: nextProgress,
          attackerArmyRemaining: attackerArmy,
          defenderArmyRemaining: targetDefenderArmy,
        },
      });
      continue;
    }

    const outcome =
      targetDefenderArmy <= 0 && attackerArmy > 0
        ? calculateRaidOutcome({
            attackArmy: attackerArmy,
            defenderArmy: 0,
            defenderDbLevel: 0,
            defenderRace: null,
            defenderPoints: battlefield.targetFortress?.points ?? 0,
            defenderFood: battlefield.targetFortress?.food ?? 0,
          })
        : calculateRaidOutcome({
            attackArmy: attackerArmy,
            defenderArmy: targetDefenderArmy,
            defenderDbLevel: battlefield.targetFortress?.level ?? 0,
            defenderRace: battlefield.targetFortress?.race ?? null,
            defenderCastleSpecializations:
              battlefield.targetFortress
                ? countCastleSpecializations(
                    battlefield.targetFortress.castleUpgradeSpecializations
                  )
                : undefined,
            defenderPoints: battlefield.targetFortress?.points ?? 0,
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
      const reward =
        winnerSide === BattlefieldSide.ATTACKER
          ? Math.floor(
              ((isTileBattle ? 0 : outcome.pointsLooted) +
                battlefield.pointsReward) *
                share
            )
          : Math.max(1, Math.floor(participant.armyCommitted * 0.2));

      if (reward <= 0) {
        continue;
      }

      await db.fortress.update({
        where: {
          id: participant.fortressId,
        },
        data: {
          points: {
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

    if (battlefield.targetFortressId && !isTileBattle) {
      await db.fortress.update({
        where: {
          id: battlefield.targetFortressId,
        },
        data: {
          points: {
            decrement:
              winnerSide === BattlefieldSide.ATTACKER
                ? outcome.pointsLooted
                : 0,
          },
          food: {
            decrement:
              winnerSide === BattlefieldSide.ATTACKER ? outcome.foodLooted : 0,
          },
          army: Math.max(0, targetDefenderArmy - outcome.defenderLosses),
        },
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
        progress: 100,
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
