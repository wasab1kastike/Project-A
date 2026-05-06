import {
  CycleStatus,
  FortressKind,
  FortressAction,
  Prisma,
  PrismaClient,
  ScoreEventType,
  DwarfDeepMiningOutcome,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import { ensureOpenRegistrationCycle } from "./bootstrap";
import {
  HOME_OF_A_POINT_INCOME,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  TESTING_DURATION_HOURS,
  TESTING_ENDS_BEFORE_ACTIVE_HOURS,
} from "./constants";
import { mintSeasonArcadeCoins } from "./arcade";
import {
  COMMUNITY_WISH_VOTING_WINDOW_HOURS,
  createCommunityWishVoteEntitlements,
  getCommunityWishProposalEndsAt,
  resolveExpiredCommunityWishVotes,
} from "./community-wishes";
import { getNextHelsinkiWeekdayAtHour } from "./calendar";
import {
  ensureCurrentMapLayout,
  ensureActiveCycleMegaFortress,
  ensureMegaFortress,
  reshuffleActiveFortressPositions,
} from "./mega-fortress";
import { getAttackArrivalAt } from "./attacks";
import { buildFortressSpawnSeed } from "./spawn-layout";
import { addHours, addMinutes, floorToMinute } from "./time";
import { calculateRaidOutcome, calculateTickProduction, ORK_STRONGER_TOGETHER_RATE } from "./balance";
import { canFortressLevelUp, getFortressAttackDamage } from "./upgrades";
import {
  getDwarfGrudgeMultiplier,
  getRaceBuffTier,
  isRaceAbilityActive,
} from "./race-buffs";
import { countCastleSpecializations } from "./specializations";
import { RaceAbilityKind } from "@/lib/prisma-client";
import {
  DWARF_DEEP_MINING_COMBAT_MULTIPLIER,
  DWARF_DEEP_MINING_ECONOMY_MULTIPLIER,
  DWARF_DEEP_MINING_RUNE_BOUNTY,
  DWARF_DEEP_MINING_SLOW_ATTACK_MULTIPLIER,
} from "./dwarf-deep-mining";
import {
  expireLootCamps,
  getLootCampReward,
  resetAttackerRaceAbilityCooldown,
  spawnScheduledLootCamps,
} from "./loot-camps";
import {
  createBattlefieldFromAttackUnit,
  processActiveBattlefields,
} from "./battlefields";
import { getTileBonus, getTileById, isHomeOfATile } from "./territory";
import { recalculateReturningAttackRoutes } from "./fortress-relocation";

export type TickSummary = {
  restartedRegistrationCycles: number;
  testingCyclesStarted: number;
  testingCyclesCompleted: number;
  activatedCycles: number;
  resolvedCycles: number;
  resolvedCommunityWishVotes: number;
  nextRegistrationCyclesCreated: number;
  processedMinutes: number;
  scoreEventsCreated: number;
  launchedAttackUnits: number;
  resolvedAttackUnits: number;
};

type ProcessCycleTickResult = {
  processed: boolean;
  scoreEventsCreated: number;
  launchedAttackUnits: number;
  resolvedAttackUnits: number;
};

const TICK_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} satisfies Parameters<PrismaClient["$transaction"]>[1];

export type TickHealth = "ok" | "lagging" | "stalled";

type TieBreakCandidate = {
  fortressId: string;
  ownerId: string;
  fortressName: string;
  finalScore: number;
  reachedFinalScoreAt: Date;
  joinedAt: Date;
};

function isActiveMapBlocker(
  fortress: {
    fortressKind: FortressKind;
    health: number;
    expiresAt: Date | null;
  },
  tickAt: Date
) {
  if (fortress.fortressKind === FortressKind.PLAYER) {
    return true;
  }

  if (fortress.health <= 0) {
    return false;
  }

  return !fortress.expiresAt || fortress.expiresAt > tickAt;
}

async function processDueUnicornTeleportReturns({
  db,
  cycleId,
  tickAt,
}: {
  db: PrismaClient;
  cycleId: string;
  tickAt: Date;
}) {
  const dueTeleports = await db.unicornTemporaryTeleport.findMany({
    where: {
      cycleId,
      returnedAt: null,
      returnAt: {
        lte: tickAt,
      },
    },
    orderBy: [{ returnAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fortressId: true,
      decoyFortressId: true,
      originMapX: true,
      originMapY: true,
      fortress: {
        select: {
          mapX: true,
          mapY: true,
        },
      },
    },
  });

  for (const teleport of dueTeleports) {
    await db.$transaction(async (tx) => {
      const latestTeleport = await tx.unicornTemporaryTeleport.findUnique({
        where: {
          id: teleport.id,
        },
        select: {
          returnedAt: true,
        },
      });

      if (!latestTeleport || latestTeleport.returnedAt) {
        return;
      }

      const blockers = await tx.fortress.findMany({
        where: {
          cycleId,
          mapX: teleport.originMapX,
          mapY: teleport.originMapY,
          id: {
            notIn: [
              teleport.fortressId,
              ...(teleport.decoyFortressId ? [teleport.decoyFortressId] : []),
            ],
          },
        },
        select: {
          fortressKind: true,
          health: true,
          expiresAt: true,
        },
      });

      if (blockers.some((blocker) => isActiveMapBlocker(blocker, tickAt))) {
        return;
      }

      await tx.fortress.update({
        where: {
          id: teleport.fortressId,
        },
        data: {
          mapX: teleport.originMapX,
          mapY: teleport.originMapY,
        },
      });

      if (teleport.decoyFortressId) {
        await tx.fortress.update({
          where: {
            id: teleport.decoyFortressId,
          },
          data: {
            health: 0,
            expiresAt: tickAt,
          },
        });
      }

      await tx.unicornTemporaryTeleport.update({
        where: {
          id: teleport.id,
        },
        data: {
          returnedAt: tickAt,
        },
      });

      await recalculateReturningAttackRoutes({
        db: tx,
        fortressId: teleport.fortressId,
        oldDestination: {
          mapX: teleport.fortress.mapX,
          mapY: teleport.fortress.mapY,
        },
        newDestination: {
          mapX: teleport.originMapX,
          mapY: teleport.originMapY,
        },
        now: tickAt,
      });
    }, TICK_TRANSACTION_OPTIONS);
  }
}

function isUniqueTickError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getFirstTickAt(activeStartedAt: Date) {
  return addMinutes(floorToMinute(activeStartedAt), 1);
}

export function classifyTickHealth(minutesBehind: number): TickHealth {
  if (minutesBehind >= 3) {
    return "stalled";
  }

  if (minutesBehind >= 2) {
    return "lagging";
  }

  return "ok";
}

type TickRunnerStage =
  | "restart-registration"
  | "start-testing-cycle"
  | "complete-testing-cycle"
  | "load-last-processed-tick"
  | "process-minute"
  | "resolve-active-cycle";

export class TickRunnerError extends Error {
  readonly stage: TickRunnerStage;
  readonly cycleId?: string;
  readonly tickAt?: Date;
  readonly now: Date;

  constructor({
    stage,
    cycleId,
    tickAt,
    now,
    cause,
  }: {
    stage: TickRunnerStage;
    cycleId?: string;
    tickAt?: Date;
    now: Date;
    cause: unknown;
  }) {
    const parts = [`Tick runner failed during ${stage}.`];

    if (cycleId) {
      parts.push(`cycle=${cycleId}`);
    }

    if (tickAt) {
      parts.push(`tickAt=${tickAt.toISOString()}`);
    }

    parts.push(`now=${now.toISOString()}`);

    super(parts.join(" "));
    this.name = "TickRunnerError";
    this.stage = stage;
    this.cycleId = cycleId;
    this.tickAt = tickAt;
    this.now = now;

    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

export function getActiveCycleMinutesBehind({
  activeStartedAt,
  lastProcessedTickAt,
  now,
}: {
  activeStartedAt: Date | null;
  lastProcessedTickAt: Date | null;
  now: Date;
}) {
  if (!activeStartedAt) {
    return 0;
  }

  const firstDueTickAt = getFirstTickAt(activeStartedAt);
  const dueTickAt = floorToMinute(now);

  if (dueTickAt < firstDueTickAt) {
    return 0;
  }

  const latestProcessedTickAt =
    lastProcessedTickAt ?? addMinutes(firstDueTickAt, -1);

  if (latestProcessedTickAt >= dueTickAt) {
    return 0;
  }

  const diffMilliseconds =
    dueTickAt.getTime() - latestProcessedTickAt.getTime();
  return Math.floor(diffMilliseconds / (60 * 1000));
}

function getLastDueTickAt(
  cycle: {
    status?: CycleStatus;
    testingEndsAt?: Date | null;
    activeStartedAt: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  if (!cycle.activeStartedAt) {
    return null;
  }

  const nowTick = floorToMinute(now);
  const effectiveEndsAt =
    cycle.status === CycleStatus.TESTING
      ? cycle.testingEndsAt
      : cycle.activeEndsAt;
  const activeEndTick = effectiveEndsAt
    ? floorToMinute(effectiveEndsAt)
    : nowTick;
  const lastDueTickAt = nowTick < activeEndTick ? nowTick : activeEndTick;

  if (lastDueTickAt < getFirstTickAt(cycle.activeStartedAt)) {
    return null;
  }

  return lastDueTickAt;
}

function getMegaFortressDestroyReward(destroyCount: number) {
  return MEGA_FORTRESS_DESTROY_BONUS * (destroyCount + 1);
}

function getNextMegaFortressHealth(destroyCount: number) {
  return MEGA_FORTRESS_HEALTH * (destroyCount + 2);
}

async function restartEmptyRegistrationCycle(
  cycleId: string,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        _count: {
          select: {
            fortresses: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.REGISTRATION ||
      !cycle.testingStartedAt ||
      !cycle.testingEndsAt ||
      cycle.testingStartedAt > now
    ) {
      return false;
    }

    if (cycle._count.fortresses > 0) {
      return false;
    }

    const registrationStartedAt = floorToMinute(now);
    const registrationEndsAt = getNextHelsinkiWeekdayAtHour(
      registrationStartedAt,
      3,
      12
    );
    const testingStartedAt = addHours(
      registrationEndsAt,
      -TESTING_DURATION_HOURS
    );
    const testingEndsAt = addHours(
      registrationEndsAt,
      -TESTING_ENDS_BEFORE_ACTIVE_HOURS
    );

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.REGISTRATION,
        registrationStartedAt,
        registrationEndsAt,
        testingStartedAt,
        testingEndsAt,
        activeStartedAt: null,
        activeEndsAt: getNextHelsinkiWeekdayAtHour(registrationEndsAt, 0, 12),
      },
    });

    return true;
  });
}

