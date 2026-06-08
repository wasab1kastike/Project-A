export type SeasonFiveAvatarLayerSlot = "body" | "outfit" | "hat" | "rod";
export type SeasonFiveAvatarBodyFamily =
  | "monk"
  | "warrior"
  | "wizard"
  | "rogue";
type SeasonFiveAvatarFittedLayerSlot = Extract<
  SeasonFiveAvatarLayerSlot,
  "hat" | "rod"
>;

export type SeasonFiveAvatarLoadout = {
  body: string;
  outfit: string;
  hat: string | null;
  rod: string;
};

export const SEASON_FIVE_AVATAR_FRAME_SCALES = {
  default: 1,
  map: 0.86,
  preview: 0.9,
} as const;

export type SeasonFiveAvatarFrame =
  keyof typeof SEASON_FIVE_AVATAR_FRAME_SCALES;

export type SeasonFiveAvatarLayerFit = {
  assetKey: string;
  assetPath: string;
  xPercent: number;
  yPercent: number;
  scale: number;
};

export type SeasonFiveAvatarBaseFit = SeasonFiveAvatarLayerFit & {
  bodyFamily: SeasonFiveAvatarBodyFamily;
  outfitKey: string;
  sourceSlot: "body" | "outfit";
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
  outfit: ["pants", "waders", "raincoat", "greatcoat"],
  hat: ["cap", "bucket", "pointy"],
  rod: ["splintered", "cane", "bamboo", "obsidian"],
} as const satisfies Record<SeasonFiveAvatarLayerSlot, readonly string[]>;

export const SEASON_FIVE_GEAR_SLOT_TO_AVATAR_LAYER = {
  BODY: "body",
  OUTFIT: "outfit",
  HAT: "hat",
  ROD: "rod",
} as const satisfies Record<string, SeasonFiveAvatarLayerSlot>;

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
  hat: ["cap", "bucket", "pointy"],
  rod: ["splintered", "cane", "bamboo", "obsidian"],
} as const satisfies Record<SeasonFiveAvatarFittedLayerSlot, readonly string[]>;

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
  const fittedKeys: readonly string[] | undefined =
    SEASON_FIVE_AVATAR_FITTED_LAYER_KEYS[
      slot as SeasonFiveAvatarFittedLayerSlot
    ];
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

export function getSeasonFiveAvatarBaseFit(
  loadout: SeasonFiveAvatarLoadout
): SeasonFiveAvatarBaseFit | undefined {
  const bodyFamily = getSeasonFiveAvatarBodyFamily(loadout.body);
  if (!bodyFamily) return undefined;

  const outfitKey = isSeasonFiveAvatarLayerKey("outfit", loadout.outfit)
    ? loadout.outfit
    : "pants";
  const usesDefaultBody = outfitKey === "pants";

  return {
    bodyFamily,
    outfitKey,
    sourceSlot: usesDefaultBody ? "body" : "outfit",
    assetKey: usesDefaultBody ? bodyFamily : `${bodyFamily}.${outfitKey}`,
    assetPath: usesDefaultBody
      ? `${SEASON_FIVE_AVATAR_ASSET_ROOT}/body/${bodyFamily}.png`
      : `${SEASON_FIVE_AVATAR_ASSET_ROOT}/base/${bodyFamily}/${outfitKey}.png`,
    xPercent: 0,
    yPercent: 0,
    scale: 1,
  };
}

export function getSeasonFiveAvatarLayers(loadout: SeasonFiveAvatarLoadout) {
  return {
    base: getSeasonFiveAvatarBaseFit(loadout),
    rod: getSeasonFiveAvatarLayerFit({
      slot: "rod",
      visualKey: loadout.rod,
      bodyKey: loadout.body,
    }),
    hat: getSeasonFiveAvatarLayerFit({
      slot: "hat",
      visualKey: loadout.hat,
      bodyKey: loadout.body,
    }),
  };
}
