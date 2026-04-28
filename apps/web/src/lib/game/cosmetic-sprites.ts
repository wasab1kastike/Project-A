export type CosmeticSpriteSlot = "UNIT" | "FORTRESS";

export type CosmeticSpriteStyle = {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
};

type CosmeticSpriteSheet = {
  src: string;
  variants: readonly string[];
  columns: number;
};

const UNIT_SKIN_SHEETS: readonly CosmeticSpriteSheet[] = [
  {
    src: "/assets/loot-box-set-1.png",
    columns: 4,
    variants: [
      "silver-knight",
      "lava-berserker",
      "forest-archer",
      "apprentice-mage",
      "shadow-rogue",
      "void-sorcerer",
      "dark-vanguard",
      "stone-berserker",
      "ranger-scout",
      "steam-engineer",
      "clockwork-smith",
      "purple-necromancer",
      "gold-prospector",
      "bone-reaver",
      "hooded-hexer",
      "crystal-warlock",
    ],
  },
  {
    src: "/assets/loot-box-units-set1.png",
    columns: 2,
    variants: [
      "samurai-knight",
      "plague-doctor-mage",
      "thunder-berserker",
      "cactus-ranger",
    ],
  },
  {
    src: "/assets/loot-box-units-set2.png",
    columns: 2,
    variants: [
      "vampire-rogue",
      "angel-paladin",
      "goblin-engineer",
      "sand-necromancer",
    ],
  },
  {
    src: "/assets/loot-box-units-set3.png",
    columns: 2,
    variants: [
      "mushroom-druid",
      "neon-assassin",
      "frost-giant-warrior",
      "lava-shaman",
    ],
  },
  {
    src: "/assets/loot-box-units-set4.png",
    columns: 2,
    variants: [
      "royal-musketeer",
      "beekeeper-lancer",
      "steam-mech-soldier",
      "shadow-monk",
    ],
  },
  {
    src: "/assets/loot-box-units--spacemurines-set1.png",
    columns: 2,
    variants: [
      "void-legionnaire",
      "crimson-vanguard",
      "iron-devastator",
      "high-marshal-aurex",
    ],
  },
  {
    src: "/assets/loot-box-units-tyranimips-set1.png",
    columns: 2,
    variants: [
      "brood-gaunt",
      "venom-shrieker",
      "tunnel-ravager",
      "hive-tyrant-prime",
    ],
  },
];

const FORTRESS_SKIN_SHEETS: readonly CosmeticSpriteSheet[] = [
  {
    src: "/assets/loot-box-set-1.png",
    columns: 4,
    variants: [
      "ice-fortress",
      "lava-citadel",
      "forest-keep",
      "void-castle",
      "frosthold-bastion",
      "molten-stronghold",
      "golden-capital",
      "shadow-spire",
    ],
  },
  {
    src: "/assets/loot-box-fortress-set2.png",
    columns: 3,
    variants: [
      "desert-fortress",
      "crystal-citadel",
      "cyber-fortress",
      "swamp-keep",
      "mechanical-drill-fortress",
      "ancient-mire-temple",
    ],
  },
];

export function getCosmeticSpriteStyle(
  slot: CosmeticSpriteSlot,
  variant: string | null | undefined
): CosmeticSpriteStyle | null {
  if (!variant) {
    return null;
  }

  const sheets = slot === "FORTRESS" ? FORTRESS_SKIN_SHEETS : UNIT_SKIN_SHEETS;

  for (const sheet of sheets) {
    const index = sheet.variants.indexOf(variant);

    if (index === -1) {
      continue;
    }

    const rows = Math.ceil(sheet.variants.length / sheet.columns);
    const column = index % sheet.columns;
    const row = Math.floor(index / sheet.columns);
    const x = sheet.columns === 1 ? 0 : (column / (sheet.columns - 1)) * 100;
    const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;

    return {
      backgroundImage: `url("${sheet.src}")`,
      backgroundSize: `${sheet.columns * 100}% ${rows * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
    };
  }

  return null;
}
