import { ArcadeCosmeticSlot } from "@/lib/prisma-client";

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

export type ArcadeLootBoxSkinRarity = "Common" | "Rare" | "Epic" | "Legendary";

export type ArcadeLootBoxSkin = {
  variant: string;
  name: string;
  rarity: ArcadeLootBoxSkinRarity;
  description: string;
  slot: ArcadeCosmeticSlot;
};

export const ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_1 = [
  {
    variant: "ice-fortress",
    name: "Ice Fortress",
    rarity: "Rare",
    description: "Frozen citadel carved from eternal glacier walls.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "lava-citadel",
    name: "Lava Citadel",
    rarity: "Epic",
    description: "Magma-fed fortress built where sanity ends.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "forest-keep",
    name: "Forest Keep",
    rarity: "Rare",
    description: "Hidden woodland stronghold defended by roots and stone.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "void-castle",
    name: "Void Castle",
    rarity: "Legendary",
    description: "Dark palace pulsing with forbidden energy.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "frosthold-bastion",
    name: "Frosthold Bastion",
    rarity: "Rare",
    description: "Northern military base hardened by endless winter.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "molten-stronghold",
    name: "Molten Stronghold",
    rarity: "Epic",
    description: "Blackrock fortress with rivers of living fire.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "golden-capital",
    name: "Golden Capital",
    rarity: "Legendary",
    description: "Wealthy imperial seat plated in gold and ego.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "shadow-spire",
    name: "Shadow Spire",
    rarity: "Legendary",
    description: "Towering bastion where light goes to die.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_2 = [
  {
    variant: "desert-fortress",
    name: "Desert Fortress",
    rarity: "Common",
    description: "Sun-scorched stronghold built from sandstone and stubbornness.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "crystal-citadel",
    name: "Crystal Citadel",
    rarity: "Epic",
    description: "Frozen palace of enchanted crystal radiating arcane power.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "cyber-fortress",
    name: "Cyber Fortress",
    rarity: "Legendary",
    description: "Reinforced machine citadel powered by neon cores and steel logic.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "swamp-keep",
    name: "Swamp Keep",
    rarity: "Common",
    description: "Moss-covered marsh bastion hidden beneath mist and vines.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "mechanical-drill-fortress",
    name: "Mechanical Drill Fortress",
    rarity: "Legendary",
    description: "Siege fortress equipped with a colossal tunneling engine.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
  {
    variant: "ancient-mire-temple",
    name: "Ancient Mire Temple",
    rarity: "Rare",
    description: "Forgotten jungle-water ruin reclaimed by nature and old magic.",
    slot: ArcadeCosmeticSlot.FORTRESS,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_LEGACY = [
  {
    variant: "silver-knight",
    name: "Silver Knight",
    rarity: "Common",
    description: "Reliable frontline warrior clad in polished steel.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "lava-berserker",
    name: "Lava Berserker",
    rarity: "Epic",
    description: "Molten brute that fights hotter as battle drags on.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "forest-archer",
    name: "Forest Archer",
    rarity: "Common",
    description: "Calm hunter with precise aim and leafy camouflage.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "apprentice-mage",
    name: "Apprentice Mage",
    rarity: "Common",
    description: "Young caster with talent exceeding experience.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "shadow-rogue",
    name: "Shadow Rogue",
    rarity: "Rare",
    description: "Silent infiltrator who appears behind your backline.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "void-sorcerer",
    name: "Void Sorcerer",
    rarity: "Epic",
    description: "Hooded caster wielding unstable cosmic power.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "dark-vanguard",
    name: "Dark Vanguard",
    rarity: "Rare",
    description: "Heavy infantry sworn to ruthless conquest.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "stone-berserker",
    name: "Stone Berserker",
    rarity: "Rare",
    description: "Rocky juggernaut that shrugs off punishment.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "ranger-scout",
    name: "Ranger Scout",
    rarity: "Common",
    description: "Fast-moving bowman built for flanks and picks.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "steam-engineer",
    name: "Steam Engineer",
    rarity: "Rare",
    description: "Gadget specialist with too many tools.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "clockwork-smith",
    name: "Clockwork Smith",
    rarity: "Rare",
    description: "Armored mechanic forging victory mid-battle.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "purple-necromancer",
    name: "Purple Necromancer",
    rarity: "Epic",
    description: "Reanimator of the fallen and morale destroyer.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "gold-prospector",
    name: "Gold Prospector",
    rarity: "Common",
    description: "Coin-hungry adventurer who somehow survives.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "bone-reaver",
    name: "Bone Reaver",
    rarity: "Epic",
    description: "Grim executioner wrapped in deathly trophies.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "hooded-hexer",
    name: "Hooded Hexer",
    rarity: "Rare",
    description: "Dark mystic with curses ready to deploy.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "crystal-warlock",
    name: "Crystal Warlock",
    rarity: "Legendary",
    description: "Ancient spellcaster empowered by glowing gems.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_SET_1 = [
  {
    variant: "samurai-knight",
    name: "Samurai Knight",
    rarity: "Rare",
    description:
      "Honorable swordsman clad in lacquered armor, swift and precise.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "plague-doctor-mage",
    name: "Plague Doctor Mage",
    rarity: "Epic",
    description:
      "Wandering alchemist who mixes healing, poison, and forbidden arts.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "thunder-berserker",
    name: "Thunder Berserker",
    rarity: "Epic",
    description:
      "Storm-fueled warrior whose rage crackles with lightning.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "cactus-ranger",
    name: "Cactus Ranger",
    rarity: "Common",
    description:
      "Desert archer hardened by heat, sand, and sarcasm.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_SET_2 = [
  {
    variant: "vampire-rogue",
    name: "Vampire Rogue",
    rarity: "Rare",
    description:
      "Elegant predator striking from shadow before dawn arrives.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "angel-paladin",
    name: "Angel Paladin",
    rarity: "Legendary",
    description:
      "Winged champion carrying radiant justice into battle.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "goblin-engineer",
    name: "Goblin Engineer",
    rarity: "Common",
    description:
      "Small inventor with dangerous tools and zero hesitation.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "sand-necromancer",
    name: "Sand Necromancer",
    rarity: "Rare",
    description:
      "Desert sorcerer raising what the dunes buried long ago.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_SET_3 = [
  {
    variant: "mushroom-druid",
    name: "Mushroom Druid",
    rarity: "Common",
    description:
      "Forest sage who commands spores, roots, and strange growth.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "neon-assassin",
    name: "Neon Assassin",
    rarity: "Epic",
    description:
      "Silent killer enhanced by glowing forbidden tech.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "frost-giant-warrior",
    name: "Frost Giant Warrior",
    rarity: "Legendary",
    description:
      "Massive northern brute carrying winter into every fight.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "lava-shaman",
    name: "Lava Shaman",
    rarity: "Epic",
    description:
      "Fire mystic channeling molten wrath through ancient rites.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_SET_4 = [
  {
    variant: "royal-musketeer",
    name: "Royal Musketeer",
    rarity: "Rare",
    description:
      "Noble marksman whose aim is as sharp as his manners.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "beekeeper-lancer",
    name: "Beekeeper Lancer",
    rarity: "Common",
    description:
      "Spear fighter protected by a furious royal swarm.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "steam-mech-soldier",
    name: "Steam Mech Soldier",
    rarity: "Rare",
    description:
      "Brass war machine powered by relentless engines.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "shadow-monk",
    name: "Shadow Monk",
    rarity: "Epic",
    description:
      "Silent martial artist striking with void-touched discipline.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_SET_5 = [
  {
    variant: "void-legionnaire",
    name: "Void Legionnaire",
    rarity: "Common",
    description:
      "Standard power-armored frontline trooper built for relentless war.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "crimson-vanguard",
    name: "Crimson Vanguard",
    rarity: "Rare",
    description:
      "Veteran shock soldier leading charges with blade and fury.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "iron-devastator",
    name: "Iron Devastator",
    rarity: "Epic",
    description:
      "Heavy weapons specialist carrying battlefield-ending firepower.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "high-marshal-aurex",
    name: "High Marshal Aurex",
    rarity: "Legendary",
    description:
      "Elite commander whose presence alone raises morale.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_UNIT_LOOT_BOX_SKINS_SET_6 = [
  {
    variant: "brood-gaunt",
    name: "Brood Gaunt",
    rarity: "Common",
    description:
      "Fast swarm creature bred to overwhelm with numbers.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "venom-shrieker",
    name: "Venom Shrieker",
    rarity: "Rare",
    description:
      "Winged bio-beast spitting corrosive living ammunition.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "tunnel-ravager",
    name: "Tunnel Ravager",
    rarity: "Epic",
    description:
      "Burrowing horror erupting beneath enemy lines.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
  {
    variant: "hive-tyrant-prime",
    name: "Hive Tyrant Prime",
    rarity: "Legendary",
    description:
      "Synapse apex predator directing the swarm with brutal intelligence.",
    slot: ArcadeCosmeticSlot.UNIT,
  },
] as const satisfies readonly ArcadeLootBoxSkin[];

export const ARCADE_LOOT_BOX_SKINS = {
  [ArcadeCosmeticSlot.FORTRESS]: [
    ...ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_1,
    ...ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_2,
  ],
  [ArcadeCosmeticSlot.UNIT]: [
    ...ARCADE_UNIT_LOOT_BOX_SKINS_LEGACY,
    ...ARCADE_UNIT_LOOT_BOX_SKINS_SET_1,
    ...ARCADE_UNIT_LOOT_BOX_SKINS_SET_2,
    ...ARCADE_UNIT_LOOT_BOX_SKINS_SET_3,
    ...ARCADE_UNIT_LOOT_BOX_SKINS_SET_4,
    ...ARCADE_UNIT_LOOT_BOX_SKINS_SET_5,
    ...ARCADE_UNIT_LOOT_BOX_SKINS_SET_6,
  ],
} as const satisfies Record<ArcadeCosmeticSlot, readonly ArcadeLootBoxSkin[]>;

export function getArcadeLootBoxSkin(
  slot: ArcadeCosmeticSlot,
  variant: string
) {
  return (
    ARCADE_LOOT_BOX_SKINS[slot].find((skin) => skin.variant === variant) ?? null
  );
}

export const ARCADE_SEASON_BASE_COINS = 100;
export const ARCADE_SEASON_POINTS_BONUS_DIVISOR = 100;
export const ARCADE_SEASON_POINTS_BONUS_CAP = 100;

export const ARCADE_UNIT_LOOT_BOX_PRICE = 75;
export const ARCADE_FORTRESS_LOOT_BOX_PRICE = 75;
export const ARCADE_LOOT_BOX_DUPLICATE_REFUND = 30;

export const ARCADE_MIN_STAKE = 5;
export const ARCADE_MAX_STAKE = 100;
