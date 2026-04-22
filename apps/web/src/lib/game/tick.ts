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
  ACTIVE_DURATION_HOURS,
  MEGA_FORTRESS_DESTROY_BONUS,
  MEGA_FORTRESS_HEALTH,
  REGISTRATION_DURATION_HOURS,
} from "./constants";
import { launchAttackUnit } from "./attack-units";
import {
  ensureCurrentMapLayout,
  ensureActiveCycleMegaFortress,
  ensureMegaFortress,
  reshuffleActiveFortressPositions,
} from "./mega-fortress";
import { addHours, addMinutes, floorToMinute } from "./time";

type TickSummary = {
  restartedRegistrationCycles: number;
  activatedCycles: number;
  resolvedCycles: number;
  nextRegistrationCyclesCreated: number;
  processedMinutes: number;
  scoreEventsCreated: number;
};

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

function getLastDueTickAt(
  cycle: {
    activeStartedAt: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  if (!cycle.activeStartedAt) {
    return null;
  }

  const nowTick = floorToMinute(now);
  const activeEndTick = cycle.activeEndsAt
    ? floorToMinute(cycle.activeEndsAt)
    : nowTick;
  const lastDueTickAt = nowTick < activeEndTick ? nowTick : activeEndTick;

  if (lastDueTickAt < getFirstTickAt(cycle.activeStartedAt)) {
    return null;
  }

  return lastDueTickAt;
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
      cycle.registrationEndsAt > now
    ) {
      return false;
    }

    if (cycle._count.fortresses > 0) {
      return false;
    }

    const registrationStartedAt = floorToMinute(now);
    const registrationEndsAt = addHours(
      registrationStartedAt,
      REGISTRATION_DURATION_HOURS
    );

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.REGISTRATION,
        registrationStartedAt,
        registrationEndsAt,
        activeStartedAt: null,
        activeEndsAt: addHours(registrationEndsAt, ACTIVE_DURATION_HOURS),
      },
    });

    return true;
  });
}

