export type CosmeticSpriteSlot = "UNIT" | "FORTRESS";

export type CosmeticSpriteStyle = {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
};

type CosmeticSpriteCell = { row: number; col: number };

type CosmeticSpriteSheet = {
  src: string;
  variants: readonly string[];
  /** Number of columns in this section of the sheet. */
  columns: number;
  /**
   * Total physical rows in the image file.
   * Defaults to ceil(variants.length / columns) when the sheet is not shared.
   */
  totalRows?: number;
  /**
   * First image row where this section's sprites start.
   * Defaults to 0.
   */
  rowOffset?: number;
  /**
   * Per-variant overrides for sprites that are not laid out in a strict grid
   * (e.g., a partially-filled last row that is centred rather than left-aligned).
   * Rows and columns are absolute image coordinates (rowOffset is NOT applied).
   */
  cells?: Partial<Record<string, CosmeticSpriteCell>>;
};

const UNIT_SKIN_SHEETS: readonly CosmeticSpriteSheet[] = [
  {
    // loot-box-set-1.png layout (5 rows total):
    //   row 0–1: 4 fortress skins each  (handled in FORTRESS_SKIN_SHEETS)
    //   row 2–3: 6 unit skins each      → columns 0–5
    //   row 4:   4 unit skins centred   → columns 1–4
    src: "/assets/loot-box-set-1.png",
    columns: 6,
    totalRows: 5,
    rowOffset: 2,
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
    cells: {
      // Row 4 has only 4 sprites, centred at columns 1–4.
      "gold-prospector": { row: 4, col: 1 },
      "bone-reaver": { row: 4, col: 2 },
      "hooded-hexer": { row: 4, col: 3 },
      "crystal-warlock": { row: 4, col: 4 },
    },
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
    // loot-box-set-1.png layout (5 rows total):
    //   row 0–1: 4 fortress skins each  → columns 0–3
    //   row 2–4: unit skins             (handled in UNIT_SKIN_SHEETS)
    src: "/assets/loot-box-set-1.png",
    columns: 4,
    totalRows: 5,
    rowOffset: 0,
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

    const sectionRows = Math.ceil(sheet.variants.length / sheet.columns);
    const totalRows = sheet.totalRows ?? sectionRows;
    const rowOffset = sheet.rowOffset ?? 0;

    let col: number;
    let row: number;

    const cellOverride = sheet.cells?.[variant];

    if (cellOverride) {
      // Manually specified absolute position (rowOffset already baked in).
      col = cellOverride.col;
      row = cellOverride.row;
    } else {
      col = index % sheet.columns;
      row = Math.floor(index / sheet.columns) + rowOffset;
    }

    const x = sheet.columns === 1 ? 0 : (col / (sheet.columns - 1)) * 100;
    const y = totalRows === 1 ? 0 : (row / (totalRows - 1)) * 100;

    return {
      backgroundImage: `url("${sheet.src}")`,
      backgroundSize: `${sheet.columns * 100}% ${totalRows * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
    };
  }

  return null;
}
