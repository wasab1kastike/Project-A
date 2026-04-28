import {
  CycleStatus,
  FortressAction,
  Prisma,
  PrismaClient,
  ScoreEventType,
} from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import { ensureOpenRegistrationCycle } from "./bootstrap";
import {
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  TESTING_DURATION_HOURS,
} from "./constants";
import { launchAttackUnit } from "./attack-units";
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
import { buildFortressSpawnSeed } from "./spawn-layout";
import { addHours, addMinutes, floorToMinute } from "./time";
import { calculateRaidOutcome, calculateTickProduction } from "./balance";
import { canFortressLevelUp, getFortressAttackDamage } from "./upgrades";
import {
  getDwarfGrudgeMultiplier,
  getRaceBuffTier,
  isRaceAbilityActive,
} from "./race-buffs";
import { countCastleSpecializations } from "./specializations";
import { RaceAbilityKind } from "@/lib/prisma-client";

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

export type TickHealth = "ok" | "lagging" | "stalled";

type TieBreakCandidate = {
  fortressId: string;
  ownerId: string;
  fortressName: string;
  finalScore: number;
  reachedFinalScoreAt: Date;
  joinedAt: Date;
};

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

  const latestProcessedTickAt = lastProcessedTickAt ?? addMinutes(firstDueTickAt, -1);

  if (latestProcessedTickAt >= dueTickAt) {
    return 0;
  }

  const diffMilliseconds = dueTickAt.getTime() - latestProcessedTickAt.getTime();
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
  const activeEndTick = effectiveEndsAt ? floorToMinute(effectiveEndsAt) : nowTick;
  const lastDueTickAt = nowTick < activeEndTick ? nowTick : activeEndTick;

  if (lastDueTickAt < getFirstTickAt(cycle.activeStartedAt)) {
    return null;
  }

  return lastDueTickAt;
}

function canLaunchAttackOnTick(
  lastLaunchedAt: Date | null,
  tickAt: Date
) {
  if (!lastLaunchedAt) {
    return true;
  }

  return floorToMinute(lastLaunchedAt) < tickAt;
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

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.REGISTRATION,
        registrationStartedAt,
        registrationEndsAt,
        testingStartedAt,
        testingEndsAt: registrationEndsAt,
        activeStartedAt: null,
        activeEndsAt: getNextHelsinkiWeekdayAtHour(registrationEndsAt, 0, 12),
      },
    });

    return true;
  });
}