async function activateRegistrationCycle(
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
      cycle.registrationEndsAt > now
    ) {
      return false;
    }

    if (cycle._count.fortresses === 0) {
      return false;
    }

    const activeStartedAt = cycle.registrationEndsAt;
    const activeEndsAt = addHours(activeStartedAt, ACTIVE_DURATION_HOURS);

    await tx.cycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: CycleStatus.ACTIVE,
        activeStartedAt,
        activeEndsAt,
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
      seed: `${cycle.id}:${activeStartedAt.toISOString()}`,
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

    await tx.cycleHistory.create({
      data: {
        cycleId: cycle.id,
        winnerId: winner.ownerId,
        winnerRequestId: winnerRequest?.id ?? null,
        winningScore: winner.finalScore,
        endedAt: resolutionEndedAt,
        tieBreakSummary: formatTieBreakSummary(winner, tiedCandidates),
        winnerRequestSnapshot: winnerRequest
          ? `[${winnerRequest.status}] ${winnerRequest.requestText}`
          : null,
      },
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
        activeStartedAt: true,
        activeEndsAt: true,
      },
    });

    if (
      !cycle ||
      cycle.status !== CycleStatus.ACTIVE ||
      !cycle.activeStartedAt
    ) {
      return { processed: false, scoreEventsCreated: 0 };
    }

    await ensureActiveCycleMegaFortress({
      db: tx,
      cycleId,
    });

    const firstTickAt = getFirstTickAt(cycle.activeStartedAt);
    const lastDueTickAt = getLastDueTickAt(cycle, now);

    if (!lastDueTickAt || tickAt < firstTickAt || tickAt > lastDueTickAt) {
      return { processed: false, scoreEventsCreated: 0 };
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
        return { processed: false, scoreEventsCreated: 0 };
      }

      throw error;
    }

    await ensureCurrentMapLayout({
      db: tx,
      cycleId,
      seed: `${cycleId}:${tickAt.toISOString()}:layout-v2`,
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
        currentAction: true,
        targetFortressId: true,
        isNpc: true,
        health: true,
        maxHealth: true,
        mapX: true,
        mapY: true,
        joinedAt: true,
      },
    });

    const currentPoints = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.points])
    );
    const currentHealth = new Map(
      fortresses.map((fortress) => [fortress.id, fortress.health])
    );
    let fortressLookup = new Map(
      fortresses.map((fortress) => [fortress.id, fortress])
    );
    const scoreEvents: Prisma.ScoreEventCreateManyInput[] = [];
    const resolvedAttackers = new Set<string>();
    const destroyedMegaTargets = new Set<string>();

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
      },
    });

    for (const unit of dueAttackUnits) {
      const attacker = fortressLookup.get(unit.attackerFortressId);
      const target = fortressLookup.get(unit.targetFortressId);

      await tx.attackUnit.update({
        where: {
          id: unit.id,
        },
        data: {
          resolvedAt: tickAt,
        },
      });

      resolvedAttackers.add(unit.attackerFortressId);

      if (!attacker || !target) {
        continue;
      }

      if (target?.isNpc) {
        if (destroyedMegaTargets.has(target.id)) {
          continue;
        }

        const targetHealth = currentHealth.get(target.id) ?? target.health;
        const targetLoss = Math.min(targetHealth, 2);

        if (targetLoss <= 0) {
          continue;
        }

        const nextHealth = targetHealth - targetLoss;
        currentHealth.set(target.id, nextHealth);

        scoreEvents.push({
          cycleId,
          fortressId: target.id,
          actorId: attacker.ownerId,
          targetFortressId: target.id,
          eventType: ScoreEventType.MEGA_DAMAGE,
          delta: -targetLoss,
          createdAt: tickAt,
        });

        if (nextHealth <= 0) {
          const attackerPoints =
            (currentPoints.get(attacker.id) ?? attacker.points) +
            MEGA_FORTRESS_DESTROY_BONUS;

          currentPoints.set(attacker.id, attackerPoints);
          currentHealth.set(target.id, target.maxHealth || MEGA_FORTRESS_HEALTH);
          destroyedMegaTargets.add(target.id);

          scoreEvents.push({
            cycleId,
            fortressId: attacker.id,
            actorId: attacker.ownerId,
            targetFortressId: target.id,
            eventType: ScoreEventType.MEGA_DESTROY_BONUS,
            delta: MEGA_FORTRESS_DESTROY_BONUS,
            createdAt: tickAt,
          });

          await tx.cycle.update({
            where: {
              id: cycleId,
            },
            data: {
              crownedFortressId: attacker.id,
            },
          });

          await reshuffleActiveFortressPositions({
            db: tx,
            cycleId,
            seed: `${cycleId}:${tickAt.toISOString()}:${unit.id}`,
          });
        }

        continue;
      }

      const targetPoints = currentPoints.get(unit.targetFortressId);

      if (targetPoints === undefined) {
        continue;
      }

      const targetLoss = Math.min(targetPoints, 2);
      currentPoints.set(unit.targetFortressId, targetPoints - targetLoss);

      scoreEvents.push({
        cycleId,
        fortressId: unit.targetFortressId,
        actorId: attacker.ownerId,
        targetFortressId: unit.targetFortressId,
        eventType: ScoreEventType.ATTACK_TARGET,
        delta: -targetLoss,
        createdAt: tickAt,
      });
    }

    for (const fortress of fortresses) {
      if (fortress.isNpc) {
        continue;
      }

      if (fortress.currentAction === FortressAction.GROW) {
        currentPoints.set(
          fortress.id,
          (currentPoints.get(fortress.id) ?? 0) + 1
        );
        scoreEvents.push({
          cycleId,
          fortressId: fortress.id,
          actorId: fortress.ownerId,
          eventType: ScoreEventType.GROW_TICK,
          delta: 1,
          createdAt: tickAt,
        });
        continue;
      }
    }

    for (const fortress of fortresses) {
      const nextPoints = currentPoints.get(fortress.id) ?? fortress.points;
      const nextHealth = currentHealth.get(fortress.id) ?? fortress.health;

      if (nextPoints !== fortress.points || nextHealth !== fortress.health) {
        await tx.fortress.update({
          where: {
            id: fortress.id,
          },
          data: {
            points: nextPoints,
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
          currentAction: true,
          targetFortressId: true,
          isNpc: true,
          health: true,
          maxHealth: true,
          mapX: true,
          mapY: true,
          joinedAt: true,
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
        resolvedAttackers.has(fortress.id)
      ) {
        continue;
      }

      const target = fortressLookup.get(fortress.targetFortressId);

      if (!target) {
        continue;
      }

      const launchedUnit = await launchAttackUnit({
        db: tx,
        cycle,
        attacker: {
          ...fortress,
          points: currentPoints.get(fortress.id) ?? fortress.points,
        },
        target: {
          ...target,
          points: currentPoints.get(target.id) ?? target.points,
        },
        launchedAt: tickAt,
      });

      if (launchedUnit) {
        launchedAttackUnits += 1;
      }
    }

    return {
      processed: true,
      scoreEventsCreated: scoreEvents.length + launchedAttackUnits,
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
    activatedCycles: 0,
    resolvedCycles: 0,
    nextRegistrationCyclesCreated: 0,
    processedMinutes: 0,
    scoreEventsCreated: 0,
  };

  const expiredRegistrationCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.REGISTRATION,
      registrationEndsAt: {
        lte: now,
      },
    },
    orderBy: {
      registrationEndsAt: "asc",
    },
    select: {
      id: true,
    },
  });

  for (const cycle of expiredRegistrationCycles) {
    if (await restartEmptyRegistrationCycle(cycle.id, now, db)) {
      summary.restartedRegistrationCycles += 1;
      continue;
    }

    if (await activateRegistrationCycle(cycle.id, now, db)) {
      summary.activatedCycles += 1;
    }
  }

  const activeCycles = await db.cycle.findMany({
    where: {
      status: CycleStatus.ACTIVE,
      activeStartedAt: {
        not: null,
      },
    },
    orderBy: {
      activeStartedAt: "asc",
    },
    select: {
      id: true,
      activeStartedAt: true,
      activeEndsAt: true,
    },
  });

  for (const cycle of activeCycles) {
    if (!cycle.activeStartedAt) {
      continue;
    }

    const lastProcessedTick = await db.gameTick.findFirst({
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

    const nextTickAt = lastProcessedTick
      ? addMinutes(lastProcessedTick.tickAt, 1)
      : getFirstTickAt(cycle.activeStartedAt);
    const lastDueTickAt = getLastDueTickAt(cycle, now);

    if (lastDueTickAt && nextTickAt <= lastDueTickAt) {
      for (
        let tickAt = nextTickAt;
        tickAt <= lastDueTickAt;
        tickAt = addMinutes(tickAt, 1)
      ) {
        const result = await processCycleTick(cycle.id, tickAt, now, db);

        if (result.processed) {
          summary.processedMinutes += 1;
          summary.scoreEventsCreated += result.scoreEventsCreated;
        }
      }
    }

    const resolution = await resolveExpiredActiveCycle(cycle.id, now, db);

    if (resolution.resolved) {
      summary.resolvedCycles += 1;
    }

    if (resolution.createdNextCycle) {
      summary.nextRegistrationCyclesCreated += 1;
    }
  }

  return summary;
}
