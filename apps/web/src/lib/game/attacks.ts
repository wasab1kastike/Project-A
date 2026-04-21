import {
  ATTACK_UNIT_SPEED_PER_MINUTE,
  UNIT_SPRITE_VARIANTS,
  type UnitSpriteVariant,
} from "./constants";
import { addMinutes } from "./time";

export function getMapDistance(
  origin: { mapX: number; mapY: number },
  target: { mapX: number; mapY: number }
) {
  return Math.hypot(target.mapX - origin.mapX, target.mapY - origin.mapY);
}

export function getAttackTravelMinutes(
  origin: { mapX: number; mapY: number },
  target: { mapX: number; mapY: number }
) {
  return Math.max(
    1,
    Math.ceil(getMapDistance(origin, target) / ATTACK_UNIT_SPEED_PER_MINUTE)
  );
}

export function getAttackArrivalAt({
  launchedAt,
  origin,
  target,
}: {
  launchedAt: Date;
  origin: { mapX: number; mapY: number };
  target: { mapX: number; mapY: number };
}) {
  return addMinutes(launchedAt, getAttackTravelMinutes(origin, target));
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
