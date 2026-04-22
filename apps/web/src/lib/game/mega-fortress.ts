import {
  CycleStatus,
  FortressAction,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import {
  HEX_SPAWN_TILES,
  isPointNearSpawnHex,
  snapMapPointToHex,
} from "./map-hex";
import {
  CURRENT_MAP_LAYOUT_VERSION,
  MEGA_FORTRESS_HEALTH,
  MEGA_FORTRESS_ICON_LABEL,
  MEGA_FORTRESS_NAME,
  MEGA_FORTRESS_SIZE_TILES,
  NPC_SYSTEM_USER_EMAIL,
} from "./constants";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getOrderedSpawnPoints(seed: string) {
  return [...HEX_SPAWN_TILES]
    .map((tile) => ({
      x: Math.round(tile.xPercent),
      y: Math.round(tile.yPercent),
      rank: hashString(`${seed}:${tile.id}`),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return `${left.x}:${left.y}`.localeCompare(`${right.x}:${right.y}`);
    });
}

function takeUniqueSpawnPoints(seed: string, count: number) {
  const occupied = new Set<string>();
  const points: Array<{ x: number; y: number }> = [];

  for (const point of getOrderedSpawnPoints(seed)) {
    const key = `${point.x}:${point.y}`;

    if (occupied.has(key) || !isPointNearSpawnHex(point)) {
      continue;
    }

    occupied.add(key);
    points.push({ x: point.x, y: point.y });

    if (points.length === count) {
      break;
    }
  }

  if (points.length < count) {
    throw new Error("Not enough unique spawn points for active fortresses.");
  }

  return points;
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
  const existingMega = await db.fortress.findFirst({
    where: {
      cycleId,
      isNpc: true,
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
          iconLabel: MEGA_FORTRESS_ICON_LABEL,
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
    occupiedFortresses.map((fortress) => `${fortress.mapX}:${fortress.mapY}`)
  );
  const openPosition = getOrderedSpawnPoints(seed).find((point) => {
    return !occupied.has(`${point.x}:${point.y}`) && isPointNearSpawnHex(point);
  });

  if (!openPosition) {
    throw new Error("No map position is available for the mega fortress.");
  }

  return db.fortress.create({
    data: {
      cycleId,
      ownerId: npcUser.id,
      name: MEGA_FORTRESS_NAME,
      isNpc: true,
      health: MEGA_FORTRESS_HEALTH,
      maxHealth: MEGA_FORTRESS_HEALTH,
      sizeTiles: MEGA_FORTRESS_SIZE_TILES,
      iconLabel: MEGA_FORTRESS_ICON_LABEL,
      mapX: openPosition.x,
      mapY: openPosition.y,
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
    seed: `${cycle.id}:${cycle.activeStartedAt?.toISOString() ?? "active"}`,
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
    },
    orderBy: [{ isNpc: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });
  const positions = takeUniqueSpawnPoints(seed, fortresses.length);

  await Promise.all(
    fortresses.map((fortress, index) => {
      const position = positions[index] ?? snapMapPointToHex({ x: 50, y: 50 });

      return db.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          mapX: position.x,
          mapY: position.y,
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
    },
  });

  if (
    !cycle ||
    cycle.status !== CycleStatus.ACTIVE ||
    cycle.mapLayoutVersion >= CURRENT_MAP_LAYOUT_VERSION
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