async function startTestingCycle(cycleId: string, now: Date, db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        _count: {
          select: {
            fortresses: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.REGISTRATION ||
      !cycle.testingStartedAt ||
      !cycle.testingEndsAt ||
      cycle.testingStartedAt > now
    ) {
      return false;
    }

    if (cycle._count.fortresses === 0) {
      return false;
    }

    const testingStartedAt = cycle.testingStartedAt!;
    const testingEndsAt = cycle.testingEndsAt!;
    const activeStartedAt = cycle.registrationEndsAt;

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.TESTING,
        testingStartedAt,
        testingEndsAt,
        activeStartedAt,
        activeEndsAt: getNextHelsinkiWeekdayAtHour(activeStartedAt, 0, 12),
        joiningLockedAt: null,
      },
    });

    await tx.fortress.updateMany({
      where: {
        cycleId: cycle.id,
        isNpc: false,
      },
      data: {
        currentAction: FortressAction.GROW,
        targetFortressId: null,
      },
    });

    await ensureMegaFortress({
      db: db,
      cycleId: cycle.id,
      seed: buildFortressSpawnSeed({
        cycleId: cycle.id,
        activeStartedAt: testingStartedAt,
        tickAt: testingStartedAt,
        purpose: "testing:mega-fortress",
        entropy: cycle.registrationEndsAt.toISOString(),
      }),
    });

    return true;
  });
}

async function completeTestingCycle(
  cycleId: string,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        _count: {
          select: {
            fortresses: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.TESTING ||
      !cycle.testingEndsAt ||
      !cycle.activeStartedAt ||
      cycle.testingEndsAt > now ||
      cycle.activeStartedAt > now
    ) {
      return false;
    }

    const activeStartedAt = cycle.activeStartedAt;
    const activeEndsAt = getNextHelsinkiWeekdayAtHour(activeStartedAt, 0, 12);

    await tx.attackUnit.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.battlefield.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.homeOfAHolder.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.mapHexOwnership.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.castleUpgradeSpecializationChoice.deleteMany({
      where: {
        fortress: {
          cycleId,
        },
      },
    });
    await tx.raceAbilityActivation.deleteMany({
      where: {
        fortress: {
          cycleId,
        },
      },
    });
    await tx.unicornTemporaryTeleport.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.dwarfGrudge.deleteMany({
      where: {
        fortress: {
          cycleId,
        },
      },
    });
    await tx.scoreEvent.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.gameTick.deleteMany({
      where: {
        cycleId,
      },
    });
    await tx.fortress.deleteMany({
      where: {
        cycleId,
        isNpc: true,
      },
    });
    await tx.fortress.updateMany({
      where: {
        cycleId,
        isNpc: false,
      },
      data: {
        points: 0,
        gold: 0,
        level: 0,
        food: 0,
        army: 0,
        minersAssigned: 10,
        farmersAssigned: 10,
        recruitersAssigned: 5,
        race: null,
        fortressKind: FortressKind.PLAYER,
        currentAction: FortressAction.GROW,
        targetFortressId: null,
        health: 0,
        maxHealth: 0,
        sizeTiles: 1,
        iconLabel: null,
        unicornDecoySourceFortressId: null,
        unicornDecoyLevel: null,
        locationShuffleCount: 0,
      },
    });
    await tx.cycle.update({
      where: {
        id: cycleId,
      },
      data: {
        status: CycleStatus.ACTIVE,
        activeStartedAt,
        activeEndsAt,
        joiningLockedAt: null,
        winnerId: null,
        crownedFortressId: null,
        upgradesUnlockedAt: null,
        megaFortressDestroyCount: 0,
      },
    });
    await ensureMegaFortress({
      db: db,
      cycleId,
      seed: buildFortressSpawnSeed({
        cycleId,
        activeStartedAt,
        tickAt: activeStartedAt,
        purpose: "activate:mega-fortress",
        entropy: cycle.testingEndsAt.toISOString(),
      }),
    });

    return true;
  });
}

function compareTieBreakCandidates(
  left: TieBreakCandidate,
  right: TieBreakCandidate
) {
  if (left.finalScore !== right.finalScore) {
    return right.finalScore - left.finalScore;
  }

  const reachDelta =
    left.reachedFinalScoreAt.getTime() - right.reachedFinalScoreAt.getTime();

  if (reachDelta !== 0) {
    return reachDelta;
  }

  const joinedDelta = left.joinedAt.getTime() - right.joinedAt.getTime();

  if (joinedDelta !== 0) {
    return joinedDelta;
  }

  return left.fortressId.localeCompare(right.fortressId);
}

function formatTieBreakSummary(
  winner: TieBreakCandidate,
  tiedCandidates: TieBreakCandidate[]
) {
  if (tiedCandidates.length <= 1) {
    return `No tie-break needed. ${winner.fortressName} won outright with ${winner.finalScore} points.`;
  }

  const summary = tiedCandidates
    .map((candidate) => {
      return `${candidate.fortressName} reached ${candidate.finalScore} at ${candidate.reachedFinalScoreAt.toISOString()}`;
    })
    .join("; ");

  return `Tie on ${winner.finalScore} points resolved by earliest reach time. ${summary}. Winner: ${winner.fortressName}.`;
}

