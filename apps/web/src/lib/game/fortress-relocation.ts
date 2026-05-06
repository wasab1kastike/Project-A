import type { Prisma, PrismaClient } from "@/lib/prisma-client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getDistance(
  left: { mapX: number; mapY: number },
  right: { mapX: number; mapY: number }
) {
  const dx = right.mapX - left.mapX;
  const dy = right.mapY - left.mapY;

  return Math.hypot(dx, dy);
}

export async function recalculateReturningAttackRoutes({
  db,
  fortressId,
  oldDestination,
  newDestination,
  now,
}: {
  db: DatabaseClient;
  fortressId: string;
  oldDestination: { mapX: number; mapY: number };
  newDestination: { mapX: number; mapY: number };
  now: Date;
}) {
  const activeReturningUnits = await db.attackUnit.findMany({
    where: {
      attackerFortressId: fortressId,
      resolvedAt: null,
      cancelledAt: null,
      recalledAt: {
        not: null,
      },
    },
    select: {
      id: true,
      recalledAt: true,
      arrivesAt: true,
      returnOriginMapX: true,
      returnOriginMapY: true,
    },
  });

  const updatedReturningUnits = activeReturningUnits
    .map((unit) => {
      if (
        unit.recalledAt === null ||
        unit.returnOriginMapX === null ||
        unit.returnOriginMapY === null
      ) {
        return null;
      }

      const segmentStartedAt = unit.recalledAt;
      const segmentEndsAt = unit.arrivesAt;
      const totalMs = segmentEndsAt.getTime() - segmentStartedAt.getTime();
      const elapsedMs = now.getTime() - segmentStartedAt.getTime();
      const progress = totalMs <= 0 ? 1 : clampProgress(elapsedMs / totalMs);
      const currentPoint = {
        mapX: Math.round(
          unit.returnOriginMapX +
            (oldDestination.mapX - unit.returnOriginMapX) * progress
        ),
        mapY: Math.round(
          unit.returnOriginMapY +
            (oldDestination.mapY - unit.returnOriginMapY) * progress
        ),
      };
      const oldRemainingDistance = getDistance(currentPoint, oldDestination);
      const newRemainingDistance = getDistance(currentPoint, newDestination);
      const oldRemainingMs = Math.max(
        0,
        segmentEndsAt.getTime() - now.getTime()
      );
      const newRemainingMs =
        oldRemainingDistance <= 0
          ? 0
          : Math.round(
              oldRemainingMs * (newRemainingDistance / oldRemainingDistance)
            );

      return {
        id: unit.id,
        returnOriginMapX: currentPoint.mapX,
        returnOriginMapY: currentPoint.mapY,
        recalledAt: now,
        arrivesAt: new Date(now.getTime() + newRemainingMs),
      };
    })
    .filter((unit): unit is NonNullable<typeof unit> => unit !== null);

  for (const unit of updatedReturningUnits) {
    await db.attackUnit.update({
      where: {
        id: unit.id,
      },
      data: {
        returnOriginMapX: unit.returnOriginMapX,
        returnOriginMapY: unit.returnOriginMapY,
        recalledAt: unit.recalledAt,
        arrivesAt: unit.arrivesAt,
      },
    });
  }

  return updatedReturningUnits.length;
}
