import { createHash } from "node:crypto";
import {
  FortressKind,
  LootCampVariant,
  Prisma,
  PrismaClient,
  RaceAbilityKind,
} from "@/lib/prisma-client";
import { addHours, addMinutes } from "./time";
import {
  buildFortressSpawnSeed,
  getRenderedMapPositionKey,
  takeOpenSpawnPoint,
} from "./spawn-layout";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const LOOT_CAMP_LIFETIME_MINUTES = 30;
export const LOOT_CAMP_MIN_STRENGTH = 100;
export const LOOT_CAMP_MAX_STRENGTH = 10000;
export const LOOT_CAMP_MIN_SPAWNS_PER_HOUR = 1;
export const LOOT_CAMP_MAX_SPAWNS_PER_HOUR = 3;

export type LootCampReward = {
  points: number;
  gold: number;
  food: number;
  army: number;
  resetRaceCooldown: boolean;
};

export function getLootCampDefenseArmy(
  variant: LootCampVariant | null,
  strength: number
) {
  if (variant === LootCampVariant.CHAOS) {
    return Math.max(12, Math.floor(strength * 0.12));
  }

  if (variant === LootCampVariant.RICH) {
    return Math.max(8, Math.floor(strength * 0.08));
  }

  return Math.max(5, Math.floor(strength * 0.05));
}

type LootCampScheduleEntry = {
  slot: number;
  minute: number;
};

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

function getHourStart(value: Date) {
  const hourStart = new Date(value);
  hourStart.setUTCMinutes(0, 0, 0);
  return hourStart;
}

function buildLootCampIdentity(parts: {
  cycleId: string;
  hourStart: Date;
  minute: number;
  slot: number;
}) {
  return createHash("sha256")
    .update(
      [
        "loot-camp",
        parts.cycleId,
        parts.hourStart.toISOString(),
        parts.minute,
        parts.slot,
      ].join("|")
    )
    .digest("hex")
    .slice(0, 12);
}

export function getLootCampScheduleForHour(parts: {
  cycleId: string;
  activeStartedAt: Date | null;
  hourStart: Date;
}) {
  const random = createSeededPrng(
    buildFortressSpawnSeed({
      cycleId: parts.cycleId,
      activeStartedAt: parts.activeStartedAt,
      tickAt: parts.hourStart,
      purpose: "loot-camp:hour-schedule",
    })
  );
  const count =
    LOOT_CAMP_MIN_SPAWNS_PER_HOUR +
    Math.floor(
      random() *
        (LOOT_CAMP_MAX_SPAWNS_PER_HOUR - LOOT_CAMP_MIN_SPAWNS_PER_HOUR + 1)
    );
  const entries: LootCampScheduleEntry[] = [];

  for (let slot = 0; slot < count; slot += 1) {
    const segmentStart = Math.floor((slot * 60) / count);
    const segmentEnd = Math.floor(((slot + 1) * 60) / count) - 1;
    const minute =
      segmentStart + Math.floor(random() * (segmentEnd - segmentStart + 1));

    entries.push({
      slot,
      minute,
    });
  }

  return entries;
}

function getLootCampVariant(random: () => number) {
  const roll = random();

  if (roll < 0.45) {
    return LootCampVariant.CLASSIC;
  }

  if (roll < 0.9) {
    return LootCampVariant.RICH;
  }

  return LootCampVariant.CHAOS;
}

function getLootCampName(variant: LootCampVariant, identity: string) {
  const prefix =
    variant === LootCampVariant.CLASSIC
      ? "Classic"
      : variant === LootCampVariant.RICH
        ? "Rich"
        : "Chaos";

  return `${prefix} Loot Camp ${identity}`;
}

export function getLootCampReward(
  variant: LootCampVariant | null,
  strength: number
): LootCampReward {
  if (variant === LootCampVariant.CLASSIC) {
    return {
      points: 1,
      gold: Math.floor(strength * 0.25),
      food: strength,
      army: 0,
      resetRaceCooldown: false,
    };
  }

  if (variant === LootCampVariant.RICH) {
    return {
      points: Math.max(1, Math.floor(strength * 0.02)),
      gold: strength,
      food: Math.floor(strength * 0.4),
      army: 0,
      resetRaceCooldown: false,
    };
  }

  if (variant === LootCampVariant.CHAOS) {
    return {
      points: 0,
      gold: Math.floor(strength * 0.15),
      food: Math.floor(strength * 0.25),
      army: strength,
      resetRaceCooldown: true,
    };
  }

  return {
    points: 0,
    gold: 0,
    food: 0,
    army: 0,
    resetRaceCooldown: false,
  };
}

