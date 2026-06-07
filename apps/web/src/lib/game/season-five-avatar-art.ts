export type SeasonFiveAvatarLayerSlot = "body" | "outfit" | "hat" | "rod";
export type SeasonFiveAvatarBodyFamily = "monk" | "warrior" | "wizard" | "rogue";
export type SeasonFiveAvatarRig = SeasonFiveAvatarBodyFamily;
export type SeasonFiveAvatarPose = "idle";
export type SeasonFiveAvatarFacing = "front";
export type SeasonFiveAvatarFrame = 0;
export type SeasonFiveAvatarBodyPart =
  | "legs"
  | "torso"
  | "head"
  | "leftHand"
  | "rightHand";
type SeasonFiveAvatarFittedLayerSlot = Exclude<SeasonFiveAvatarLayerSlot, "body">;

export type SeasonFiveAvatarLoadout = {
  body: string;
  outfit: string;
  hat: string | null;
  rod: string;
  pose?: SeasonFiveAvatarPose;
  facing?: SeasonFiveAvatarFacing;
  frame?: SeasonFiveAvatarFrame;
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
  rig: SeasonFiveAvatarRig;
  pose: SeasonFiveAvatarPose;
  facing: SeasonFiveAvatarFacing;
  frame: SeasonFiveAvatarFrame;
  sourceSlot: "base" | SeasonFiveAvatarLayerSlot;
  sourceKey: string;
};

export type SeasonFiveAvatarItemPartDeclaration = {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string;
  rigs: readonly SeasonFiveAvatarRig[];
  parts: readonly SeasonFiveAvatarBodyPart[];
};

export const SEASON_FIVE_AVATAR_ASSET_ROOT = "/assets/season-5/avatar";

export const SEASON_FIVE_AVATAR_BODY_FAMILIES = [
  "monk",
  "warrior",
  "wizard",
  "rogue",
] as const satisfies readonly SeasonFiveAvatarBodyFamily[];

export const SEASON_FIVE_AVATAR_BODY_PARTS = [
  "legs",
  "torso",
  "head",
  "leftHand",
  "rightHand",
] as const satisfies readonly SeasonFiveAvatarBodyPart[];

export const SEASON_FIVE_AVATAR_BODY_PART_FILE_BY_PART = {
  legs: "legs",
  torso: "torso",
  head: "head",
  leftHand: "left-hand",
  rightHand: "right-hand",
} as const satisfies Record<SeasonFiveAvatarBodyPart, string>;

