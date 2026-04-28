import {
  ATTACK_UNIT_SPEED_PER_MINUTE,
  UNIT_SPRITE_VARIANTS,
  type UnitSpriteVariant,
} from "./constants";
import type { FortressRace } from "./races";
import { addMinutes } from "./time";

export function getMapDistance(
  origin: { mapX: number; mapY: number },
  target: { mapX: number; mapY: number }
) {
  return Math.hypot(target.mapX - origin.mapX, target.mapY - origin.mapY);
}

export function getAttackTravelMinutes(
  origin: { mapX: number; mapY: number },
  target: { mapX: number; mapY: number },
  options?: {
    attackerRace?: FortressRace | null;
    raceBuffTier?: number;
  }
) {
  const speedMultiplier =
    options?.attackerRace === "UNSTABLE_UNICORNS" &&
    (options.raceBuffTier ?? 0) >= 2
      ? 2
      : 1;

  return Math.max(
    1,
    Math.ceil(
      getMapDistance(origin, target) /
        (ATTACK_UNIT_SPEED_PER_MINUTE * speedMultiplier)
    )
  );
}

export function getAttackArrivalAt({
  launchedAt,
  origin,
  target,
  attackerRace,
  raceBuffTier,
}: {
  launchedAt: Date;
  origin: { mapX: number; mapY: number };
  target: { mapX: number; mapY: number };
  attackerRace?: FortressRace | null;
  raceBuffTier?: number;
}) {
  return addMinutes(
    launchedAt,
    getAttackTravelMinutes(origin, target, {
      attackerRace,
      raceBuffTier,
    })
  );
}

export function getRandomUnitSpriteVariant(): UnitSpriteVariant {
  const index = Math.floor(Math.random() * UNIT_SPRITE_VARIANTS.length);

  return UNIT_SPRITE_VARIANTS[index] ?? UNIT_SPRITE_VARIANTS[0];
}

export function normalizeUnitSpriteVariant(value: string): UnitSpriteVariant {
  if (UNIT_SPRITE_VARIANTS.includes(value as UnitSpriteVariant)) {
    return value as UnitSpriteVariant;
  }

  return UNIT_SPRITE_VARIANTS[0];
}
