import {
  CycleStatus,
  FortressAction,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import { createHash } from "node:crypto";
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
import { ensureCommanderRegistrationColumn } from "./schema-guards";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
type SpawnPoint = { x: number; y: number };

const DEFAULT_MIN_SPAWN_SEPARATION = 0;

function buildSpawnSeed(parts: {
  cycleId: string;
  purpose: string;
  activeStartedAt?: Date | null;
  entropy?: string;
}) {
  const payload = [
    `purpose=${parts.purpose}`,
    `cycle=${parts.cycleId}`,
    `active-started-at=${parts.activeStartedAt?.toISOString() ?? "none"}`,
    `entropy=${parts.entropy ?? "none"}`,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

function getNpcCommanderName(cycleId: string) {
  return `NPC ${cycleId}`;
}

function xmur3(seed: string) {
  let hash = 1779033703 ^ seed.length;

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    const result = (a + b + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + result) | 0;

    return (result >>> 0) / 4294967296;
  };
}

function createSeededPrng(seed: string) {
  const nextSeed = xmur3(seed);
  return sfc32(nextSeed(), nextSeed(), nextSeed(), nextSeed());
}

function toPointKey(point: SpawnPoint) {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function distanceBetweenPoints(left: SpawnPoint, right: SpawnPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function shuffleInPlace<T>(items: T[], random: () => number) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex] as T;
    items[swapIndex] = current as T;
  }
}

export function takeUniqueSpawnPoints(
  seed: string,
  count: number,
  options?: {
    minSeparationDistance?: number;
    excludedKeys?: Set<string>;
  }
) {
  const minSeparationDistance =
    options?.minSeparationDistance ?? DEFAULT_MIN_SPAWN_SEPARATION;
  const random = createSeededPrng(seed);
  const excludedKeys = options?.excludedKeys ?? new Set<string>();
  const uniqueCandidates = new Map<string, SpawnPoint>();
  const candidates = HEX_SPAWN_TILES.map((tile) => ({
    x: tile.xPercent,
    y: tile.yPercent,
  })).filter((point) => isPointNearSpawnHex(point));

  shuffleInPlace(candidates, random);

  for (const point of candidates) {
    const key = toPointKey(point);

    if (excludedKeys.has(key) || uniqueCandidates.has(key)) {
      continue;
    }

    uniqueCandidates.set(key, point);
  }

  const remaining = [...uniqueCandidates.values()];
  const selected: SpawnPoint[] = [];

  while (selected.length < count) {
    const viable = remaining.filter((candidate) => {
      return selected.every((picked) => {
        return (
          distanceBetweenPoints(candidate, picked) >= minSeparationDistance
        );
      });
    });

    if (viable.length === 0) {
      break;
    }

    let chosen = viable[0];
    let bestNearestDistance = -1;

    for (const candidate of viable) {
      const nearestDistance =
        selected.length === 0
          ? Number.POSITIVE_INFINITY
          : Math.min(
              ...selected.map((picked) =>
                distanceBetweenPoints(candidate, picked)
              )
            );

      if (nearestDistance > bestNearestDistance) {
        chosen = candidate;
        bestNearestDistance = nearestDistance;
        continue;
      }

      if (nearestDistance === bestNearestDistance && random() > 0.5) {
        chosen = candidate;
      }
    }

    selected.push(chosen);
    const chosenKey = toPointKey(chosen);
    const chosenIndex = remaining.findIndex(
      (candidate) => toPointKey(candidate) === chosenKey
    );

    if (chosenIndex >= 0) {
      remaining.splice(chosenIndex, 1);
    }
  }

  if (selected.length < count) {
    throw new Error("Not enough unique spawn points for active fortresses.");
  }

  return selected;
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
      isNpc: true,
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
    seed: buildSpawnSeed({
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
    },
    orderBy: [{ isNpc: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });
  const positions = takeUniqueSpawnPoints(seed, fortresses.length, {
    minSeparationDistance: 9,
  });

  await Promise.all(
    fortresses.map((fortress, index) => {
      const position = positions[index] ?? snapMapPointToHex({ x: 50, y: 50 });

      return db.fortress.update({
        where: {
          id: fortress.id,
        },
        data: {
          mapX: Math.round(position.x),
          mapY: Math.round(position.y),
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
