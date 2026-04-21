import { getStrategicSpawnPositions } from "./map-hex";

export const ACTIVE_PLAYER_CAP = 30;
export const ACTIVE_RENAME_COST = 10;
export const REGISTRATION_DURATION_HOURS = 24;
export const ACTIVE_DURATION_HOURS = 72;
export const ATTACK_UNIT_SPEED_PER_MINUTE = 12;
export const MEGA_FORTRESS_NAME = "A- Megalinnake";
export const MEGA_FORTRESS_ICON_LABEL = "A-";
export const MEGA_FORTRESS_HEALTH = 1000;
export const MEGA_FORTRESS_SIZE_TILES = 4;
export const MEGA_FORTRESS_DESTROY_BONUS = 2000;
export const NPC_SYSTEM_USER_EMAIL = "npc@project-a.local";

export const UNIT_SPRITE_VARIANTS = [
  "unit-1",
  "unit-2",
  "unit-3",
  "unit-4",
  "unit-5",
  "unit-6",
] as const;

export type UnitSpriteVariant = (typeof UNIT_SPRITE_VARIANTS)[number];

export const MAP_POSITIONS = getStrategicSpawnPositions(ACTIVE_PLAYER_CAP);
