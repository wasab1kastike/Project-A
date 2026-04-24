import {
  CycleStatus,
  FortressAction,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import {
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
import {
  buildFortressSpawnSeed,
  takeUniqueSpawnPoints,
} from "./spawn-layout";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const DEFAULT_MIN_SPAWN_SEPARATION = 0;
const ACTIVE_EDGE_PADDING = 15;

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
    },
    orderBy: [{ isNpc: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });
  const positions = takeUniqueSpawnPoints(seed, fortresses.length, {
    minSeparationDistance: 9,
    preferredEdgePadding: ACTIVE_EDGE_PADDING,
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
