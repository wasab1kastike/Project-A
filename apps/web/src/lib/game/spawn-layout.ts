import { createHash } from "node:crypto";
import { ACTIVE_PLAYER_CAP } from "./constants";
import {
  HEX_SPAWN_TILES,
  isPointNearSpawnHex,
  snapMapPointToHex,
} from "./map-hex";

export type SpawnPoint = {
  x: number;
  y: number;
};

const DEFAULT_MIN_SPAWN_SEPARATION = 0;
const DEFAULT_LAYOUT_MIN_SPAWN_SEPARATION = 9;

export function buildFortressSpawnSeed(parts: {
  cycleId: string;
  purpose: string;
  activeStartedAt?: Date | null;
  tickAt?: Date;
  entropy?: string;
}) {
  const payload = [
    `purpose=${parts.purpose}`,
    `cycle=${parts.cycleId}`,
    `active-started-at=${parts.activeStartedAt?.toISOString() ?? "none"}`,
    `tick-at=${parts.tickAt?.toISOString() ?? "none"}`,
    `entropy=${parts.entropy ?? "none"}`,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
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

export function getSpawnPointKey(
  point: SpawnPoint | { mapX: number; mapY: number }
) {
  const x = "x" in point ? point.x : point.mapX;
  const y = "y" in point ? point.y : point.mapY;

  return `${Math.round(x)}:${Math.round(y)}`;
}

export function getRenderedMapPositionKey(
  point: SpawnPoint | { mapX: number; mapY: number }
) {
  const x = "x" in point ? point.x : point.mapX;
  const y = "y" in point ? point.y : point.mapY;
  const snapped = snapMapPointToHex({ x, y });

  return `${Math.round(snapped.x)}:${Math.round(snapped.y)}`;
}

function distanceBetweenPoints(left: SpawnPoint, right: SpawnPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function getEdgeDistance(point: SpawnPoint) {
  return Math.min(point.x, 100 - point.x, point.y, 100 - point.y);
}

function getPreferredEdgeCandidates(
  candidates: SpawnPoint[],
  preferredEdgePadding?: number
) {
  if (preferredEdgePadding === undefined) {
    return candidates;
  }

  const preferred = candidates.filter((candidate) => {
    return getEdgeDistance(candidate) >= preferredEdgePadding;
  });

  return preferred.length > 0 ? preferred : candidates;
}

function shuffleInPlace<T>(items: T[], random: () => number) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex] as T;
    items[swapIndex] = current as T;
  }
}

function getUniqueSpawnCandidates(
  random: () => number,
  excludedKeys: Set<string>
) {
  const uniqueCandidates = new Map<string, SpawnPoint>();
  const candidates = HEX_SPAWN_TILES.map((tile) => ({
    x: tile.xPercent,
    y: tile.yPercent,
  })).filter((point) => isPointNearSpawnHex(point));

  shuffleInPlace(candidates, random);

  for (const point of candidates) {
    const key = getRenderedMapPositionKey(point);

    if (excludedKeys.has(key) || uniqueCandidates.has(key)) {
      continue;
    }

    uniqueCandidates.set(key, point);
  }

  return [...uniqueCandidates.values()];
}

export function takeUniqueSpawnPoints(
  seed: string,
  count: number,
  options?: {
    minSeparationDistance?: number;
    excludedKeys?: Set<string>;
    preferredEdgePadding?: number;
  }
) {
  const minSeparationDistance =
    options?.minSeparationDistance ?? DEFAULT_MIN_SPAWN_SEPARATION;
  const preferredEdgePadding = options?.preferredEdgePadding;
  const random = createSeededPrng(seed);
  const excludedKeys = options?.excludedKeys ?? new Set<string>();
  const remaining = getUniqueSpawnCandidates(random, excludedKeys);
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

    const weightedViable = getPreferredEdgeCandidates(
      viable,
      preferredEdgePadding
    );
    let chosen = weightedViable[0];
    let bestNearestDistance = -1;

    for (const candidate of weightedViable) {
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
    const chosenKey = getRenderedMapPositionKey(chosen);
    const chosenIndex = remaining.findIndex(
      (candidate) => getRenderedMapPositionKey(candidate) === chosenKey
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

export function takeOpenSpawnPoint(
  seed: string,
  options?: {
    excludedKeys?: Set<string>;
    referencePoints?: SpawnPoint[];
    minSeparationDistance?: number;
    preferredEdgePadding?: number;
  }
) {
  const random = createSeededPrng(seed);
  const excludedKeys = options?.excludedKeys ?? new Set<string>();
  const referencePoints = options?.referencePoints ?? [];
  const minSeparationDistance =
    options?.minSeparationDistance ?? DEFAULT_LAYOUT_MIN_SPAWN_SEPARATION;
  const preferredEdgePadding = options?.preferredEdgePadding;
  const candidates = getUniqueSpawnCandidates(random, excludedKeys);

  if (candidates.length === 0) {
    throw new Error("No open spawn points are available.");
  }

  if (referencePoints.length === 0) {
    return getPreferredEdgeCandidates(
      candidates,
      preferredEdgePadding
    )[0] as SpawnPoint;
  }

  const scoredCandidates = candidates.map((candidate) => {
    const nearestDistance = Math.min(
      ...referencePoints.map((point) => distanceBetweenPoints(candidate, point))
    );

    return {
      candidate,
      nearestDistance,
      meetsMinimum: nearestDistance >= minSeparationDistance,
    };
  });
  const hasMinimumCandidate = scoredCandidates.some((candidate) => {
    return candidate.meetsMinimum;
  });
  const minimumTier = scoredCandidates.filter((candidate) => {
    return candidate.meetsMinimum === hasMinimumCandidate;
  });
  const weightedCandidates = getPreferredEdgeCandidates(
    minimumTier.map((entry) => entry.candidate),
    preferredEdgePadding
  );
  const weightedKeys = new Set(
    weightedCandidates.map((candidate) => getRenderedMapPositionKey(candidate))
  );
  const eligibleCandidates = minimumTier.filter((candidate) => {
    return weightedKeys.has(getRenderedMapPositionKey(candidate.candidate));
  });
  let bestCandidate =
    (eligibleCandidates[0]?.candidate ?? candidates[0]) as SpawnPoint;
  let bestNearestDistance = eligibleCandidates[0]?.nearestDistance ?? -1;

  for (const candidate of eligibleCandidates) {
    if (candidate.nearestDistance > bestNearestDistance) {
      bestCandidate = candidate.candidate;
      bestNearestDistance = candidate.nearestDistance;
      continue;
    }

    if (
      candidate.nearestDistance === bestNearestDistance &&
      random() > 0.5
    ) {
      bestCandidate = candidate.candidate;
      bestNearestDistance = candidate.nearestDistance;
    }
  }

  return bestCandidate;
}

export function getFortressSpawnLayout(parts: {
  cycleId: string;
  purpose: string;
  count?: number;
  activeStartedAt?: Date | null;
  tickAt?: Date;
  entropy?: string;
  minSeparationDistance?: number;
}) {
  return takeUniqueSpawnPoints(
    buildFortressSpawnSeed({
      cycleId: parts.cycleId,
      purpose: parts.purpose,
      activeStartedAt: parts.activeStartedAt,
      tickAt: parts.tickAt,
      entropy: parts.entropy,
    }),
    parts.count ?? ACTIVE_PLAYER_CAP,
    {
      minSeparationDistance:
        parts.minSeparationDistance ?? DEFAULT_LAYOUT_MIN_SPAWN_SEPARATION,
    }
  );
}