async function resolveExpiredActiveCycle(
  cycleId: string,
  now: Date,
  db: PrismaClient
) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
      where: {
        id: cycleId,
      },
      include: {
        fortresses: {
          where: {
            isNpc: false,
          },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            ownerId: true,
            commanderName: true,
            name: true,
            points: true,
            joinedAt: true,
          },
        },
        winnerRequests: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            authorId: true,
            requestText: true,
            status: true,
          },
        },
        history: {
          select: {
            id: true,
          },
        },
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.ACTIVE ||
      !cycle.activeStartedAt ||
      !cycle.activeEndsAt ||
      cycle.activeEndsAt > now ||
      cycle.history
    ) {
      return { resolved: false, createdNextCycle: false };
    }

    const resolutionEndedAt = cycle.activeEndsAt;

    if (cycle.fortresses.length === 0) {
      await tx.cycle.update({
        where: {
          id: cycle.id,
        },
        data: {
          status: CycleStatus.RESOLUTION,
          resolvedAt: resolutionEndedAt,
          joiningLockedAt: null,
        },
      });

      await ensureOpenRegistrationCycle(tx, resolutionEndedAt);

      return { resolved: true, createdNextCycle: true };
    }

    const scoreEvents = await tx.scoreEvent.findMany({
      where: {
        cycleId: cycle.id,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        fortressId: true,
        delta: true,
        createdAt: true,
      },
    });

    const finalScores = new Map(
      cycle.fortresses.map((fortress) => [fortress.id, fortress.points])
    );
    const currentScores = new Map(
      cycle.fortresses.map((fortress) => [fortress.id, 0])
    );
    const reachedFinalScoreAt = new Map<string, Date>();

    for (const fortress of cycle.fortresses) {
      if (fortress.points === 0) {
        reachedFinalScoreAt.set(fortress.id, cycle.activeStartedAt);
      }
    }

    let eventIndex = 0;

    while (eventIndex < scoreEvents.length) {
      const tickAt = scoreEvents[eventIndex]?.createdAt;

      if (!tickAt) {
        break;
      }

      const deltas = new Map<string, number>();

      while (
        eventIndex < scoreEvents.length &&
        scoreEvents[eventIndex]?.createdAt.getTime() === tickAt.getTime()
      ) {
        const event = scoreEvents[eventIndex];

        if (event) {
          deltas.set(
            event.fortressId,
            (deltas.get(event.fortressId) ?? 0) + event.delta
          );
        }

        eventIndex += 1;
      }

      for (const [fortressId, delta] of deltas) {
        currentScores.set(
          fortressId,
          (currentScores.get(fortressId) ?? 0) + delta
        );
      }

      for (const fortress of cycle.fortresses) {
        if (reachedFinalScoreAt.has(fortress.id)) {
          continue;
        }

        if (
          (currentScores.get(fortress.id) ?? 0) ===
          (finalScores.get(fortress.id) ?? 0)
        ) {
          reachedFinalScoreAt.set(fortress.id, tickAt);
        }
      }
    }

    const rankedFortresses = cycle.fortresses
      .map((fortress) => ({
        fortressId: fortress.id,
        ownerId: fortress.ownerId,
        fortressName: fortress.name,
        finalScore: fortress.points,
        reachedFinalScoreAt:
          reachedFinalScoreAt.get(fortress.id) ?? resolutionEndedAt,
        joinedAt: fortress.joinedAt,
      }))
      .sort(compareTieBreakCandidates);

    const winner = rankedFortresses[0];

    if (!winner) {
      return { resolved: false, createdNextCycle: false };
    }

    const tiedCandidates = rankedFortresses.filter(
      (candidate) => candidate.finalScore === winner.finalScore
    );
    const winnerRequest =
      cycle.winnerRequests.find(
        (request) => request.authorId === winner.ownerId
      ) ?? null;
    const firstSlayerFortress =
      cycle.fortresses.find(
        (fortress) => fortress.id === cycle.crownedFortressId
      ) ?? null;

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.RESOLUTION,
        winnerId: winner.ownerId,
        resolvedAt: resolutionEndedAt,
        joiningLockedAt: null,
      },
    });

    const communityWishProposalEndsAt =
      getCommunityWishProposalEndsAt(resolutionEndedAt);

    await tx.cycleHistory.create({
      data: {
        cycleId: cycle.id,
        winnerId: winner.ownerId,
        winnerRequestId: winnerRequest?.id ?? null,
        winningScore: winner.finalScore,
        endedAt: resolutionEndedAt,
        firstSlayerCommanderName: firstSlayerFortress?.commanderName ?? null,
        firstSlayerFortressName: firstSlayerFortress?.name ?? null,
        tieBreakSummary: formatTieBreakSummary(winner, tiedCandidates),
        winnerRequestSnapshot: winnerRequest
          ? `[${winnerRequest.status}] ${winnerRequest.requestText}`
          : null,
        communityWishProposalEndsAt,
        communityWishVotingEndsAt: addHours(
          communityWishProposalEndsAt,
          COMMUNITY_WISH_VOTING_WINDOW_HOURS
        ),
        communityWishStatus: "OPEN",
      },
    });

    await createCommunityWishVoteEntitlements({
      cycleId: cycle.id,
      rankedFortresses,
      db: db,
    });

    await mintSeasonArcadeCoins({
      cycleId: cycle.id,
      now: resolutionEndedAt,
      db: db,
      rankedFortresses,
    });

    await ensureOpenRegistrationCycle(tx, resolutionEndedAt);

    return { resolved: true, createdNextCycle: true };
  });
}

