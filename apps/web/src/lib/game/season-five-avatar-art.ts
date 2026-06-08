export type SeasonFiveAvatarLayerSlot = "body" | "outfit" | "hat" | "rod";
export type SeasonFiveAvatarBodyFamily =
  | "monk"
  | "warrior"
  | "wizard"
  | "rogue";
type SeasonFiveAvatarFittedLayerSlot = Exclude<
  SeasonFiveAvatarLayerSlot,
  "body"
>;
export type SeasonFiveAvatarBodyPart =
  | "legs"
  | "torso"
  | "head"
  | "leftHand"
  | "rightHand";

export type SeasonFiveAvatarLoadout = {
  body: string;
  outfit: string;
  hat: string | null;
  rod: string;
};

export type SeasonFiveAvatarLayerFit = {
  assetKey: string;
  assetPath: string;
  xPercent: number;
  yPercent: number;
  scale: number;
};

export type SeasonFiveAvatarBodyPartFit = SeasonFiveAvatarLayerFit & {
  part: SeasonFiveAvatarBodyPart;
  sourceSlot: SeasonFiveAvatarLayerSlot;
  visualKey: string;
};

export const SEASON_FIVE_AVATAR_ASSET_ROOT = "/assets/season-5/avatar";

export const SEASON_FIVE_AVATAR_BODY_FAMILIES = [
  "monk",
  "warrior",
  "wizard",
  "rogue",
] as const satisfies readonly SeasonFiveAvatarBodyFamily[];

export const SEASON_FIVE_AVATAR_LAYER_KEYS = {
  body: ["monk", "warrior", "wizard", "rogue"],
  outfit: ["pants", "waders", "raincoat"],
  hat: ["cap", "bucket", "pointy"],
  rod: ["splintered", "cane", "bamboo", "obsidian"],
} as const satisfies Record<SeasonFiveAvatarLayerSlot, readonly string[]>;

export const SEASON_FIVE_GEAR_SLOT_TO_AVATAR_LAYER = {
  BODY: "body",
  OUTFIT: "outfit",
  HAT: "hat",
  ROD: "rod",
} as const satisfies Record<string, SeasonFiveAvatarLayerSlot>;

export const SEASON_FIVE_AVATAR_BODY_PARTS = [
  "legs",
  "torso",
  "leftHand",
  "rightHand",
  "head",
] as const satisfies readonly SeasonFiveAvatarBodyPart[];

export const SEASON_FIVE_AVATAR_BODY_PART_FILE_BY_PART = {
  legs: "legs",
  torso: "torso",
  head: "head",
  leftHand: "left-hand",
  rightHand: "right-hand",
} as const satisfies Record<SeasonFiveAvatarBodyPart, string>;

export const SEASON_FIVE_AVATAR_BODY_FAMILY_BY_KEY: Record<
  string,
  SeasonFiveAvatarBodyFamily
> = {
  monk: "monk",
  warrior: "warrior",
  wizard: "wizard",
  rogue: "rogue",
};

const SEASON_FIVE_AVATAR_FITTED_LAYER_KEYS = {
  outfit: ["pants", "waders", "raincoat"],
  hat: ["cap", "bucket", "pointy"],
  rod: ["splintered", "cane", "bamboo", "obsidian"],
} as const satisfies Record<SeasonFiveAvatarFittedLayerSlot, readonly string[]>;

const SEASON_FIVE_WARRIOR_MODULAR_ROD_KEYS = [
  "splintered",
  "cane",
  "obsidian",
] as const;

const SEASON_FIVE_WARRIOR_ITEM_PARTS = {
  outfit: {
    pants: ["legs"],
    waders: ["legs", "torso"],
    raincoat: ["legs", "torso", "leftHand", "rightHand"],
  },
  hat: {
    cap: ["head"],
    bucket: ["head"],
    pointy: ["head"],
  },
  rod: {
    splintered: ["rightHand"],
    cane: ["rightHand"],
    obsidian: ["rightHand"],
  },
} as const satisfies Partial<
  Record<
    SeasonFiveAvatarLayerSlot,
    Partial<Record<string, readonly SeasonFiveAvatarBodyPart[]>>
  >
>;

type LayerFitOverride = {
  assetKey?: string;
  xPercent?: number;
  yPercent?: number;
  scale?: number;
};

