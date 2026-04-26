export const ACTIVE_PLAYER_CAP = 30;
export const ACTIVE_RENAME_COST = 10;
export const ACTIVE_LOCATION_SHUFFLE_COST = 50;
export const CURRENT_MAP_LAYOUT_VERSION = 2;
export const REGISTRATION_DURATION_HOURS = 24;
export const ACTIVE_DURATION_HOURS = 72;
export const ATTACK_UNIT_SPEED_PER_MINUTE = 12;
export const BASE_FORTRESS_ATTACK_DAMAGE = 2;
export const BASE_FORTRESS_GROWTH = 1;
export const FORTRESS_ATTACK_DAMAGE_PER_LEVEL = 2;
export const FORTRESS_GROWTH_PER_LEVEL = 1;
export const FORTRESS_LEVEL_UP_COSTS = [100, 300, 600, 1000] as const;
export const MAX_FORTRESS_LEVEL = FORTRESS_LEVEL_UP_COSTS.length;
export const MEGA_FORTRESS_NAME = "Home of A";
export const MEGA_FORTRESS_ICON_LABEL = "A-";
export const MEGA_FORTRESS_HEALTH = 1000;
export const MEGA_FORTRESS_SIZE_TILES = 4;
export const MEGA_FORTRESS_DESTROY_BONUS = 500;
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

export const BUILD_ARCADE_SKIN_VARIANTS = [
  "ember",
  "frost",
  "jade",
  "onyx",
] as const;

export type BuildArcadeSkinVariant =
  (typeof BUILD_ARCADE_SKIN_VARIANTS)[number];