async function processCycleTick(
  cycleId: string,
  tickAt: Date,
  now: Date,
  db: PrismaClient
) {
  const cycle = await db.cycle.findUnique({
      where: {
        id: cycleId,
      },
      select: {
        id: true,
        status: true,
        testingStartedAt: true,
        testingEndsAt: true,
        activeStartedAt: true,
        activeEndsAt: true,
        upgradesUnlockedAt: true,
        crownedFortressId: true,
        megaFortressDestroyCount: true,
      },
    });

    if (
      !cycle ||
      (cycle.status !== CycleStatus.ACTIVE &&
        cycle.status !== CycleStatus.TESTING) ||
      !(cycle.status === CycleStatus.TESTING
        ? cycle.testingStartedAt
        : cycle.activeStartedAt)
    ) {
      return {
        processed: false,
        scoreEventsCreated: 0,
        launchedAttackUnits: 0,
        resolvedAttackUnits: 0,
      };
    }

    const gameplayStartedAt =
      cycle.status === CycleStatus.TESTING
        ? cycle.testingStartedAt!
        : cycle.activeStartedAt!;
    const raceBuffTier = getRaceBuffTier({
      activeStartedAt: cycle.activeStartedAt,
      now: tickAt,
      isActiveSeason: cycle.status === CycleStatus.ACTIVE,
    });

    await ensureActiveCycleMegaFortress({
      db: db,
      cycleId,
    });

    const firstTickAt = getFirstTickAt(gameplayStartedAt);
    const lastDueTickAt = getLastDueTickAt(
      {
        ...cycle,
        activeStartedAt: gameplayStartedAt,
      },
      now
    );

    if (!lastDueTickAt || tickAt < firstTickAt || tickAt > lastDueTickAt) {
      return {
        processed: false,
        scoreEventsCreated: 0,
        launchedAttackUnits: 0,
        resolvedAttackUnits: 0,
      };
    }

    try {
      await db.$transaction(async (gateTx) => {
        await gateTx.gameTick.create({
          data: {
            cycleId,
            tickAt,
          },
        });
      }, TICK_TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueTickError(error)) {
        return {
          processed: false,
          scoreEventsCreated: 0,
          launchedAttackUnits: 0,
          resolvedAttackUnits: 0,
        };
      }

      throw error;
    }

    await ensureCurrentMapLayout({
      db: db,
      cycleId,
      seed: buildFortressSpawnSeed({
        cycleId,
        activeStartedAt: gameplayStartedAt,
        tickAt,
        purpose: "tick:layout-v3",
      }),
    });

    await processDueUnicornTeleportReturns({
      db,
      cycleId,
      tickAt,
    });

    await expireLootCamps({
      db: db,
      cycleId,
      tickAt,
    });
    await db.fortress.updateMany({
      where: {
        cycleId,
        fortressKind: FortressKind.DWARF_RUNE,
        health: {
          gt: 0,
        },
        expiresAt: {
          lte: tickAt,
        },
      },
      data: {
        health: 0,
      },
    });
    await spawnScheduledLootCamps({
      db: db,
      cycleId,
      activeStartedAt: gameplayStartedAt,
      tickAt,
    });

    const fortresses = await db.fortress.findMany({
      where: {
        cycleId,
      },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        ownerId: true,
        points: true,
        gold: true,
        level: true,
        food: true,
        army: true,
        minersAssigned: true,
        farmersAssigned: true,
        recruitersAssigned: true,
        race: true,
        fortressKind: true,
        lootCampVariant: true,
        unicornDecoyLevel: true,
        currentAction: true,
        targetFortressId: true,
        isNpc: true,
        health: true,
        maxHealth: true,
        expiresAt: true,
        mapX: true,
        mapY: true,
        joinedAt: true,
        castleUpgradeSpecializations: {
          select: {
            specialization: true,
          },
        },
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
        dwarfGrudges: {
          select: {
            targetFortressId: true,
            bonusMultiplier: true,
          },
        },
      },
    });
    const activeRuneSuppressions = await db.dwarfDeepMiningRoll.findMany({
      where: {
        outcome: DwarfDeepMiningOutcome.FACTION_SEAL,
        activeUntil: {
          gt: tickAt,
        },
        targetFortressId: {
          not: null,
        },
        runeFortress: {
          health: {
            gt: 0,
          },
          expiresAt: {
            gt: tickAt,
          },
        },
      },
      select: {
        targetFortressId: true,
      },
    });
    const suppressedFortressIds = new Set(
      activeRuneSuppressions
        .map((suppression) => suppression.targetFortressId)
        .filter((id): id is string => Boolean(id))
    );

    const currentPoints = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.points])
    );
    const currentGold = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.gold])
    );
    const currentFood = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.food])
    );
    const currentArmy = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.army])
    );
    const currentHealth = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.health])
    );
    const fortressLookup = new Map(
      fortresses.map((fortress) => [fortress.id, fortress])
    );
    const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];
    const destroyedMegaTargets = new Set<string>();
    let resolvedAttackUnits = 0;
    const isSuppressed = (fortressId: string) =>
      suppressedFortressIds.has(fortressId);
    const getEffectiveRace = (fortress: {
      id: string;
      race: (typeof fortresses)[number]["race"];
    }) => (isSuppressed(fortress.id) ? null : fortress.race);
    const getDwarfSpeedMultiplier = (fortress: (typeof fortresses)[number]) =>
      getEffectiveRace(fortress) === "DWARFS" &&
      isRaceAbilityActive(
        fortress.raceAbilityActivations,
        RaceAbilityKind.DWARF_SLOW_ATTACKS,
        tickAt
      )
        ? DWARF_DEEP_MINING_SLOW_ATTACK_MULTIPLIER
        : 1;
    const getOrkWaaghActive = (fortress: (typeof fortresses)[number]) =>
      getEffectiveRace(fortress) === "ORKS" &&
      raceBuffTier >= 3 &&
      isRaceAbilityActive(
        fortress.raceAbilityActivations,
        RaceAbilityKind.ORK_WAAAGH,
        tickAt
      );

    const dueAttackUnits = await db.attackUnit.findMany({
      where: {
        cycleId,
        resolvedAt: null,
        cancelledAt: null,
        arrivesAt: {
          lte: tickAt,
        },
      },
      orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        attackerFortressId: true,
        targetFortressId: true,
        reinforcementBattlefieldId: true,
        reinforcementSide: true,
        armyAmount: true,
        arrivesAt: true,
        recalledAt: true,
        returnOriginMapX: true,
        returnOriginMapY: true,
        attackerReturned: true,
        defenderArmyAtBattleStart: true,
        resolvedAttackPower: true,
        resolvedDefensePower: true,
        attackerSurvivors: true,
        attackerRetired: true,
        defenderLosses: true,
        pointsLooted: true,
        foodLooted: true,
        armyLooted: true,
      },
    });

    const resolvedBatchAttackUnitIds = new Set<string>();
    for (const unit of dueAttackUnits) {
      if (unit.reinforcementBattlefieldId && unit.reinforcementSide) {
        const battlefield = await db.battlefield.findUnique({
          where: {
            id: unit.reinforcementBattlefieldId,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (battlefield?.status === "ACTIVE") {
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
              side: unit.reinforcementSide,
              armyCommitted: unit.armyAmount,
              armyRemaining: unit.armyAmount,
              joinedAt: tickAt,
            },
          });
          await db.battlefield.update({
            where: {
              id: battlefield.id,
            },
            data:
              unit.reinforcementSide === "ATTACKER"
                ? {
                    attackerArmyRemaining: {
                      increment: unit.armyAmount,
                    },
                  }
                : {
                    defenderArmyRemaining: {
                      increment: unit.armyAmount,
                    },
                  },
          });
        }

        await db.attackUnit.update({
          where: {
            id: unit.id,
          },
          data: {
            resolvedAt: tickAt,
            defenderArmyAtBattleStart: null,
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
        resolvedBatchAttackUnitIds.add(unit.id);
        resolvedAttackUnits += 1;
        continue;
      }

      const target = fortressLookup.get(unit.targetFortressId);

      if (
        unit.recalledAt ||
        !target ||
        target.isNpc ||
        target.fortressKind !== FortressKind.PLAYER
      ) {
        continue;
      }

      await createBattlefieldFromAttackUnit({
        db,
        attackUnitId: unit.id,
        tickAt,
      });
      resolvedBatchAttackUnitIds.add(unit.id);
      resolvedAttackUnits += 1;
    }

    const dueAttackUnitsByTargetId = new Map<string, typeof dueAttackUnits>();
    for (const dueAttackUnit of dueAttackUnits) {
      const targetUnits =
        dueAttackUnitsByTargetId.get(dueAttackUnit.targetFortressId) ?? [];
      targetUnits.push(dueAttackUnit);
      dueAttackUnitsByTargetId.set(dueAttackUnit.targetFortressId, targetUnits);
    }
    const getPendingTargetUnits = (targetId: string) =>
      (dueAttackUnitsByTargetId.get(targetId) ?? []).filter(
        (targetUnit) => !resolvedBatchAttackUnitIds.has(targetUnit.id)
      );

    for (const unit of dueAttackUnits) {
      if (resolvedBatchAttackUnitIds.has(unit.id)) {
        continue;
      }

      const attacker = fortressLookup.get(unit.attackerFortressId);
      const target = fortressLookup.get(unit.targetFortressId);

      if (unit.recalledAt) {
        const returningArmy = unit.attackerReturned ?? unit.armyAmount;

        if (attacker) {
          currentArmy.set(
            attacker.id,
            (currentArmy.get(attacker.id) ?? attacker.army) + returningArmy
          );
        }

        const pureRecallDetection =
          unit.defenderArmyAtBattleStart === null &&
          unit.resolvedAttackPower === null &&
          unit.resolvedDefensePower === null &&
          unit.attackerSurvivors === null &&
          unit.attackerRetired === null &&
          unit.attackerReturned === null &&
          unit.defenderLosses === null &&
          unit.pointsLooted === null &&
          unit.foodLooted === null;
        const updateData: Prisma.AttackUnitUpdateInput = {
          resolvedAt: tickAt,
        };

        if (pureRecallDetection) {
          updateData.defenderArmyAtBattleStart = null;
          updateData.resolvedAttackPower = 0;
          updateData.resolvedDefensePower = 0;
          updateData.attackerSurvivors = returningArmy;
          updateData.attackerRetired = 0;
          updateData.attackerReturned = returningArmy;
          updateData.defenderLosses = 0;
          updateData.pointsLooted = 0;
          updateData.foodLooted = 0;
          updateData.armyLooted = 0;
        }

        await db.attackUnit.update({
          where: {
            id: unit.id,
          },
          data: updateData,
        });

        resolvedAttackUnits += 1;
        resolvedBatchAttackUnitIds.add(unit.id);
        continue;
      }

      if (target?.fortressKind === FortressKind.UNICORN_DECOY) {
        const targetUnits = getPendingTargetUnits(target.id);
        const copiedLevel = Math.max(1, target.unicornDecoyLevel ?? 1);
        const decoyCasualties = target.health > 0 ? 200 * copiedLevel : 0;

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );
          const attackerReturned = Math.max(
            0,
            targetUnit.armyAmount - decoyCasualties
          );
          const attackerLost = targetUnit.armyAmount - attackerReturned;

          if (targetAttacker && attackerReturned > 0) {
            const returnArrivesAt = getAttackArrivalAt({
              launchedAt: tickAt,
              origin: {
                mapX: target.mapX,
                mapY: target.mapY,
              },
              target: {
                mapX: targetAttacker.mapX,
                mapY: targetAttacker.mapY,
              },
              attackerRace: getEffectiveRace(targetAttacker),
              raceBuffTier,
              speedMultiplier: getDwarfSpeedMultiplier(targetAttacker),
              waaagh: getOrkWaaghActive(targetAttacker),
            });

            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                recalledAt: tickAt,
                returnOriginMapX: target.mapX,
                returnOriginMapY: target.mapY,
                arrivesAt: returnArrivesAt,
                defenderArmyAtBattleStart: 0,
                resolvedAttackPower: targetUnit.armyAmount,
                resolvedDefensePower: decoyCasualties,
                attackerSurvivors: attackerReturned,
                attackerRetired: attackerLost,
                attackerReturned,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
          } else {
            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: 0,
                resolvedAttackPower: targetUnit.armyAmount,
                resolvedDefensePower: decoyCasualties,
                attackerSurvivors: attackerReturned,
                attackerRetired: attackerLost,
                attackerReturned,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
            resolvedAttackUnits += 1;
          }

          resolvedBatchAttackUnitIds.add(targetUnit.id);

          if (targetAttacker) {
            scoreEvents.push({
              cycleId,
              fortressId: targetAttacker.id,
              actorId: targetAttacker.ownerId,
              targetFortressId: target.id,
              eventType: ScoreEventType.UNICORN_DECOY_DESTROY,
              delta: 0,
              createdAt: tickAt,
            });
          }
        }

        if (targetUnits.length > 0) {
          currentHealth.set(target.id, 0);
          await db.fortress.update({
            where: {
              id: target.id,
            },
            data: {
              health: 0,
            },
          });
        }

        continue;
      }

      if (target?.fortressKind === FortressKind.DWARF_RUNE) {
        const runeRoll = await db.dwarfDeepMiningRoll.findUnique({
          where: {
            runeFortressId: target.id,
          },
          select: {
            fortressId: true,
          },
        });
        const runeOwner = runeRoll
          ? fortressLookup.get(runeRoll.fortressId)
          : null;
        const targetUnits = getPendingTargetUnits(target.id);
        const runeOutcomes = new Map<
          string,
          {
            attackPower: number;
            defensePower: number;
            attackerSurvivors: number;
            attackerRetired: number;
            attackerReturned: number;
            defenderLosses: number;
            defenderArmyAtBattleStart: number;
          }
        >();
        let destroyer: {
          unitId: string;
          attacker: NonNullable<typeof attacker>;
        } | null = null;

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );

          if (!targetAttacker || targetAttacker.ownerId === runeOwner?.ownerId) {
            continue;
          }

          const defenderArmy = currentArmy.get(target.id) ?? target.army;
          const outcome = calculateRaidOutcome({
            attackArmy: targetUnit.armyAmount,
            attackerRace: getEffectiveRace(targetAttacker),
            defenderArmy,
            defenderDbLevel: 0,
            defenderRace: null,
            defenderPoints: 0,
            defenderFood: 0,
          });
          const defenderArmyAfterBattle = Math.max(
            0,
            defenderArmy - outcome.defenderLosses
          );

          currentArmy.set(target.id, defenderArmyAfterBattle);
          runeOutcomes.set(targetUnit.id, {
            attackPower: outcome.attackPower,
            defensePower: outcome.defensePower,
            attackerSurvivors: outcome.attackerSurvivors,
            attackerRetired: outcome.attackerRetired,
            attackerReturned: outcome.attackerReturned,
            defenderLosses: outcome.defenderLosses,
            defenderArmyAtBattleStart: defenderArmy,
          });

          if (defenderArmyAfterBattle <= 0 && !destroyer) {
            destroyer = {
              unitId: targetUnit.id,
              attacker: targetAttacker,
            };
            currentHealth.set(target.id, 0);
          }
        }

        if (destroyer) {
          currentGold.set(
            destroyer.attacker.id,
            (currentGold.get(destroyer.attacker.id) ??
              destroyer.attacker.gold) + DWARF_DEEP_MINING_RUNE_BOUNTY
          );
          await db.dwarfDeepMiningRoll.updateMany({
            where: {
              runeFortressId: target.id,
              activeUntil: {
                gt: tickAt,
              },
            },
            data: {
              activeUntil: tickAt,
            },
          });
          scoreEvents.push({
            cycleId,
            fortressId: destroyer.attacker.id,
            actorId: destroyer.attacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.DWARF_RUNE_BOUNTY,
            delta: DWARF_DEEP_MINING_RUNE_BOUNTY,
            createdAt: tickAt,
          });
        }

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );
          const outcome = runeOutcomes.get(targetUnit.id);
          const attackerReturned = outcome?.attackerReturned ?? 0;
          const unitGetsReward =
            Boolean(destroyer) && targetUnit.id === destroyer?.unitId;

          if (!targetAttacker || !outcome) {
            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: null,
                resolvedAttackPower: 0,
                resolvedDefensePower: 0,
                attackerSurvivors: 0,
                attackerRetired: targetUnit.armyAmount,
                attackerReturned: 0,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
            resolvedAttackUnits += 1;
            resolvedBatchAttackUnitIds.add(targetUnit.id);
            continue;
          }

          if (attackerReturned > 0) {
            const returnArrivesAt = getAttackArrivalAt({
              launchedAt: tickAt,
              origin: {
                mapX: target.mapX,
                mapY: target.mapY,
              },
              target: {
                mapX: targetAttacker.mapX,
                mapY: targetAttacker.mapY,
              },
              attackerRace: getEffectiveRace(targetAttacker),
              raceBuffTier,
              speedMultiplier: getDwarfSpeedMultiplier(targetAttacker),
              waaagh: getOrkWaaghActive(targetAttacker),
            });

            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                recalledAt: tickAt,
                returnOriginMapX: target.mapX,
                returnOriginMapY: target.mapY,
                arrivesAt: returnArrivesAt,
                defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
                resolvedAttackPower: outcome.attackPower,
                resolvedDefensePower: outcome.defensePower,
                attackerSurvivors: outcome.attackerSurvivors,
                attackerRetired: outcome.attackerRetired,
                attackerReturned,
                defenderLosses: outcome.defenderLosses,
                pointsLooted: unitGetsReward
                  ? DWARF_DEEP_MINING_RUNE_BOUNTY
                  : 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
          } else {
            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
                resolvedAttackPower: outcome.attackPower,
                resolvedDefensePower: outcome.defensePower,
                attackerSurvivors: outcome.attackerSurvivors,
                attackerRetired: outcome.attackerRetired,
                attackerReturned,
                defenderLosses: outcome.defenderLosses,
                pointsLooted: unitGetsReward
                  ? DWARF_DEEP_MINING_RUNE_BOUNTY
                  : 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
            resolvedAttackUnits += 1;
          }

          resolvedBatchAttackUnitIds.add(targetUnit.id);
        }

        continue;
      }

      if (target?.fortressKind === FortressKind.LOOT_CAMP) {
        const targetUnits = getPendingTargetUnits(target.id);
        const lootCampOutcomes = new Map<
          string,
          {
            attackPower: number;
            defensePower: number;
            attackerSurvivors: number;
            attackerRetired: number;
            attackerReturned: number;
            defenderLosses: number;
            targetLoss: number;
            defenderArmyAtBattleStart: number;
          }
        >();
        let destroyer: {
          unitId: string;
          attacker: NonNullable<typeof attacker>;
        } | null = null;

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );

          if (!targetAttacker) {
            continue;
          }

          const targetHealth = currentHealth.get(target.id) ?? target.health;
          const defenderArmy = currentArmy.get(target.id) ?? target.army;
          const outcome = calculateRaidOutcome({
            attackArmy: targetUnit.armyAmount,
            attackerRace: getEffectiveRace(targetAttacker),
            defenderArmy,
            defenderDbLevel: 0,
            defenderRace: null,
            defenderPoints: 0,
            defenderFood: 0,
          });
          const attackerWon = outcome.outcome === "ATTACKER_WIN";
          const defenderArmyAfterBattle = Math.max(
            0,
            defenderArmy - outcome.defenderLosses
          );
          const targetLoss = Math.min(
            targetHealth,
            attackerWon
              ? targetUnit.armyAmount *
                  getFortressAttackDamage(targetAttacker.level)
              : 0
          );

          currentArmy.set(target.id, defenderArmyAfterBattle);
          lootCampOutcomes.set(targetUnit.id, {
            attackPower: outcome.attackPower,
            defensePower: outcome.defensePower,
            attackerSurvivors: outcome.attackerSurvivors,
            attackerRetired: outcome.attackerRetired,
            attackerReturned: outcome.attackerReturned,
            defenderLosses: outcome.defenderLosses,
            targetLoss,
            defenderArmyAtBattleStart: defenderArmy,
          });

          const nextHealth = targetHealth - targetLoss;
          currentHealth.set(target.id, nextHealth);

          if (nextHealth <= 0 && !destroyer) {
            destroyer = {
              unitId: targetUnit.id,
              attacker: targetAttacker,
            };
          }
        }

        const destroyed = (currentHealth.get(target.id) ?? target.health) <= 0;
        const reward =
          destroyed && destroyer
            ? getLootCampReward(target.lootCampVariant, target.maxHealth)
            : null;

        if (destroyed && destroyer && reward) {
          currentGold.set(
            destroyer.attacker.id,
            (currentGold.get(destroyer.attacker.id) ??
              destroyer.attacker.gold) + reward.points
          );
          currentFood.set(
            destroyer.attacker.id,
            (currentFood.get(destroyer.attacker.id) ??
              destroyer.attacker.food) + reward.food
          );
          currentArmy.set(
            destroyer.attacker.id,
            (currentArmy.get(destroyer.attacker.id) ??
              destroyer.attacker.army) + reward.army
          );

          if (reward.points > 0) {
            scoreEvents.push({
              cycleId,
              fortressId: destroyer.attacker.id,
              actorId: destroyer.attacker.ownerId,
              targetFortressId: target.id,
              eventType: ScoreEventType.LOOT_CAMP_REWARD,
              delta: reward.points,
              createdAt: tickAt,
            });
          }

          if (reward.resetRaceCooldown) {
            await resetAttackerRaceAbilityCooldown({
              db: db,
              fortress: destroyer.attacker,
              now: tickAt,
            });
          }
        }

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );
          const outcome = lootCampOutcomes.get(targetUnit.id);
          const attackerReturned = outcome?.attackerReturned ?? 0;
          const unitGetsReward =
            Boolean(destroyer) && targetUnit.id === destroyer?.unitId && reward;
          const unitReward = unitGetsReward
            ? reward
            : {
                points: 0,
                food: 0,
                army: 0,
              };

          if (!targetAttacker || !outcome) {
            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: null,
                resolvedAttackPower: 0,
                resolvedDefensePower: 0,
                attackerSurvivors: 0,
                attackerRetired: targetUnit.armyAmount,
                attackerReturned: 0,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
            resolvedAttackUnits += 1;
            resolvedBatchAttackUnitIds.add(targetUnit.id);
            continue;
          }

          if (attackerReturned > 0) {
            const returnArrivesAt = getAttackArrivalAt({
              launchedAt: tickAt,
              origin: {
                mapX: target.mapX,
                mapY: target.mapY,
              },
              target: {
                mapX: targetAttacker.mapX,
                mapY: targetAttacker.mapY,
              },
              attackerRace: getEffectiveRace(targetAttacker),
              raceBuffTier,
              speedMultiplier: getDwarfSpeedMultiplier(targetAttacker),
            });

            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                recalledAt: tickAt,
                returnOriginMapX: target.mapX,
                returnOriginMapY: target.mapY,
                arrivesAt: returnArrivesAt,
                defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
                resolvedAttackPower: outcome.targetLoss,
                resolvedDefensePower: outcome.defensePower,
                attackerSurvivors: outcome.attackerSurvivors,
                attackerRetired: outcome.attackerRetired,
                attackerReturned,
                defenderLosses: outcome.defenderLosses,
                pointsLooted: unitReward.points,
                foodLooted: unitReward.food,
                armyLooted: unitReward.army,
              },
            });
          } else {
            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: outcome.defenderArmyAtBattleStart,
                resolvedAttackPower: outcome.targetLoss,
                resolvedDefensePower: outcome.defensePower,
                attackerSurvivors: outcome.attackerSurvivors,
                attackerRetired: outcome.attackerRetired,
                attackerReturned,
                defenderLosses: outcome.defenderLosses,
                pointsLooted: unitReward.points,
                foodLooted: unitReward.food,
                armyLooted: unitReward.army,
              },
            });
            resolvedAttackUnits += 1;
          }

          resolvedBatchAttackUnitIds.add(targetUnit.id);
        }

        continue;
      }

      if (target?.isNpc) {
        const targetUnits = getPendingTargetUnits(target.id);

        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );
          const attackerReturned = targetUnit.armyAmount;

          if (targetAttacker && attackerReturned > 0) {
            const returnArrivesAt = getAttackArrivalAt({
              launchedAt: tickAt,
              origin: {
                mapX: target.mapX,
                mapY: target.mapY,
              },
              target: {
                mapX: targetAttacker.mapX,
                mapY: targetAttacker.mapY,
              },
              attackerRace: getEffectiveRace(targetAttacker),
              raceBuffTier,
              speedMultiplier: getDwarfSpeedMultiplier(targetAttacker),
            });

            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                recalledAt: tickAt,
                returnOriginMapX: target.mapX,
                returnOriginMapY: target.mapY,
                arrivesAt: returnArrivesAt,
                defenderArmyAtBattleStart: null,
                resolvedAttackPower: targetUnit.armyAmount,
                resolvedDefensePower: 0,
                attackerSurvivors: targetUnit.armyAmount,
                attackerRetired: 0,
                attackerReturned,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
          } else {
            await db.attackUnit.update({
              where: {
                id: targetUnit.id,
              },
              data: {
                resolvedAt: tickAt,
                defenderArmyAtBattleStart: null,
                resolvedAttackPower: targetUnit.armyAmount,
                resolvedDefensePower: 0,
                attackerSurvivors: targetUnit.armyAmount,
                attackerRetired: 0,
                attackerReturned,
                defenderLosses: 0,
                pointsLooted: 0,
                foodLooted: 0,
                armyLooted: 0,
              },
            });
            resolvedAttackUnits += 1;
          }

          resolvedBatchAttackUnitIds.add(targetUnit.id);
        }

        if (destroyedMegaTargets.has(target.id)) {
          continue;
        }

        let destroyer: {
          unitId: string;
          attacker: NonNullable<typeof attacker>;
        } | null = null;
        for (const targetUnit of targetUnits) {
          const targetAttacker = fortressLookup.get(
            targetUnit.attackerFortressId
          );

          if (!targetAttacker) {
            continue;
          }

          const targetHealth = currentHealth.get(target.id) ?? target.health;
          const targetLoss = Math.min(
            targetHealth,
            targetUnit.armyAmount *
              getFortressAttackDamage(targetAttacker.level)
          );

          if (targetLoss <= 0) {
            continue;
          }

          const nextHealth = targetHealth - targetLoss;
          currentHealth.set(target.id, nextHealth);

          if (nextHealth <= 0 && !destroyer) {
            destroyer = {
              unitId: targetUnit.id,
              attacker: targetAttacker,
            };
          }

          scoreEvents.push({
            cycleId,
            fortressId: target.id,
            actorId: targetAttacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.MEGA_DAMAGE,
            delta: -targetLoss,
            createdAt: tickAt,
          });
        }

        if ((currentHealth.get(target.id) ?? target.health) <= 0) {
          if (!destroyer) {
            continue;
          }

          const destroyCount = cycle.megaFortressDestroyCount;
          const destroyReward = getMegaFortressDestroyReward(destroyCount);
          const nextMegaHealth = getNextMegaFortressHealth(destroyCount);
          const unlocksUpgrades = !cycle.upgradesUnlockedAt;
          const attackerPoints =
            (currentPoints.get(destroyer.attacker.id) ??
              destroyer.attacker.points) + destroyReward;
          const attackerFood =
            (currentFood.get(destroyer.attacker.id) ??
              destroyer.attacker.food) + destroyReward;

          currentPoints.set(destroyer.attacker.id, attackerPoints);
          currentFood.set(destroyer.attacker.id, attackerFood);
          currentHealth.set(target.id, nextMegaHealth);
          destroyedMegaTargets.add(target.id);

          scoreEvents.push({
            cycleId,
            fortressId: destroyer.attacker.id,
            actorId: destroyer.attacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.MEGA_DESTROY_BONUS,
            delta: destroyReward,
            createdAt: tickAt,
          });

          const upgradeData: Prisma.FortressUpdateInput = {};

          if (unlocksUpgrades && canFortressLevelUp(destroyer.attacker.level)) {
            upgradeData.level = destroyer.attacker.level + 1;
            scoreEvents.push({
              cycleId,
              fortressId: destroyer.attacker.id,
              actorId: destroyer.attacker.ownerId,
              targetFortressId: target.id,
              eventType: ScoreEventType.FORTRESS_UPGRADE_SLAYER_BONUS,
              delta: 0,
              createdAt: tickAt,
            });
          }

          await db.cycle.update({
            where: {
              id: cycleId,
            },
            data: {
              crownedFortressId:
                cycle.crownedFortressId ?? destroyer.attacker.id,
              upgradesUnlockedAt: cycle.upgradesUnlockedAt ?? tickAt,
              megaFortressDestroyCount: {
                increment: 1,
              },
            },
          });

          if (Object.keys(upgradeData).length > 0) {
            await db.fortress.update({
              where: {
                id: destroyer.attacker.id,
              },
              data: upgradeData,
            });
          }

          await db.fortress.update({
            where: {
              id: target.id,
            },
            data: {
              health: nextMegaHealth,
              maxHealth: nextMegaHealth,
            },
          });

          await reshuffleActiveFortressPositions({
            db: db,
            cycleId,
            seed: buildFortressSpawnSeed({
              cycleId,
              activeStartedAt: gameplayStartedAt,
              tickAt,
              purpose: "tick:mega-destroy-reshuffle",
              entropy: destroyer.unitId,
            }),
          });
        }

        continue;
      }

      if (!attacker || !target) {
        await db.attackUnit.update({
          where: {
            id: unit.id,
          },
          data: {
            resolvedAt: tickAt,
          },
        });

        resolvedAttackUnits += 1;
        resolvedBatchAttackUnitIds.add(unit.id);
        continue;
      }
      const defenderArmy = currentArmy.get(target.id) ?? target.army;
      const defenderGold = currentGold.get(target.id) ?? target.gold;
      const defenderFood = currentFood.get(target.id) ?? target.food;
      const defenderArmyAtBattleStart = defenderArmy;
      const attackerRace = getEffectiveRace(attacker);
      const defenderRace = getEffectiveRace(target);
      const attackerWaaagh =
        attackerRace === "ORKS" &&
        raceBuffTier >= 3 &&
        isRaceAbilityActive(
          attacker.raceAbilityActivations,
          RaceAbilityKind.ORK_WAAAGH,
          tickAt
        );
      const defenderWaaagh =
        defenderRace === "ORKS" &&
        raceBuffTier >= 3 &&
        isRaceAbilityActive(
          target.raceAbilityActivations,
          RaceAbilityKind.ORK_WAAAGH,
          tickAt
        );
      const attackerStim =
        attackerRace === "SPACE_MURINES" &&
        raceBuffTier >= 2 &&
        isRaceAbilityActive(
          attacker.raceAbilityActivations,
          RaceAbilityKind.SPACE_MURINE_STIM,
          tickAt
        );
      const defenderStim =
        defenderRace === "SPACE_MURINES" &&
        raceBuffTier >= 2 &&
        isRaceAbilityActive(
          target.raceAbilityActivations,
          RaceAbilityKind.SPACE_MURINE_STIM,
          tickAt
        );
      const dwarfAttackMultiplier =
        attackerRace === "DWARFS" && raceBuffTier >= 2
          ? getDwarfGrudgeMultiplier(attacker.dwarfGrudges, target.id)
          : 1;
      const dwarfDefenseMultiplier =
        defenderRace === "DWARFS" && raceBuffTier >= 2
          ? getDwarfGrudgeMultiplier(target.dwarfGrudges, attacker.id)
          : 1;
      const attackerDeepMiningCombat =
        attackerRace === "DWARFS" &&
        isRaceAbilityActive(
          attacker.raceAbilityActivations,
          RaceAbilityKind.DWARF_COMBAT_SURGE,
          tickAt
        );
      const defenderDeepMiningCombat =
        defenderRace === "DWARFS" &&
        isRaceAbilityActive(
          target.raceAbilityActivations,
          RaceAbilityKind.DWARF_COMBAT_SURGE,
          tickAt
        );
      const outcome = calculateRaidOutcome({
        attackArmy: unit.armyAmount,
        attackerRace,
        defenderArmy,
        defenderDbLevel: target.level,
        defenderRace,
        defenderCastleSpecializations: countCastleSpecializations(
          target.castleUpgradeSpecializations
        ),
        attackPowerMultiplier:
          (attackerWaaagh ? 4 : 1) *
          dwarfAttackMultiplier *
          (attackerDeepMiningCombat ? DWARF_DEEP_MINING_COMBAT_MULTIPLIER : 1),
        defensePowerMultiplier:
          (defenderWaaagh ? 4 : 1) *
          dwarfDefenseMultiplier *
          (defenderDeepMiningCombat ? DWARF_DEEP_MINING_COMBAT_MULTIPLIER : 1),
        preventAttackerCasualties: attackerStim,
        preventDefenderLosses: defenderStim,
        defenderPoints: defenderGold,
        defenderFood,
      });

      if (outcome.attackerReturned > 0) {
        const returnArrivesAt = getAttackArrivalAt({
          launchedAt: tickAt,
          origin: {
            mapX: target.mapX,
            mapY: target.mapY,
          },
          target: {
            mapX: attacker.mapX,
            mapY: attacker.mapY,
          },
          attackerRace: attackerRace,
          raceBuffTier,
          speedMultiplier: getDwarfSpeedMultiplier(attacker),
          waaagh: getOrkWaaghActive(attacker),
        });

        await db.attackUnit.update({
          where: {
            id: unit.id,
          },
          data: {
            recalledAt: tickAt,
            returnOriginMapX: target.mapX,
            returnOriginMapY: target.mapY,
            arrivesAt: returnArrivesAt,
            defenderArmyAtBattleStart,
            resolvedAttackPower: outcome.attackPower,
            resolvedDefensePower: outcome.defensePower,
            attackerSurvivors: outcome.attackerSurvivors,
            attackerRetired: outcome.attackerRetired,
            attackerReturned: outcome.attackerReturned,
            defenderLosses: outcome.defenderLosses,
            pointsLooted: outcome.pointsLooted,
            foodLooted: outcome.foodLooted,
            armyLooted: 0,
          },
        });
      } else {
        await db.attackUnit.update({
          where: {
            id: unit.id,
          },
          data: {
            resolvedAt: tickAt,
            defenderArmyAtBattleStart,
            resolvedAttackPower: outcome.attackPower,
            resolvedDefensePower: outcome.defensePower,
            attackerSurvivors: outcome.attackerSurvivors,
            attackerRetired: outcome.attackerRetired,
            attackerReturned: outcome.attackerReturned,
            defenderLosses: outcome.defenderLosses,
            pointsLooted: outcome.pointsLooted,
            foodLooted: outcome.foodLooted,
            armyLooted: 0,
          },
        });
        resolvedAttackUnits += 1;
      }

      currentArmy.set(
        target.id,
        Math.max(0, defenderArmy - outcome.defenderLosses)
      );
      currentGold.set(
        attacker.id,
        (currentGold.get(attacker.id) ?? attacker.gold) +
          outcome.pointsLooted
      );
      currentGold.set(
        target.id,
        Math.max(0, defenderGold - outcome.pointsLooted)
      );
      const strongerTogether =
        attackerRace === "ORKS" &&
        raceBuffTier >= 1 &&
        outcome.defenderLosses > 0
          ? Math.floor(outcome.defenderLosses * ORK_STRONGER_TOGETHER_RATE)
          : 0;
      currentFood.set(
        attacker.id,
        (currentFood.get(attacker.id) ?? attacker.food) + outcome.foodLooted
      );
      currentFood.set(
        target.id,
        Math.max(0, defenderFood - outcome.foodLooted)
      );
      if (strongerTogether > 0) {
        currentArmy.set(
          attacker.id,
          (currentArmy.get(attacker.id) ?? attacker.army) + strongerTogether
        );
      }

      if (outcome.pointsLooted > 0) {
        scoreEvents.push(
          {
            cycleId,
            fortressId: target.id,
            actorId: attacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.ATTACK_TARGET,
            delta: -outcome.pointsLooted,
            createdAt: tickAt,
          },
          {
            cycleId,
            fortressId: attacker.id,
            actorId: attacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.ATTACK_TARGET,
            delta: outcome.pointsLooted,
            createdAt: tickAt,
          }
        );
      }
    }

    const ownedTiles = await db.mapHexOwnership.findMany({
      where: {
        cycleId,
      },
      select: {
        ownerFortressId: true,
        tileId: true,
      },
    });
    const tileBonusesByFortressId = new Map<
      string,
      { points: number; food: number; army: number }
    >();

    for (const ownership of ownedTiles) {
      if (isHomeOfATile(ownership.tileId)) {
        continue;
      }

      const tile = getTileById(ownership.tileId);
      const bonus = getTileBonus(tile);
      const current =
        tileBonusesByFortressId.get(ownership.ownerFortressId) ?? {
          points: 0,
          food: 0,
          army: 0,
        };

      tileBonusesByFortressId.set(ownership.ownerFortressId, {
        points: current.points + bonus.points,
        food: current.food + bonus.food,
        army: current.army + bonus.army,
      });
    }

    const homeOfAHolders = await db.homeOfAHolder.findMany({
      where: {
        cycleId,
      },
      select: {
        fortressId: true,
        bannerFortressId: true,
        contributionWeight: true,
      },
    });
    const homeBannerFortressId = homeOfAHolders[0]?.bannerFortressId ?? null;

    if (homeBannerFortressId) {
      const sharedPool = Math.floor(HOME_OF_A_POINT_INCOME / 2);
      const bannerBase = HOME_OF_A_POINT_INCOME - sharedPool;
      const totalWeight = homeOfAHolders.reduce(
        (sum, holder) => sum + Math.max(0, holder.contributionWeight),
        0
      );
      const homeIncomeByFortressId = new Map<string, number>([
        [homeBannerFortressId, bannerBase],
      ]);
      let distributedSharedPoints = 0;

      if (totalWeight > 0) {
        for (const holder of homeOfAHolders) {
          const weightedShare = Math.floor(
            (sharedPool * Math.max(0, holder.contributionWeight)) / totalWeight
          );

          if (weightedShare <= 0) {
            continue;
          }

          distributedSharedPoints += weightedShare;
          homeIncomeByFortressId.set(
            holder.fortressId,
            (homeIncomeByFortressId.get(holder.fortressId) ?? 0) +
              weightedShare
          );
        }
      }

      const remainder = sharedPool - distributedSharedPoints;

      if (remainder > 0) {
        homeIncomeByFortressId.set(
          homeBannerFortressId,
          (homeIncomeByFortressId.get(homeBannerFortressId) ?? 0) + remainder
        );
      }

      for (const [fortressId, income] of homeIncomeByFortressId) {
        if (income <= 0 || !fortressLookup.has(fortressId)) {
          continue;
        }

        currentPoints.set(
          fortressId,
          (currentPoints.get(fortressId) ?? 0) + income
        );
        scoreEvents.push({
          cycleId,
          fortressId,
          eventType: ScoreEventType.GROW_TICK,
          delta: income,
          createdAt: tickAt,
        });
      }
    }

    for (const fortress of fortresses) {
      if (fortress.isNpc) {
        continue;
      }

      const production = calculateTickProduction({
        ...fortress,
        race: getEffectiveRace(fortress),
        food: currentFood.get(fortress.id) ?? fortress.food,
        castleSpecializations: countCastleSpecializations(
          fortress.castleUpgradeSpecializations
        ),
      });
      const economyHalted =
        getEffectiveRace(fortress) === "DWARFS" &&
        isRaceAbilityActive(
          fortress.raceAbilityActivations,
          RaceAbilityKind.DWARF_ECONOMY_HALT,
          tickAt
        );
      const economySurged =
        getEffectiveRace(fortress) === "DWARFS" &&
        isRaceAbilityActive(
          fortress.raceAbilityActivations,
          RaceAbilityKind.DWARF_ECONOMY_SURGE,
          tickAt
        );
      const producedGold = economyHalted
        ? 0
        : Math.floor(
            production.goldProduced *
              (economySurged ? DWARF_DEEP_MINING_ECONOMY_MULTIPLIER : 1)
          );
      const producedFood = economyHalted
        ? 0
        : Math.floor(
            production.foodProduced *
              (economySurged ? DWARF_DEEP_MINING_ECONOMY_MULTIPLIER : 1)
          );
      const armyProduced = economyHalted
        ? 0
        : Math.floor(
            production.armyProduced *
              (economySurged ? DWARF_DEEP_MINING_ECONOMY_MULTIPLIER : 1)
          );
      const foodAfterProduction = economyHalted
        ? currentFood.get(fortress.id) ?? fortress.food
        : production.foodAfterProduction +
          (producedFood - production.foodProduced) -
          (armyProduced - production.armyProduced);
      const currentArmyValue = currentArmy.get(fortress.id) ?? fortress.army;
      const tileBonus = tileBonusesByFortressId.get(fortress.id) ?? {
        points: 0,
        food: 0,
        army: 0,
      };
      currentGold.set(
        fortress.id,
        (currentGold.get(fortress.id) ?? fortress.gold) + producedGold
      );
      currentPoints.set(
        fortress.id,
        (currentPoints.get(fortress.id) ?? 0) + tileBonus.points
      );
      currentFood.set(
        fortress.id,
        Math.max(0, foodAfterProduction + tileBonus.food)
      );
      currentArmy.set(
        fortress.id,
        currentArmyValue + armyProduced + tileBonus.army
      );
      if (tileBonus.points > 0) {
        scoreEvents.push({
          cycleId,
          fortressId: fortress.id,
          actorId: fortress.ownerId,
          eventType: ScoreEventType.GROW_TICK,
          delta: tileBonus.points,
          createdAt: tickAt,
        });
      }
      // TODO: add a dedicated resource history model for food and army deltas.
    }

    const battlefieldResult = await processActiveBattlefields({
      db,
      cycleId,
      tickAt,
    });

    const fortressUpdates: Array<{
      id: string;
      data: {
        points: number;
        gold: number;
        food: number;
        army: number;
        health: number;
      };
    }> = [];

    for (const fortress of fortresses) {
      const nextPoints = currentPoints.get(fortress.id) ?? fortress.points;
      const nextGold = currentGold.get(fortress.id) ?? fortress.gold;
      const nextFood = currentFood.get(fortress.id) ?? fortress.food;
      const nextArmy = currentArmy.get(fortress.id) ?? fortress.army;
      const nextHealth = currentHealth.get(fortress.id) ?? fortress.health;

      if (
        nextPoints === fortress.points &&
        nextGold === fortress.gold &&
        nextFood === fortress.food &&
        nextArmy === fortress.army &&
        nextHealth === fortress.health
      ) {
        continue;
      }

      fortressUpdates.push({
        id: fortress.id,
        data: {
          points: nextPoints,
          gold: nextGold,
          food: nextFood,
          army: nextArmy,
          health: nextHealth,
        },
      });
    }

    const fortressUpdateChunkSize = 25;
    for (let i = 0; i < fortressUpdates.length; i += fortressUpdateChunkSize) {
      const chunk = fortressUpdates.slice(i, i + fortressUpdateChunkSize);
      await Promise.all(
        chunk.map((update) =>
          db.fortress.update({
            where: { id: update.id },
            data: update.data,
          })
        )
      );
    }

    if (scoreEvents.length > 0) {
      await db.scoreEvent.createMany({
        data: scoreEvents,
      });
    }

  return {
    processed: true,
    scoreEventsCreated: scoreEvents.length + battlefieldResult.scoreEventsCreated,
    launchedAttackUnits: 0,
    resolvedAttackUnits: resolvedAttackUnits + battlefieldResult.resolved,
  };
}