const SEASON_FIVE_AVATAR_LAYER_FITS: Partial<
  Record<
    SeasonFiveAvatarLayerSlot,
    Record<
      string,
      Partial<Record<SeasonFiveAvatarBodyFamily, LayerFitOverride>>
    >
  >
> = {};

function getWarriorItemParts(
  slot: SeasonFiveAvatarLayerSlot,
  visualKey: string
): readonly SeasonFiveAvatarBodyPart[] {
  const itemPartsBySlot =
    SEASON_FIVE_WARRIOR_ITEM_PARTS[
      slot as keyof typeof SEASON_FIVE_WARRIOR_ITEM_PARTS
    ];
  return itemPartsBySlot?.[visualKey as keyof typeof itemPartsBySlot] ?? [];
}

export function getSeasonFiveAvatarBodyFamily(
  bodyKey: string | null | undefined
) {
  if (!bodyKey) return undefined;
  return SEASON_FIVE_AVATAR_BODY_FAMILY_BY_KEY[bodyKey];
}

export function isSeasonFiveAvatarLayerKey(
  slot: SeasonFiveAvatarLayerSlot,
  visualKey: string | null | undefined
) {
  const layerKeys: readonly string[] = SEASON_FIVE_AVATAR_LAYER_KEYS[slot];
  return Boolean(visualKey && layerKeys.includes(visualKey));
}

function usesFamilyVariant(slot: SeasonFiveAvatarLayerSlot, visualKey: string) {
  if (slot === "body") return false;

  const fittedKeys: readonly string[] | undefined =
    SEASON_FIVE_AVATAR_FITTED_LAYER_KEYS[slot];
  return Boolean(fittedKeys?.includes(visualKey));
}

export function getSeasonFiveAvatarLayerFit({
  slot,
  visualKey,
  bodyKey,
}: {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string | null | undefined;
  bodyKey?: string | null;
}): SeasonFiveAvatarLayerFit | undefined {
  if (!isSeasonFiveAvatarLayerKey(slot, visualKey) || !visualKey) {
    return undefined;
  }

  const bodyFamily = getSeasonFiveAvatarBodyFamily(bodyKey);
  const override = bodyFamily
    ? SEASON_FIVE_AVATAR_LAYER_FITS[slot]?.[visualKey]?.[bodyFamily]
    : undefined;
  const assetKey =
    override?.assetKey ??
    (bodyFamily && usesFamilyVariant(slot, visualKey)
      ? `${visualKey}.${bodyFamily}`
      : visualKey);

  return {
    assetKey,
    assetPath: `${SEASON_FIVE_AVATAR_ASSET_ROOT}/${slot}/${assetKey}.png`,
    xPercent: override?.xPercent ?? 0,
    yPercent: override?.yPercent ?? 0,
    scale: override?.scale ?? 1,
  };
}

export function getSeasonFiveAvatarLayerPath(args: {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string | null | undefined;
  bodyKey?: string | null;
}) {
  return getSeasonFiveAvatarLayerFit(args)?.assetPath;
}

function getSeasonFiveAvatarBodyPartAssetPath(
  bodyFamily: SeasonFiveAvatarBodyFamily,
  part: SeasonFiveAvatarBodyPart
) {
  return `${SEASON_FIVE_AVATAR_ASSET_ROOT}/characters/${bodyFamily}/idle/front/0/${SEASON_FIVE_AVATAR_BODY_PART_FILE_BY_PART[part]}.png`;
}

function getSeasonFiveAvatarItemPartAssetPath({
  slot,
  visualKey,
  bodyFamily,
  part,
}: {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string;
  bodyFamily: SeasonFiveAvatarBodyFamily;
  part: SeasonFiveAvatarBodyPart;
}) {
  return `${SEASON_FIVE_AVATAR_ASSET_ROOT}/items/${slot}/${visualKey}/${bodyFamily}/idle/front/0/${SEASON_FIVE_AVATAR_BODY_PART_FILE_BY_PART[part]}.png`;
}