export const SEASON_FIVE_AVATAR_LAYER_KEYS = {
  body: [
    "monk",
    "warrior",
    "wizard",
    "rogue",
    "monk-barrel",
    "warrior-ironback",
    "wizard-noodle",
    "rogue-shadow",
  ],
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

export const SEASON_FIVE_AVATAR_BODY_FAMILY_BY_KEY: Record<
  string,
  SeasonFiveAvatarBodyFamily
> = {
  monk: "monk",
  "monk-barrel": "monk",
  warrior: "warrior",
  "warrior-ironback": "warrior",
  wizard: "wizard",
  "wizard-noodle": "wizard",
  rogue: "rogue",
  "rogue-shadow": "rogue",
};

export const SEASON_FIVE_AVATAR_ITEM_PARTS = [
  {
    slot: "body",
    visualKey: "monk-barrel",
    rigs: ["monk"],
    parts: SEASON_FIVE_AVATAR_BODY_PARTS,
  },
  {
    slot: "body",
    visualKey: "warrior-ironback",
    rigs: ["warrior"],
    parts: SEASON_FIVE_AVATAR_BODY_PARTS,
  },
  {
    slot: "body",
    visualKey: "wizard-noodle",
    rigs: ["wizard"],
    parts: SEASON_FIVE_AVATAR_BODY_PARTS,
  },
  {
    slot: "body",
    visualKey: "rogue-shadow",
    rigs: ["rogue"],
    parts: SEASON_FIVE_AVATAR_BODY_PARTS,
  },
  {
    slot: "outfit",
    visualKey: "pants",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["legs"],
  },
  {
    slot: "outfit",
    visualKey: "waders",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["torso", "legs"],
  },
  {
    slot: "outfit",
    visualKey: "raincoat",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["torso", "legs", "leftHand", "rightHand"],
  },
  {
    slot: "hat",
    visualKey: "cap",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["head"],
  },
  {
    slot: "hat",
    visualKey: "bucket",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["head"],
  },
  {
    slot: "hat",
    visualKey: "pointy",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["head"],
  },
  {
    slot: "rod",
    visualKey: "splintered",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["rightHand"],
  },
  {
    slot: "rod",
    visualKey: "cane",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["rightHand"],
  },
  {
    slot: "rod",
    visualKey: "bamboo",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["rightHand"],
  },
  {
    slot: "rod",
    visualKey: "obsidian",
    rigs: SEASON_FIVE_AVATAR_BODY_FAMILIES,
    parts: ["rightHand"],
  },
] as const satisfies readonly SeasonFiveAvatarItemPartDeclaration[];

const SEASON_FIVE_AVATAR_FITTED_LAYER_KEYS = {
  outfit: ["pants", "waders", "raincoat"],
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

export function getSeasonFiveAvatarRig(bodyKey: string | null | undefined) {
  return SEASON_FIVE_AVATAR_BODY_FAMILIES.find((family) => family === bodyKey);
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

export function getSeasonFiveAvatarBodyPartFit({
  bodyKey,
  rig,
  part,
  pose = "idle",
  facing = "front",
  frame = 0,
}: {
  bodyKey?: string | null;
  rig?: SeasonFiveAvatarRig | null;
  part: SeasonFiveAvatarBodyPart;
  pose?: SeasonFiveAvatarPose;
  facing?: SeasonFiveAvatarFacing;
  frame?: SeasonFiveAvatarFrame;
}): SeasonFiveAvatarBodyPartFit | undefined {
  const resolvedRig = rig ?? getSeasonFiveAvatarRig(bodyKey);
  if (!resolvedRig) return undefined;

  const partFile = SEASON_FIVE_AVATAR_BODY_PART_FILE_BY_PART[part];
  const assetKey = `${resolvedRig}/${pose}/${facing}/${frame}/${partFile}`;

  return {
    assetKey,
    assetPath: `${SEASON_FIVE_AVATAR_ASSET_ROOT}/characters/${assetKey}.png`,
    xPercent: 0,
    yPercent: 0,
    scale: 1,
    part,
    rig: resolvedRig,
    pose,
    facing,
    frame,
    sourceSlot: "base",
    sourceKey: resolvedRig,
  };
}

export function getSeasonFiveAvatarItemPartDeclaration({
  slot,
  visualKey,
  rig,
}: {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string | null | undefined;
  rig: SeasonFiveAvatarRig;
}) {
  if (!visualKey) return undefined;
  return SEASON_FIVE_AVATAR_ITEM_PARTS.find(
    (declaration) =>
      declaration.slot === slot &&
      declaration.visualKey === visualKey &&
      (declaration.rigs as readonly SeasonFiveAvatarRig[]).includes(rig)
  );
}

export function getSeasonFiveAvatarItemPartFit({
  slot,
  visualKey,
  rig,
  part,
  pose = "idle",
  facing = "front",
  frame = 0,
}: {
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string | null | undefined;
  rig: SeasonFiveAvatarRig;
  part: SeasonFiveAvatarBodyPart;
  pose?: SeasonFiveAvatarPose;
  facing?: SeasonFiveAvatarFacing;
  frame?: SeasonFiveAvatarFrame;
}): SeasonFiveAvatarBodyPartFit | undefined {
  const declaration = getSeasonFiveAvatarItemPartDeclaration({
    slot,
    visualKey,
    rig,
  });
  if (
    !(declaration?.parts as readonly SeasonFiveAvatarBodyPart[] | undefined)?.includes(
      part
    ) ||
    !visualKey
  ) {
    return undefined;
  }

  const partFile = SEASON_FIVE_AVATAR_BODY_PART_FILE_BY_PART[part];
  const assetKey = `${slot}/${visualKey}/${rig}/${pose}/${facing}/${frame}/${partFile}`;

  return {
    assetKey,
    assetPath: `${SEASON_FIVE_AVATAR_ASSET_ROOT}/items/${assetKey}.png`,
    xPercent: 0,
    yPercent: 0,
    scale: 1,
    part,
    rig,
    pose,
    facing,
    frame,
    sourceSlot: slot,
    sourceKey: visualKey,
  };
}

function applySeasonFiveAvatarItemPartFits({
  partFits,
  slot,
  visualKey,
  rig,
  pose,
  facing,
  frame,
}: {
  partFits: Map<SeasonFiveAvatarBodyPart, SeasonFiveAvatarBodyPartFit>;
  slot: SeasonFiveAvatarLayerSlot;
  visualKey: string | null | undefined;
  rig: SeasonFiveAvatarRig;
  pose: SeasonFiveAvatarPose;
  facing: SeasonFiveAvatarFacing;
  frame: SeasonFiveAvatarFrame;
}) {
  for (const part of SEASON_FIVE_AVATAR_BODY_PARTS) {
    const fit = getSeasonFiveAvatarItemPartFit({
      slot,
      visualKey,
      rig,
      part,
      pose,
      facing,
      frame,
    });
    if (fit) {
      partFits.set(part, fit);
    }
  }
}

export function getSeasonFiveAvatarBodyPartFits({
  bodyKey,
  outfitKey,
  hatKey,
  rodKey,
  rig,
  pose = "idle",
  facing = "front",
  frame = 0,
}: {
  bodyKey?: string | null;
  outfitKey?: string | null;
  hatKey?: string | null;
  rodKey?: string | null;
  rig?: SeasonFiveAvatarRig | null;
  pose?: SeasonFiveAvatarPose;
  facing?: SeasonFiveAvatarFacing;
  frame?: SeasonFiveAvatarFrame;
}) {
  const resolvedRig = rig ?? getSeasonFiveAvatarBodyFamily(bodyKey);
  if (!resolvedRig) return [];

  const partFits = new Map<SeasonFiveAvatarBodyPart, SeasonFiveAvatarBodyPartFit>();
  for (const part of SEASON_FIVE_AVATAR_BODY_PARTS) {
    const fit = getSeasonFiveAvatarBodyPartFit({
      rig: resolvedRig,
      part,
      pose,
      facing,
      frame,
    });
    if (fit) {
      partFits.set(part, fit);
    }
  }

  if (!getSeasonFiveAvatarRig(bodyKey)) {
    applySeasonFiveAvatarItemPartFits({
      partFits,
      slot: "body",
      visualKey: bodyKey,
      rig: resolvedRig,
      pose,
      facing,
      frame,
    });
  }
  applySeasonFiveAvatarItemPartFits({
    partFits,
    slot: "outfit",
    visualKey: outfitKey,
    rig: resolvedRig,
    pose,
    facing,
    frame,
  });
  applySeasonFiveAvatarItemPartFits({
    partFits,
    slot: "hat",
    visualKey: hatKey,
    rig: resolvedRig,
    pose,
    facing,
    frame,
  });
  applySeasonFiveAvatarItemPartFits({
    partFits,
    slot: "rod",
    visualKey: rodKey,
    rig: resolvedRig,
    pose,
    facing,
    frame,
  });

  return SEASON_FIVE_AVATAR_BODY_PARTS.map((part) => partFits.get(part)).filter(
    (fit): fit is SeasonFiveAvatarBodyPartFit => Boolean(fit)
  );
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
    bodyParts: getSeasonFiveAvatarBodyPartFits({
      bodyKey: loadout.body,
      outfitKey: loadout.outfit,
      hatKey: loadout.hat,
      rodKey: loadout.rod,
      pose: loadout.pose,
      facing: loadout.facing,
      frame: loadout.frame,
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
  };
}