export async function runGameTick({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}): Promise<TickSummary> {
  const summary: TickSummary = {
    restartedRegistrationCycles: 0,
    testingCyclesStarted: 0,
    testingCyclesCompleted: 0,
    activatedCycles: 0,
    resolvedCycles: 0,
    resolvedCommunityWishVotes: 0,
    nextRegistrationCyclesCreated: 0,
    processedMinutes: 0,
    scoreEventsCreated: 0,
    launchedAttackUnits: 0,
    resolvedAttackUnits: 0,
  };

  const expiredRegistrationCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.REGISTRATION,
      OR: [
        {
          testingStartedAt: {
            lte: now,
          },
        },
        {
          registrationEndsAt: {
            lte: now,
          },
        },
      ],
    },
    orderBy: {
      registrationEndsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const communityWishResolution = await resolveExpiredCommunityWishVotes({
    now,
    db,
  });
  summary.resolvedCommunityWishVotes = communityWishResolution.resolved;

  for (const cycle of expiredRegistrationCycles) {
    try {
      if (await restartEmptyRegistrationCycle(cycle.id, now, db)) {
        summary.restartedRegistrationCycles += 1;
        continue;
      }
    } catch (error) {
      throw new TickRunnerError({
        stage: "restart-registration",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }

    try {
      if (await startTestingCycle(cycle.id, now, db)) {
        summary.testingCyclesStarted += 1;
      }
    } catch (error) {
      throw new TickRunnerError({
        stage: "start-testing-cycle",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }
  }

  const expiredTestingCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.TESTING,
      testingEndsAt: {
        lte: now,
      },
    },
    orderBy: {
      testingEndsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  for (const cycle of expiredTestingCycles) {
    try {
      if (await completeTestingCycle(cycle.id, now, db)) {
        summary.testingCyclesCompleted += 1;
        summary.activatedCycles += 1;
      }
    } catch (error) {
      throw new TickRunnerError({
        stage: "complete-testing-cycle",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }
  }

  const activeCycles = await db.cycle.findMany({
    where: {
      status: {
        in: [CycleStatus.TESTING, CycleStatus.ACTIVE],
      },
      activeStartedAt: {
        not: null,
      },
    },
    orderBy: {
      activeStartedAt: "asc",
    },
    select: {
      id: true,
      status: true,
      testingStartedAt: true,
      testingEndsAt: true,
      activeStartedAt: true,
      activeEndsAt: true,
    },
  });

  for (const cycle of activeCycles) {
    const gameplayStartedAt =
      cycle.status === CycleStatus.TESTING
        ? cycle.testingStartedAt
        : cycle.activeStartedAt;

    if (!gameplayStartedAt) {
      continue;
    }

    let lastProcessedTick: { tickAt: Date } | null;

    try {
      lastProcessedTick = await db.gameTick.findFirst({
        where: {
          cycleId: cycle.id,
        },
        orderBy: {
          tickAt: "desc",
        },
        select: {
          tickAt: true,
        },
      });
    } catch (error) {
      throw new TickRunnerError({
        stage: "load-last-processed-tick",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }

    const nextTickAt = lastProcessedTick
      ? addMinutes(lastProcessedTick.tickAt, 1)
      : getFirstTickAt(gameplayStartedAt);
    const lastDueTickAt = getLastDueTickAt(
      {
        ...cycle,
        activeStartedAt: gameplayStartedAt,
      },
      now
    );

    if (lastDueTickAt && nextTickAt <= lastDueTickAt) {
      for (
        let tickAt = nextTickAt;
        tickAt <= lastDueTickAt;
        tickAt = addMinutes(tickAt, 1)
      ) {
        let result: ProcessCycleTickResult;

        try {
          result = await processCycleTick(cycle.id, tickAt, now, db);
        } catch (error) {
          throw new TickRunnerError({
            stage: "process-minute",
            cycleId: cycle.id,
            tickAt,
            now,
            cause: error,
          });
        }

        if (result.processed) {
          summary.processedMinutes += 1;
          summary.scoreEventsCreated += result.scoreEventsCreated;
          summary.launchedAttackUnits += result.launchedAttackUnits;
          summary.resolvedAttackUnits += result.resolvedAttackUnits;
        }
      }
    }

    let resolution: {
      resolved: boolean;
      createdNextCycle: boolean;
    };

    try {
      resolution = await resolveExpiredActiveCycle(cycle.id, now, db);
    } catch (error) {
      throw new TickRunnerError({
        stage: "resolve-active-cycle",
        cycleId: cycle.id,
        now,
        cause: error,
      });
    }

    if (resolution.resolved) {
      summary.resolvedCycles += 1;
    }

    if (resolution.createdNextCycle) {
      summary.nextRegistrationCyclesCreated += 1;
    }
  }

  return summary;
}
