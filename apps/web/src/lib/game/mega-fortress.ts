import {
  CycleStatus,
  FortressAction,
  FortressKind,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import {
  CURRENT_MAP_LAYOUT_VERSION,
  MEGA_FORTRESS_HEALTH,
  MEGA_FORTRESS_ICON_LABEL,
  MEGA_FORTRESS_NAME,
  MEGA_FORTRESS_SIZE_TILES,
  NPC_SYSTEM_USER_EMAIL,
} from "./constants";
import { ensureCommanderRegistrationColumn } from "./schema-guards";
import {
  buildFortressSpawnSeed,
  getRenderedMapPositionKey,
  takeUniqueSpawnPoints,
} from "./spawn-layout";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const DEFAULT_MIN_SPAWN_SEPARATION = 0;
const ACTIVE_EDGE_PADDING = 15;

function distanceBetweenPoints(
  left: { x: number; y: number },
  right: { x: number; y: number }
) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function assignPositionsByDistance(
  fortresses: Array<{ id: string; mapX: number; mapY: number }>,
  positions: Array<{ x: number; y: number }>
) {
  const remaining = [...positions];

  return fortresses.map((fortress) => {
    const ownRenderedKey = getRenderedMapPositionKey(fortress);
    const ranked = [...remaining].sort((left, right) => {
      const leftDistance = distanceBetweenPoints(left, {
        x: fortress.mapX,
        y: fortress.mapY,
      });
      const rightDistance = distanceBetweenPoints(right, {
        x: fortress.mapX,
        y: fortress.mapY,
      });

      return rightDistance - leftDistance;
    });
    const preferred = ranked.find((candidate) => {
      return getRenderedMapPositionKey(candidate) !== ownRenderedKey;
    });
    const chosen = preferred ?? ranked[0];

    if (!chosen) {
      throw new Error("No reshuffle position candidates remain.");
    }

    const chosenKey = getRenderedMapPositionKey(chosen);
    const chosenIndex = remaining.findIndex((candidate) => {
      return getRenderedMapPositionKey(candidate) === chosenKey;
    });

    if (chosenIndex >= 0) {
      remaining.splice(chosenIndex, 1);
    }

    return {
      fortressId: fortress.id,
      position: chosen,
    };
  });
}

export function hasDuplicateFortressMapPositions(
  fortresses: Array<{ mapX: number; mapY: number }>
) {
  const occupied = new Set<string>();

  for (const fortress of fortresses) {
    const positionKey = getRenderedMapPositionKey(fortress);

    if (occupied.has(positionKey)) {
      return true;
    }

    occupied.add(positionKey);
  }

  return false;
}

function getNpcCommanderName(cycleId: string) {
  return `NPC ${cycleId}`;
}

export async function ensureNpcSystemUser(db: DatabaseClient) {
  return db.user.upsert({
    where: {
      email: NPC_SYSTEM_USER_EMAIL,
    },
    update: {
      name: "Project-A NPC",
    },
    create: {
      email: NPC_SYSTEM_USER_EMAIL,
      name: "Project-A NPC",
    },
  });
}

export async function ensureMegaFortress({
  db,
  cycleId,
  seed,
}: {
  db: DatabaseClient;
  cycleId: string;
  seed: string;
}) {
  await ensureCommanderRegistrationColumn(db);

  const existingMega = await db.fortress.findFirst({
    where: {
      cycleId,
      isNpc: true,
      fortressKind: FortressKind.MEGA,
    },
  });

  if (existingMega) {
    if (
      existingMega.name !== MEGA_FORTRESS_NAME ||
      existingMega.iconLabel !== MEGA_FORTRESS_ICON_LABEL
    ) {
      return db.fortress.update({
        where: {
          id: existingMega.id,
        },
        data: {
          name: MEGA_FORTRESS_NAME,
          commanderName: getNpcCommanderName(cycleId),
          commanderNameRegisteredAt: new Date(),
          iconLabel: MEGA_FORTRESS_ICON_LABEL,
          food: 0,
          army: 0,
          minersAssigned: 0,
          farmersAssigned: 0,
          recruitersAssigned: 0,
        },
      });
    }

    return existingMega;
  }

  const npcUser = await ensureNpcSystemUser(db);
  const occupiedFortresses = await db.fortress.findMany({
    where: {
      cycleId,
    },
    select: {
      mapX: true,
      mapY: true,
    },
  });
  const occupied = new Set(
    occupiedFortresses.map((fortress) => getRenderedMapPositionKey(fortress))
  );
  const [openPosition] = takeUniqueSpawnPoints(seed, 1, {
    excludedKeys: occupied,
    minSeparationDistance: DEFAULT_MIN_SPAWN_SEPARATION,
  });

  if (!openPosition) {
    throw new Error("No map position is available for the mega fortress.");
  }

  return db.fortress.create({
    data: {
      cycleId,
      ownerId: npcUser.id,
      commanderName: getNpcCommanderName(cycleId),
      commanderNameRegisteredAt: new Date(),
      name: MEGA_FORTRESS_NAME,
      food: 0,
      army: 0,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
      isNpc: true,
      fortressKind: FortressKind.MEGA,
      health: MEGA_FORTRESS_HEALTH,
      maxHealth: MEGA_FORTRESS_HEALTH,
      sizeTiles: MEGA_FORTRESS_SIZE_TILES,
      iconLabel: MEGA_FORTRESS_ICON_LABEL,
      mapX: Math.round(openPosition.x),
      mapY: Math.round(openPosition.y),
      unitSpriteVariant: "unit-1",
      currentAction: FortressAction.GROW,
    },
  });
}

export async function ensureActiveCycleMegaFortress({
  db,
  cycleId,
}: {
  db: DatabaseClient;
  cycleId: string;
}) {
  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      id: true,
      status: true,
      activeStartedAt: true,
    },
  });

  if (!cycle || cycle.status !== CycleStatus.ACTIVE) {
    return null;
  }

  return ensureMegaFortress({
    db,
    cycleId: cycle.id,
    seed: buildFortressSpawnSeed({
      cycleId: cycle.id,
      purpose: "ensure-active-cycle-mega",
      activeStartedAt: cycle.activeStartedAt,
    }),
  });
}