export async function expireLootCamps({
  db,
  cycleId,
  tickAt,
}: {
  db: DatabaseClient;
  cycleId: string;
  tickAt: Date;
}) {
  await db.fortress.updateMany({
    where: {
      cycleId,
      fortressKind: FortressKind.LOOT_CAMP,
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
}

export async function spawnScheduledLootCamps({
  db,
  cycleId,
  activeStartedAt,
  tickAt,
}: {
  db: DatabaseClient;
  cycleId: string;
  activeStartedAt: Date | null;
  tickAt: Date;
}) {
  const hourStart = getHourStart(tickAt);
  const minute = tickAt.getUTCMinutes();
  const entries = getLootCampScheduleForHour({
    cycleId,
    activeStartedAt,
    hourStart,
  }).filter((entry) => entry.minute === minute);

  if (entries.length === 0) {
    return 0;
  }

  let spawned = 0;

  for (const entry of entries) {
    const identity = buildLootCampIdentity({
      cycleId,
      hourStart,
      minute,
      slot: entry.slot,
    });
    const random = createSeededPrng(
      buildFortressSpawnSeed({
        cycleId,
        activeStartedAt,
        tickAt,
        purpose: "loot-camp:spawn",
        entropy: identity,
      })
    );
    const variant = getLootCampVariant(random);
    const strength =
      LOOT_CAMP_MIN_STRENGTH +
      Math.floor(
        random() * (LOOT_CAMP_MAX_STRENGTH - LOOT_CAMP_MIN_STRENGTH + 1)
      );
    const name = getLootCampName(variant, identity);
    const existing = await db.fortress.findFirst({
      where: {
        cycleId,
        name,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      continue;
    }

    const occupiedFortresses = await db.fortress.findMany({
      where: {
        cycleId,
        OR: [
          {
            fortressKind: {
              not: FortressKind.LOOT_CAMP,
            },
          },
          {
            fortressKind: FortressKind.LOOT_CAMP,
            health: {
              gt: 0,
            },
            OR: [
              {
                expiresAt: null,
              },
              {
                expiresAt: {
                  gt: tickAt,
                },
              },
            ],
          },
        ],
      },
      select: {
        mapX: true,
        mapY: true,
      },
    });
    const excludedKeys = new Set(
      occupiedFortresses.map((fortress) => getRenderedMapPositionKey(fortress))
    );
    const openPosition = takeOpenSpawnPoint(
      buildFortressSpawnSeed({
        cycleId,
        activeStartedAt,
        tickAt,
        purpose: "loot-camp:position",
        entropy: identity,
      }),
      {
        excludedKeys,
        referencePoints: occupiedFortresses.map((fortress) => ({
          x: fortress.mapX,
          y: fortress.mapY,
        })),
        minSeparationDistance: 9,
        preferredEdgePadding: 15,
        scoreRandomness: 18,
      }
    );

    const npcUser = await db.user.create({
      data: {
        name: "Loot Camp NPC",
      },
      select: {
        id: true,
      },
    });

    await db.fortress.create({
      data: {
        cycleId,
        ownerId: npcUser.id,
        commanderName: name,
        commanderNameRegisteredAt: tickAt,
        name,
        food: 0,
        army: getLootCampDefenseArmy(variant, strength),
        minersAssigned: 0,
        farmersAssigned: 0,
        recruitersAssigned: 0,
        isNpc: true,
        fortressKind: FortressKind.LOOT_CAMP,
        lootCampVariant: variant,
        health: strength,
        maxHealth: strength,
        expiresAt: addMinutes(tickAt, LOOT_CAMP_LIFETIME_MINUTES),
        sizeTiles: 1,
        mapX: Math.round(openPosition.x),
        mapY: Math.round(openPosition.y),
        unitSpriteVariant: "unit-1",
        joinedAt: tickAt,
      },
    });
    spawned += 1;
  }

  return spawned;
}

export async function resetAttackerRaceAbilityCooldown({
  db,
  fortress,
  now,
}: {
  db: DatabaseClient;
  fortress: {
    id: string;
    race: string | null;
  };
  now: Date;
}) {
  const kind =
    fortress.race === "ORKS"
      ? RaceAbilityKind.ORK_WAAAGH
      : fortress.race === "SPACE_MURINES"
        ? RaceAbilityKind.SPACE_MURINE_STIM
        : fortress.race === "UNSTABLE_UNICORNS"
          ? RaceAbilityKind.UNICORN_TELEPORT
          : null;

  if (!kind) {
    return;
  }

  const usedAt =
    kind === RaceAbilityKind.UNICORN_TELEPORT
      ? addHours(now, -1)
      : addHours(now, -24);

  await db.raceAbilityActivation.updateMany({
    where: {
      fortressId: fortress.id,
      kind,
    },
    data: {
      usedAt,
    },
  });
}
