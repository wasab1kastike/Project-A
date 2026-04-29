import {
  ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_1,
  ARCADE_UNIT_LOOT_BOX_SKINS_LEGACY,
} from "./constants";
import type { FortressRace } from "./races";

export type CosmeticSpriteSlot = "UNIT" | "FORTRESS";

export type CosmeticSpriteStyle = {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
};

type CosmeticSpriteCell = { row: number; col: number };

type DedicatedCosmeticSprite = {
  src: string;
};

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

const DEDICATED_UNIT_SKINS: Readonly<Record<string, DedicatedCosmeticSprite>> = {
  "silver-knight": { src: "/assets/sprite-unit-silver-knight.png" },
  "lava-berserker": { src: "/assets/sprite-unit-lava-berserker.png" },
  "forest-archer": { src: "/assets/sprite-unit-forest-archer.png" },
  "apprentice-mage": { src: "/assets/sprite-unit-apprentice-mage.png" },
  "shadow-rogue": { src: "/assets/sprite-unit-shadow-rogue.png" },
  "void-sorcerer": { src: "/assets/sprite-unit-void-sorcerer.png" },
  "dark-vanguard": { src: "/assets/sprite-unit-dark-vanguard.png" },
  "stone-berserker": { src: "/assets/sprite-unit-stone-berserker.png" },
  "ranger-scout": { src: "/assets/unit-sprite-ranger-scout.png" },
  "unstable-unicorn-1": {
    src: "/assets/unit-sprite-unstable-unicorn-1.png",
  },
  "unstable-unicorn-2": {
    src: "/assets/sprite-unit-unstable-unicorn-2.png",
  },
};

const DEDICATED_FORTRESS_SKINS: Readonly<
  Record<string, DedicatedCosmeticSprite>
> = {
  "ice-fortress": { src: "/assets/sprite-castle-ice-fortress.png" },
  "lava-citadel": { src: "/assets/sprite-castle-lava-citadel.png" },
  "forest-keep": { src: "/assets/sprite-castle-forest-citadel.png" },
  "void-castle": { src: "/assets/sprite-castle-void-castle.png" },
  "frosthold-bastion": { src: "/assets/sprite-castle-frost-bastion.png" },
  "molten-stronghold": {
    src: "/assets/sprite-castle-molten-stronghold.png",
  },
  "desert-fortress": { src: "/assets/sprite-castle-Desert-Fortress.png" },
  "crystal-citadel": { src: "/assets/sprite-castle-Crystal-Citadel.png" },
  "cyber-fortress": { src: "/assets/sprite-fortress-Cyber-Fortress.png" },
  "swamp-keep": { src: "/assets/sprite-fortress-Swamp-Keep.png" },
  "mechanical-drill-fortress": {
    src: "/assets/sprite-fortress-Mechanical-Drill-Fortress.png",
  },
  "ancient-mire-temple": {
    src: "/assets/sprite-fortress-Ancient-Mire-Temple.png",
  },
  "unstable-unicorn-1": {
    src: "/assets/sprite-castle-unstable-unicorn-1.png",
  },
  "unstable-unicorn-2": {
    src: "/assets/sprite-castle-unstable-unicorn-2.png",
  },
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

  const dedicatedStyle = getDedicatedSpriteStyle(slot, variant);

  if (dedicatedStyle) {
    return dedicatedStyle;
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

function getDedicatedSprite(
  slot: CosmeticSpriteSlot,
  variant: string
): DedicatedCosmeticSprite | null {
  const sprites =
    slot === "FORTRESS" ? DEDICATED_FORTRESS_SKINS : DEDICATED_UNIT_SKINS;

  return sprites[variant] ?? null;
}

function getDedicatedSpriteStyle(
  slot: CosmeticSpriteSlot,
  variant: string
): CosmeticSpriteStyle | null {
  const sprite = getDedicatedSprite(slot, variant);

  if (!sprite) {
    return null;
  }

  return {
    backgroundImage: `url("${sprite.src}")`,
    backgroundSize: "contain",
    backgroundPosition: "center",
  };
}

export function getDefaultRaceCosmeticVariant({
  slot,
  race,
  seed,
}: {
  slot: CosmeticSpriteSlot;
  race: FortressRace | null | undefined;
  seed: string;
}): string | null {
  if (race !== "UNSTABLE_UNICORNS") {
    return null;
  }

  return hashString(`${slot}:${seed}`) % 2 === 0
    ? "unstable-unicorn-1"
    : "unstable-unicorn-2";
}

export function getDedicatedCosmeticSpriteAssetGaps() {
  const fortressMissing = ARCADE_FORTRESS_LOOT_BOX_SKINS_SET_1.filter(
    (skin) => !getDedicatedSprite("FORTRESS", skin.variant)
  ).map((skin) => skin.variant);
  const unitMissing = ARCADE_UNIT_LOOT_BOX_SKINS_LEGACY.filter(
    (skin) => !getDedicatedSprite("UNIT", skin.variant)
  ).map((skin) => skin.variant);

  return {
    fortressMissing,
    unitMissing,
    extraDedicatedAssets: ["sprite-unit-lich.png"],
  };
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