export async function reshuffleActiveFortressPositions({
  db,
  cycleId,
  seed,
}: {
  db: DatabaseClient;
  cycleId: string;
  seed: string;
}) {
  const fortresses = await db.fortress.findMany({
    where: {
      cycleId,
      OR: [
        {
          fortressKind: {
            not: FortressKind.UNICORN_DECOY,
          },
        },
        {
          health: {
            gt: 0,
          },
        },
      ],
    },
    orderBy: [{ isNpc: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      mapX: true,
      mapY: true,
    },
  });
  const currentRenderedKeys = new Set(
    fortresses.map((fortress) => getRenderedMapPositionKey(fortress))
  );

  let positions: Array<{ x: number; y: number }> | null = null;

  const spawnAttempts: Array<Parameters<typeof takeUniqueSpawnPoints>[2]> = [
    {
      excludedKeys: currentRenderedKeys,
      minSeparationDistance: 9,
      preferredEdgePadding: ACTIVE_EDGE_PADDING,
    },
    {
      minSeparationDistance: 9,
      preferredEdgePadding: ACTIVE_EDGE_PADDING,
    },
    {
      minSeparationDistance: 0,
      preferredEdgePadding: ACTIVE_EDGE_PADDING,
    },
  ];

  for (const options of spawnAttempts) {
    try {
      positions = takeUniqueSpawnPoints(seed, fortresses.length, options);
      break;
    } catch {
      continue;
    }
  }

  if (!positions) {
    console.warn(
      JSON.stringify({
        event: "active-fortress-reshuffle-skipped",
        cycleId,
        fortressCount: fortresses.length,
        reason: "insufficient-unique-spawn-points",
      })
    );
    return;
  }

  const assignments = assignPositionsByDistance(fortresses, positions);

  await Promise.all(
    assignments.map((assignment) => {
      return db.fortress.update({
        where: {
          id: assignment.fortressId,
        },
        data: {
          mapX: Math.round(assignment.position.x),
          mapY: Math.round(assignment.position.y),
        },
      });
    })
  );
}

export async function ensureCurrentMapLayout({
  db,
  cycleId,
  seed,
}: {
  db: DatabaseClient;
  cycleId: string;
  seed: string;
}) {
  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      id: true,
      status: true,
      mapLayoutVersion: true,
      fortresses: {
        where: {
          OR: [
            {
              fortressKind: {
                not: FortressKind.UNICORN_DECOY,
              },
            },
            {
              health: {
                gt: 0,
              },
            },
          ],
        },
        select: {
          mapX: true,
          mapY: true,
        },
      },
    },
  });

  const hasCurrentLayout =
    cycle && cycle.mapLayoutVersion >= CURRENT_MAP_LAYOUT_VERSION;
  const hasDuplicatePositions =
    cycle && hasDuplicateFortressMapPositions(cycle.fortresses);

  if (
    !cycle ||
    (cycle.status !== CycleStatus.ACTIVE &&
      cycle.status !== CycleStatus.TESTING) ||
    (hasCurrentLayout && !hasDuplicatePositions)
  ) {
    return false;
  }

  await reshuffleActiveFortressPositions({
    db,
    cycleId,
    seed,
  });

  await db.cycle.update({
    where: {
      id: cycleId,
    },
    data: {
      mapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION,
    },
  });

  return true;
}