async function startTestingCycle(
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

    if (cycle._count.fortresses === 0) {
      return false;
    }

    const testingStartedAt = cycle.testingStartedAt!;
    const testingEndsAt = cycle.testingEndsAt!;

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.TESTING,
        testingStartedAt,
        testingEndsAt,
        activeStartedAt: testingEndsAt,
        activeEndsAt: getNextHelsinkiWeekdayAtHour(testingEndsAt, 0, 12),
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
      db: tx,
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
      cycle.testingEndsAt > now
    ) {
      return false;
    }

    const activeStartedAt = cycle.testingEndsAt;
    const activeEndsAt = getNextHelsinkiWeekdayAtHour(activeStartedAt, 0, 12);

    await tx.attackUnit.deleteMany({
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
        level: 0,
        food: 0,
        army: 0,
        minersAssigned: 10,
        farmersAssigned: 10,
        recruitersAssigned: 5,
        race: null,
        currentAction: FortressAction.GROW,
        targetFortressId: null,
        health: 0,
        maxHealth: 0,
        sizeTiles: 1,
        iconLabel: null,
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
      db: tx,
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
      db: tx,
    });

    await mintSeasonArcadeCoins({
      cycleId: cycle.id,
      now: resolutionEndedAt,
      db: tx,
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
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({
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
      db: tx,
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
      await tx.gameTick.create({
        data: {
          cycleId,
          tickAt,
        },
      });
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
      db: tx,
      cycleId,
      seed: buildFortressSpawnSeed({
        cycleId,
        activeStartedAt: gameplayStartedAt,
        tickAt,
        purpose: "tick:layout-v3",
      }),
    });

    let fortresses = await tx.fortress.findMany({
      where: {
        cycleId,
      },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        ownerId: true,
        points: true,
        level: true,
        food: true,
        army: true,
        minersAssigned: true,
        farmersAssigned: true,
        recruitersAssigned: true,
        race: true,
        currentAction: true,
        targetFortressId: true,
        isNpc: true,
        health: true,
        maxHealth: true,
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

    const currentPoints = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.points])
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
    let fortressLookup = new Map(
      fortresses.map((fortress) => [fortress.id, fortress])
    );
    const attackLaunchLookup = new Map<string, { launchedAt: Date; armyAmount: number }>();
    const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];
    const destroyedMegaTargets = new Set<string>();
    let resolvedAttackUnits = 0;

    const attackingFortressIds = fortresses
      .filter(
        (fortress) =>
          !fortress.isNpc &&
          fortress.currentAction === FortressAction.ATTACK &&
          fortress.targetFortressId &&
          fortress.targetFortressId !== fortress.id
      )
      .map((fortress) => fortress.id);

    if (attackingFortressIds.length > 0) {
      const attackLaunches = await tx.attackUnit.findMany({
        where: {
          cycleId,
          attackerFortressId: {
            in: attackingFortressIds,
          },
        },
        orderBy: [{ launchedAt: "desc" }, { id: "desc" }],
        select: {
          attackerFortressId: true,
          launchedAt: true,
          armyAmount: true,
        },
      });

      for (const launch of attackLaunches) {
        if (!attackLaunchLookup.has(launch.attackerFortressId)) {
          attackLaunchLookup.set(launch.attackerFortressId, {
            launchedAt: launch.launchedAt,
            armyAmount: launch.armyAmount,
          });
        }
      }
    }

    const dueAttackUnits = await tx.attackUnit.findMany({
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
        armyAmount: true,
        arrivesAt: true,
      },
    });

    const resolvedBatchAttackUnitIds = new Set<string>();

    for (const unit of dueAttackUnits) {
      if (resolvedBatchAttackUnitIds.has(unit.id)) {
        continue;
      }

      const attacker = fortressLookup.get(unit.attackerFortressId);
      const target = fortressLookup.get(unit.targetFortressId);

      if (target?.isNpc) {
        const targetUnits = dueAttackUnits.filter(
          (targetUnit) =>
            targetUnit.targetFortressId === target.id &&
            !resolvedBatchAttackUnitIds.has(targetUnit.id)
        );

        for (const targetUnit of targetUnits) {
          await tx.attackUnit.update({
            where: {
              id: targetUnit.id,
            },
            data: {
              resolvedAt: tickAt,
            },
          });

          resolvedBatchAttackUnitIds.add(targetUnit.id);
          resolvedAttackUnits += 1;
        }

        if (destroyedMegaTargets.has(target.id)) {
          continue;
        }

        const destructionContributors: Array<{
          unitId: string;
          attacker: NonNullable<typeof attacker>;
        }> = [];

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
            getFortressAttackDamage(targetAttacker.level)
          );

          if (targetLoss <= 0) {
            continue;
          }

          const nextHealth = targetHealth - targetLoss;
          currentHealth.set(target.id, nextHealth);

          destructionContributors.push({
            unitId: targetUnit.id,
            attacker: targetAttacker,
          });

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
          const destroyer = destructionContributors[0];

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

          currentPoints.set(destroyer.attacker.id, attackerPoints);
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

          await tx.cycle.update({
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
            await tx.fortress.update({
              where: {
                id: destroyer.attacker.id,
              },
              data: upgradeData,
            });
          }

          await tx.fortress.update({
            where: {
              id: target.id,
            },
            data: {
              health: nextMegaHealth,
              maxHealth: nextMegaHealth,
            },
          });

          await reshuffleActiveFortressPositions({
            db: tx,
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
        await tx.attackUnit.update({
          where: {
            id: unit.id,
          },
          data: {
            resolvedAt: tickAt,
          },
        });

        resolvedAttackUnits += 1;
        continue;
      }
      const defenderArmy = currentArmy.get(target.id) ?? target.army;
      const defenderPoints = currentPoints.get(target.id) ?? target.points;
      const defenderFood = currentFood.get(target.id) ?? target.food;
      const defenderArmyAtBattleStart = defenderArmy;
      const attackerWaaagh =
        attacker.race === "ORKS" &&
        raceBuffTier >= 2 &&
        isRaceAbilityActive(
          attacker.raceAbilityActivations,
          RaceAbilityKind.ORK_WAAAGH,
          tickAt
        );
      const defenderWaaagh =
        target.race === "ORKS" &&
        raceBuffTier >= 2 &&
        isRaceAbilityActive(
          target.raceAbilityActivations,
          RaceAbilityKind.ORK_WAAAGH,
          tickAt
        );
      const attackerStim =
        attacker.race === "SPACE_MURINES" &&
        raceBuffTier >= 2 &&
        isRaceAbilityActive(
          attacker.raceAbilityActivations,
          RaceAbilityKind.SPACE_MURINE_STIM,
          tickAt
        );
      const defenderStim =
        target.race === "SPACE_MURINES" &&
        raceBuffTier >= 2 &&
        isRaceAbilityActive(
          target.raceAbilityActivations,
          RaceAbilityKind.SPACE_MURINE_STIM,
          tickAt
        );
      const dwarfAttackMultiplier =
        attacker.race === "DWARFS" && raceBuffTier >= 2
          ? getDwarfGrudgeMultiplier(attacker.dwarfGrudges, target.id)
          : 1;
      const dwarfDefenseMultiplier =
        target.race === "DWARFS" && raceBuffTier >= 2
          ? getDwarfGrudgeMultiplier(target.dwarfGrudges, attacker.id)
          : 1;
      const outcome = calculateRaidOutcome({
        attackArmy: unit.armyAmount,
        attackerRace: attacker.race,
        defenderArmy,
        defenderDbLevel: target.level,
        defenderRace: target.race,
        attackPowerMultiplier:
          (attackerWaaagh ? 2 : 1) * dwarfAttackMultiplier,
        defensePowerMultiplier:
          (defenderWaaagh ? 2 : 1) * dwarfDefenseMultiplier,
        preventAttackerCasualties: attackerStim,
        preventDefenderLosses: defenderStim,
        defenderPoints,
        defenderFood,
      });

      await tx.attackUnit.update({
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
        },
      });

      resolvedAttackUnits += 1;

      currentArmy.set(
        attacker.id,
        (currentArmy.get(attacker.id) ?? attacker.army) + outcome.attackerReturned
      );
      currentArmy.set(
        target.id,
        Math.max(0, defenderArmy - outcome.defenderLosses)
      );
      currentPoints.set(
        attacker.id,
        (currentPoints.get(attacker.id) ?? attacker.points) +
          outcome.pointsLooted
      );
      currentPoints.set(
        target.id,
        Math.max(0, defenderPoints - outcome.pointsLooted)
      );
      currentFood.set(
        attacker.id,
        (currentFood.get(attacker.id) ?? attacker.food) + outcome.foodLooted
      );
      currentFood.set(
        target.id,
        Math.max(0, defenderFood - outcome.foodLooted)
      );

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

    for (const fortress of fortresses) {
      if (fortress.isNpc) {
        continue;
      }

      if (fortress.currentAction === FortressAction.GROW) {
        const production = calculateTickProduction({
          ...fortress,
          food: currentFood.get(fortress.id) ?? fortress.food,
          castleSpecializations: countCastleSpecializations(
            fortress.castleUpgradeSpecializations
          ),
        });
        const currentArmyValue = currentArmy.get(fortress.id) ?? fortress.army;
        currentPoints.set(
          fortress.id,
          (currentPoints.get(fortress.id) ?? 0) + production.pointsProduced
        );
        currentFood.set(fortress.id, production.foodAfterProduction);
        currentArmy.set(
          fortress.id,
          currentArmyValue + production.armyProduced
        );
        scoreEvents.push({
          cycleId,
          fortressId: fortress.id,
          actorId: fortress.ownerId,
          eventType: ScoreEventType.GROW_TICK,
          delta: production.pointsProduced,
          createdAt: tickAt,
        });
        // TODO: add a dedicated resource history model for food and army deltas.
        continue;
      }
    }

    for (const fortress of fortresses) {
      const nextPoints = currentPoints.get(fortress.id) ?? fortress.points;
      const nextFood = currentFood.get(fortress.id) ?? fortress.food;
      const nextArmy = currentArmy.get(fortress.id) ?? fortress.army;
      const nextHealth = currentHealth.get(fortress.id) ?? fortress.health;

      if (
        nextPoints !== fortress.points ||
        nextFood !== fortress.food ||
        nextArmy !== fortress.army ||
        nextHealth !== fortress.health
      ) {
        await tx.fortress.update({
          where: {
            id: fortress.id,
          },
          data: {
            points: nextPoints,
            food: nextFood,
            army: nextArmy,
            health: nextHealth,
          },
        });
      }
    }

    if (scoreEvents.length > 0) {
      await tx.scoreEvent.createMany({
        data: scoreEvents,
      });
    }

    let launchedAttackUnits = 0;

    if (destroyedMegaTargets.size > 0) {
      fortresses = await tx.fortress.findMany({
        where: {
          cycleId,
        },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          ownerId: true,
          points: true,
          level: true,
          food: true,
          army: true,
          minersAssigned: true,
          farmersAssigned: true,
          recruitersAssigned: true,
          race: true,
          currentAction: true,
          targetFortressId: true,
          isNpc: true,
          health: true,
          maxHealth: true,
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
      fortressLookup = new Map(
        fortresses.map((fortress) => [fortress.id, fortress])
      );
    }

    for (const fortress of fortresses) {
      if (
        fortress.currentAction !== FortressAction.ATTACK ||
        fortress.isNpc ||
        !fortress.targetFortressId ||
        fortress.targetFortressId === fortress.id ||
        !canLaunchAttackOnTick(
          attackLaunchLookup.get(fortress.id)?.launchedAt ?? null,
          tickAt
        )
      ) {
        continue;
      }

      const target = fortressLookup.get(fortress.targetFortressId);

      if (!target) {
        continue;
      }

      const attackArmyAmount =
        attackLaunchLookup.get(fortress.id)?.armyAmount ?? 1;
      const currentArmyAmount = currentArmy.get(fortress.id) ?? fortress.army;

      if (currentArmyAmount < attackArmyAmount) {
        continue;
      }

      const launchedUnit = await launchAttackUnit({
        db: tx,
        cycle,
        attacker: {
          ...fortress,
          points: currentPoints.get(fortress.id) ?? fortress.points,
          army: currentArmyAmount,
        },
        target: {
          ...target,
          points: currentPoints.get(target.id) ?? target.points,
        },
        launchedAt: tickAt,
        armyAmount: attackArmyAmount,
      });

      if (launchedUnit) {
        launchedAttackUnits += 1;
        attackLaunchLookup.set(fortress.id, {
          launchedAt: tickAt,
          armyAmount: attackArmyAmount,
        });
        currentArmy.set(fortress.id, currentArmyAmount - attackArmyAmount);
      }
    }

    return {
      processed: true,
      scoreEventsCreated: scoreEvents.length + launchedAttackUnits,
      launchedAttackUnits,
      resolvedAttackUnits,
    };
  });
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
