// Explicit state machine for mega fortress lifecycle
// Mega fortress always exists, never destroyed. Handles control and point allocation.
export async function updateMegaFortressState({ db, cycleId, tickAt }: { db: DatabaseClient; cycleId: string; tickAt: Date }) {
  let mega = await db.fortress.findFirst({
    where: { cycleId, isNpc: true, fortressKind: FortressKind.MEGA },
  });
  if (!mega) {
    mega = await ensureMegaFortress({ db, cycleId, seed: buildFortressSpawnSeed({ cycleId, purpose: "init-mega", activeStartedAt: tickAt }) });
  }

  // Find the active battlefield for the mega fortress
  const battlefield = await db.battlefield.findFirst({
    where: {
      cycleId,
      targetFortressId: mega.id,
      status: "ACTIVE",
    },
    include: {
      participants: true,
      defenderBannerFortress: true,
    },
  });

  if (!battlefield) {
    // Not yet conquered, still NPC controlled, no points awarded
    return { state: "npc-controlled" };
  }

  // Controller: defender banner, or participant with most army committed if no banner
  let controllerFortressId = battlefield.defenderBannerFortressId;
  if (!controllerFortressId && battlefield.participants.length > 0) {
    const defenders = battlefield.participants.filter(p => p.side === "DEFENDER");
    if (defenders.length > 0) {
      controllerFortressId = defenders.reduce((max, p) => (p.armyCommitted > max.armyCommitted ? p : max), defenders[0]).fortressId;
    }
  }
  if (!controllerFortressId) {
    // No defenders, no points awarded
    return { state: "uncontrolled" };
  }

  // Award points per tick to controller
  const CONTROLLER_POINTS_PER_TICK = 10; // TODO: adjust as needed
  await db.fortress.update({
    where: { id: controllerFortressId },
    data: { points: { increment: CONTROLLER_POINTS_PER_TICK } },
  });

  // Award points to other defenders
  const DEFENDER_POINTS_PER_TICK = 3; // TODO: adjust as needed
  for (const participant of battlefield.participants) {
    if (participant.side === "DEFENDER" && participant.fortressId !== controllerFortressId) {
      await db.fortress.update({
        where: { id: participant.fortressId },
        data: { points: { increment: DEFENDER_POINTS_PER_TICK } },
      });
    }
  }

  return { state: "controlled", controllerFortressId };
}
import {
  CycleStatus,
  FortressAction,
  FortressKind,
  Prisma,
  PrismaClient,
} from "@/lib/prisma-client";
import {
  CURRENT_MAP_LAYOUT_VERSION,
  HOME_OF_A_NEUTRAL_DEFENSE,
  HOME_OF_A_TILE_ID,
  MEGA_FORTRESS_HEALTH,
  MEGA_FORTRESS_ICON_LABEL,
  MEGA_FORTRESS_NAME,
  MEGA_FORTRESS_SIZE_TILES,
  NPC_SYSTEM_USER_EMAIL,
} from "./constants";
import { ensureCommanderRegistrationColumn } from "./schema-guards";
import { getTileById } from "./territory";
import {
  buildFortressSpawnSeed,
  getRenderedMapPositionKey,
  takeUniqueSpawnPoints,
} from "./spawn-layout";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const ACTIVE_EDGE_PADDING = 15;

export function getHomeOfAMapPosition() {
  const tile = getTileById(HOME_OF_A_TILE_ID);

  if (!tile) {
    return {
      mapX: 50,
      mapY: 50,
    };
  }

  return {
    mapX: Math.round(tile.xPercent),
    mapY: Math.round(tile.yPercent),
  };
}

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
    const homePosition = getHomeOfAMapPosition();

    if (
      existingMega.name !== MEGA_FORTRESS_NAME ||
      existingMega.iconLabel !== MEGA_FORTRESS_ICON_LABEL ||
      existingMega.mapX !== homePosition.mapX ||
      existingMega.mapY !== homePosition.mapY ||
      existingMega.army !== HOME_OF_A_NEUTRAL_DEFENSE
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
          army: HOME_OF_A_NEUTRAL_DEFENSE,
          minersAssigned: 0,
          farmersAssigned: 0,
          recruitersAssigned: 0,
          mapX: homePosition.mapX,
          mapY: homePosition.mapY,
        },
      });
    }

    return existingMega;
  }

  const npcUser = await ensureNpcSystemUser(db);
  const homePosition = getHomeOfAMapPosition();

  return db.fortress.create({
    data: {
      cycleId,
      ownerId: npcUser.id,
      commanderName: getNpcCommanderName(cycleId),
      commanderNameRegisteredAt: new Date(),
      name: MEGA_FORTRESS_NAME,
      food: 0,
      army: HOME_OF_A_NEUTRAL_DEFENSE,
      minersAssigned: 0,
      farmersAssigned: 0,
      recruitersAssigned: 0,
      isNpc: true,
      fortressKind: FortressKind.MEGA,
      health: MEGA_FORTRESS_HEALTH,
      maxHealth: MEGA_FORTRESS_HEALTH,
      sizeTiles: MEGA_FORTRESS_SIZE_TILES,
      iconLabel: MEGA_FORTRESS_ICON_LABEL,
      mapX: homePosition.mapX,
      mapY: homePosition.mapY,
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
      fortressKind: FortressKind.PLAYER,
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
          fortressKind: FortressKind.PLAYER,
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

  // DIAGNOSTIC LOGGING: Help identify why fortress locations are resetting on deploy
  if (cycle) {
    const willReshuffle = !(
      !cycle ||
      (cycle.status !== CycleStatus.ACTIVE &&
        cycle.status !== CycleStatus.TESTING) ||
      (hasCurrentLayout && !hasDuplicatePositions)
    );

    console.error(
      `[LOCATION_DIAGNOSTIC] Cycle: ${cycle.id}, Status: ${cycle.status}`,
      {
        dbMapLayoutVersion: cycle.mapLayoutVersion,
        currentMapLayoutVersion: CURRENT_MAP_LAYOUT_VERSION,
        hasCurrentLayout,
        hasDuplicatePositions,
        fortressCount: cycle.fortresses.length,
        willReshuffle,
        timestamp: new Date().toISOString(),
      }
    );

    if (willReshuffle) {
      console.error(
        `[LOCATION_RESHUFFLE_TRIGGERED] Fortress locations will be randomized! Reason: ${
          !hasCurrentLayout
            ? "mapLayoutVersion outdated"
            : "duplicate positions detected"
        }`
      );
    }
  }

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