export function getSeasonFiveAvatarBodyPartFit({
  bodyKey,
  part,
}: {
  bodyKey: string | null | undefined;
  part: SeasonFiveAvatarBodyPart;
}): SeasonFiveAvatarBodyPartFit | undefined {
  const bodyFamily = getSeasonFiveAvatarBodyFamily(bodyKey);
  if (bodyFamily !== "warrior") return undefined;

  return {
    part,
    sourceSlot: "body",
    visualKey: bodyKey ?? bodyFamily,
    assetKey: `${bodyFamily}.${part}`,
    assetPath: getSeasonFiveAvatarBodyPartAssetPath(bodyFamily, part),
    xPercent: 0,
    yPercent: 0,
    scale: 1,
  };
}

export function getSeasonFiveAvatarItemPartFit({
  slot,
  visualKey,
  bodyKey,
  part,
}: {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string | null | undefined;
  bodyKey: string | null | undefined;
  part: SeasonFiveAvatarBodyPart;
}): SeasonFiveAvatarBodyPartFit | undefined {
  if (!visualKey) return undefined;

  const bodyFamily = getSeasonFiveAvatarBodyFamily(bodyKey);
  if (bodyFamily !== "warrior") return undefined;

  const itemParts = getWarriorItemParts(slot, visualKey);
  if (!itemParts.includes(part)) return undefined;

  return {
    part,
    sourceSlot: slot,
    visualKey,
    assetKey: `${slot}.${visualKey}.${bodyFamily}.${part}`,
    assetPath: getSeasonFiveAvatarItemPartAssetPath({
      slot,
      visualKey,
      bodyFamily,
      part,
    }),
    xPercent: 0,
    yPercent: 0,
    scale: 1,
  };
}

export function getSeasonFiveAvatarBodyPartFits(
  loadout: SeasonFiveAvatarLoadout
): SeasonFiveAvatarBodyPartFit[] {
  if (getSeasonFiveAvatarBodyFamily(loadout.body) !== "warrior") return [];
  if (
    !SEASON_FIVE_WARRIOR_MODULAR_ROD_KEYS.includes(
      loadout.rod as (typeof SEASON_FIVE_WARRIOR_MODULAR_ROD_KEYS)[number]
    )
  ) {
    return [];
  }

  const partFits = new Map<
    SeasonFiveAvatarBodyPart,
    SeasonFiveAvatarBodyPartFit
  >();
  for (const part of SEASON_FIVE_AVATAR_BODY_PARTS) {
    const fit = getSeasonFiveAvatarBodyPartFit({
      bodyKey: loadout.body,
      part,
    });
    if (fit) partFits.set(part, fit);
  }

  for (const part of SEASON_FIVE_AVATAR_BODY_PARTS) {
    const outfitFit = getSeasonFiveAvatarItemPartFit({
      slot: "outfit",
      visualKey: loadout.outfit,
      bodyKey: loadout.body,
      part,
    });
    if (outfitFit) partFits.set(part, outfitFit);

    if (loadout.hat) {
      const hatFit = getSeasonFiveAvatarItemPartFit({
        slot: "hat",
        visualKey: loadout.hat,
        bodyKey: loadout.body,
        part,
      });
      if (hatFit) partFits.set(part, hatFit);
    }

    const rodFit = getSeasonFiveAvatarItemPartFit({
      slot: "rod",
      visualKey: loadout.rod,
      bodyKey: loadout.body,
      part,
    });
    if (rodFit) partFits.set(part, rodFit);
  }

  const orderedFits = SEASON_FIVE_AVATAR_BODY_PARTS.map((part) =>
    partFits.get(part)
  );
  return orderedFits.every(Boolean)
    ? (orderedFits as SeasonFiveAvatarBodyPartFit[])
    : [];
}

export function getSeasonFiveAvatarLayers(loadout: SeasonFiveAvatarLoadout) {
  return {
    rod: getSeasonFiveAvatarLayerFit({
      slot: "rod",
      visualKey: loadout.rod,
      bodyKey: loadout.body,
    }),
    body: getSeasonFiveAvatarLayerFit({
      slot: "body",
      visualKey: loadout.body,
    }),
    outfit: getSeasonFiveAvatarLayerFit({
      slot: "outfit",
      visualKey: loadout.outfit,
      bodyKey: loadout.body,
    }),
    hat: getSeasonFiveAvatarLayerFit({
      slot: "hat",
      visualKey: loadout.hat,
      bodyKey: loadout.body,
    }),
    bodyParts: getSeasonFiveAvatarBodyPartFits(loadout),
  };
}
