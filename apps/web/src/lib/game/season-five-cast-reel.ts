import {
  SeasonFiveCharacterClass,
} from "@/lib/prisma-client";
import { createSeasonFiveCatch } from "./season-five-balance";
import type { SeasonFivePlannedCatch } from "./season-five-fishing";

export type SeasonFiveCastReelStats = Record<
  "stronk" | "luk" | "smell" | "magik" | "quietness",
  number
>;

export type SeasonFiveCastReelEffects = {
  catchBonus: number;
  rarityBonus: number;
  sizeBonusPercent: number;
  inventoryPressureReduction: number;
};

export type SeasonFiveCastReelTag =
  | "Hook+"
  | "Fight+"
  | "Haul+"
  | "Jackpot"
  | "Safe"
  | "Weird";

export type SeasonFiveCastReelPhaseKey = "hook" | "fight" | "haul";

export type SeasonFiveCastReelPhase = {
  key: SeasonFiveCastReelPhaseKey;
  label: string;
  score: number;
  grade: "cold" | "thin" | "live" | "hot" | "jackpot";
  description: string;
};

export type SeasonFiveCastReelPreview = {
  title: string;
  subtitle: string;
  riskLabel: string;
  jackpotLabel: string;
  classTwist: {
    label: string;
    description: string;
  };
  baitTags: SeasonFiveCastReelTag[];
  phases: SeasonFiveCastReelPhase[];
};

export type SeasonFiveCastReelCatch = SeasonFivePlannedCatch & {
  castReel: {
    outcome: "primary" | "bonus";
    jackpot: boolean;
    safetyNet: boolean;
    phases: SeasonFiveCastReelPhase[];
  };
};

export type SeasonFiveCastReelRound = {
  catches: SeasonFiveCastReelCatch[];
  missed: boolean;
  jackpot: boolean;
  safetyNet: boolean;
  preview: SeasonFiveCastReelPreview;
};

type SeasonFiveCastReelInput = {
  seed: string;
  characterClass: SeasonFiveCharacterClass;
  stats: SeasonFiveCastReelStats;
  effects: SeasonFiveCastReelEffects;
  activeBaitKey?: string | null;
  activeBaitName?: string | null;
  rhythmStage: number;
  minWeightGrams: number;
  maxWeightGrams: number;
  difficulty: number;
  inventoryPressure: number;
  profileKey?: string | null;
};

const PHASE_LABELS = {
  hook: "Hook",
  fight: "Fight",
  haul: "Haul",
} satisfies Record<SeasonFiveCastReelPhaseKey, string>;

const PHASE_COPY = {
  hook: "Bite tempo and miss protection.",
  fight: "Rarity, mutations, and weird-water pressure.",
  haul: "Weight, pack pressure, and trophy payoff.",
} satisfies Record<SeasonFiveCastReelPhaseKey, string>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rollPercent(seed: string, salt: string) {
  return hashString(`${seed}:${salt}`) % 100;
}

function getGrade(score: number): SeasonFiveCastReelPhase["grade"] {
  if (score >= 88) return "jackpot";
  if (score >= 72) return "hot";
  if (score >= 52) return "live";
  if (score >= 34) return "thin";
  return "cold";
}

function getClassModifiers(characterClass: SeasonFiveCharacterClass) {
  switch (characterClass) {
    case SeasonFiveCharacterClass.DRUNKEN_MONK:
      return { hook: 7, fight: 0, haul: 0, bonusNibble: 8 };
    case SeasonFiveCharacterClass.RETIRED_WARRIOR:
      return { hook: 0, fight: 0, haul: 12, bonusNibble: 0 };
    case SeasonFiveCharacterClass.DEMENTED_WIZARD:
      return { hook: -2, fight: 12, haul: 0, bonusNibble: 0 };
    case SeasonFiveCharacterClass.BURNT_OUT_ROGUE:
      return { hook: 6, fight: 2, haul: 5, bonusNibble: 0 };
  }
}

function getProfileModifiers(profileKey?: string | null) {
  switch (profileKey) {
    case "deep":
      return { hook: -5, fight: 7, haul: 4 };
    case "lava_lake":
      return { hook: -9, fight: 9, haul: 7 };
    case "void_lake":
      return { hook: -10, fight: 12, haul: -2 };
    case "coast":
      return { hook: 4, fight: 0, haul: -1 };
    case "lake":
    default:
      return { hook: 0, fight: 0, haul: 0 };
  }
}

export function getSeasonFiveCastReelClassTwist(
  characterClass: SeasonFiveCharacterClass
) {
  switch (characterClass) {
    case SeasonFiveCharacterClass.DRUNKEN_MONK:
      return {
        label: "Rhythm Nibbles",
        description: "Long sessions turn rhythm into hook heat and bonus bites.",
      };
    case SeasonFiveCharacterClass.RETIRED_WARRIOR:
      return {
        label: "Campaign Haul",
        description: "Harder waters lean into heavier trophies and cleaner hauls.",
      };
    case SeasonFiveCharacterClass.DEMENTED_WIZARD:
      return {
        label: "Weird Fight",
        description: "Magik pushes rarity and strange-water mutations upward.",
      };
    case SeasonFiveCharacterClass.BURNT_OUT_ROGUE:
      return {
        label: "Quiet Skim",
        description: "Quiet casts turn some bad hooks into small safe catches.",
      };
  }
}

export function getSeasonFiveBaitCastReelTags(input: {
  key?: string | null;
  effects?: Partial<SeasonFiveCastReelEffects>;
}): SeasonFiveCastReelTag[] {
  const tags = new Set<SeasonFiveCastReelTag>();
  const key = input.key ?? "bare-hook";
  const effects = input.effects ?? {};

  if (key === "bare-hook") tags.add("Safe");
  if (key.includes("breadcrumb")) {
    tags.add("Hook+");
    tags.add("Safe");
  }
  if (key.includes("worm")) {
    tags.add("Fight+");
    tags.add("Weird");
  }
  if (key.includes("grub")) {
    tags.add("Hook+");
    tags.add("Haul+");
    tags.add("Jackpot");
  }
  if ((effects.catchBonus ?? 0) > 0) tags.add("Hook+");
  if ((effects.rarityBonus ?? 0) > 0) tags.add("Fight+");
  if ((effects.sizeBonusPercent ?? 0) > 0) tags.add("Haul+");

  return Array.from(tags);
}

function getBaitModifiers(tags: readonly SeasonFiveCastReelTag[]) {
  return {
    hook:
      (tags.includes("Hook+") ? 7 : 0) + (tags.includes("Safe") ? 3 : 0),
    fight:
      (tags.includes("Fight+") ? 8 : 0) + (tags.includes("Weird") ? 4 : 0),
    haul:
      (tags.includes("Haul+") ? 8 : 0) + (tags.includes("Jackpot") ? 3 : 0),
    jackpot: tags.includes("Jackpot") ? 5 : 0,
  };
}

function getPhaseBaseScores(input: SeasonFiveCastReelInput) {
  const classModifiers = getClassModifiers(input.characterClass);
  const profileModifiers = getProfileModifiers(input.profileKey);
  const baitTags = getSeasonFiveBaitCastReelTags({
    key: input.activeBaitKey,
    effects: input.effects,
  });
  const baitModifiers = getBaitModifiers(baitTags);
  const rhythm = clamp(input.rhythmStage, 0, 3);
  const difficulty = Math.max(1, input.difficulty);
  const pressure = Math.max(
    1,
    input.inventoryPressure - input.effects.inventoryPressureReduction
  );

  return {
    baitTags,
    hook: clamp(
      Math.round(
        38 +
          input.stats.smell * 3 +
          input.effects.catchBonus * 5 +
          rhythm * 5 +
          classModifiers.hook +
          profileModifiers.hook +
          baitModifiers.hook -
          difficulty * 4
      ),
      0,
      100
    ),
    fight: clamp(
      Math.round(
        34 +
          input.stats.luk * 3 +
          input.stats.magik * 2 +
          input.effects.rarityBonus * 0.8 +
          classModifiers.fight +
          profileModifiers.fight +
          baitModifiers.fight +
          difficulty * 2
      ),
      0,
      100
    ),
    haul: clamp(
      Math.round(
        36 +
          input.stats.stronk * 3 +
          input.stats.quietness * 1.5 +
          input.effects.sizeBonusPercent * 0.3 +
          classModifiers.haul +
          profileModifiers.haul +
          baitModifiers.haul -
          pressure * 3
      ),
      0,
      100
    ),
  };
}

function createPhases(input: {
  hook: number;
  fight: number;
  haul: number;
}): SeasonFiveCastReelPhase[] {
  return (["hook", "fight", "haul"] as const).map((key) => {
    const score = input[key];
    return {
      key,
      label: PHASE_LABELS[key],
      score,
      grade: getGrade(score),
      description: PHASE_COPY[key],
    };
  });
}

export function getSeasonFiveCastReelPreview(
  input: Omit<SeasonFiveCastReelInput, "seed">
): SeasonFiveCastReelPreview {
  const scores = getPhaseBaseScores({ ...input, seed: "preview" });
  const baitTags = scores.baitTags;
  const jackpotLift =
    getBaitModifiers(baitTags).jackpot +
    Math.max(0, Math.floor((scores.fight + scores.haul - 130) / 8));

  return {
    title: "Cast Reel",
    subtitle: input.activeBaitName
      ? `${input.activeBaitName} | bait + time`
      : "Bait + time",
    riskLabel: "Safe miss: no coins or gear at risk",
    jackpotLabel:
      jackpotLift >= 8
        ? "Jackpot water"
        : jackpotLift >= 4
          ? "Jackpot sparks"
          : "Low jackpot",
    classTwist: getSeasonFiveCastReelClassTwist(input.characterClass),
    baitTags,
    phases: createPhases({
      hook: scores.hook,
      fight: scores.fight,
      haul: scores.haul,
    }),
  };
}

export function resolveSeasonFiveCastReelRound(
  input: SeasonFiveCastReelInput
): SeasonFiveCastReelRound {
  const preview = getSeasonFiveCastReelPreview(input);
  const base = getPhaseBaseScores(input);
  const classModifiers = getClassModifiers(input.characterClass);
  const baitModifiers = getBaitModifiers(base.baitTags);

  const hookScore = clamp(base.hook - 45 + rollPercent(input.seed, "hook"), 0, 120);
  const fightScore = clamp(
    base.fight - 40 + rollPercent(input.seed, "fight"),
    0,
    130
  );
  const haulScore = clamp(base.haul - 40 + rollPercent(input.seed, "haul"), 0, 130);
  const safetyNet =
    input.characterClass === SeasonFiveCharacterClass.BURNT_OUT_ROGUE &&
    hookScore >= 24 &&
    hookScore < 30;
  const missed = hookScore < 30 && !safetyNet;

  if (missed) {
    return {
      catches: [],
      missed: true,
      jackpot: false,
      safetyNet: false,
      preview,
    };
  }

  const jackpotChance = clamp(
    1 +
      Math.floor(input.stats.luk / 3) +
      Math.floor(input.stats.magik / 4) +
      baitModifiers.jackpot +
      (fightScore >= 92 ? 3 : 0) +
      (haulScore >= 92 ? 3 : 0),
    1,
    18
  );
  const jackpot =
    hookScore >= 58 && rollPercent(input.seed, "jackpot") < jackpotChance;
  const phaseScores = createPhases({
    hook: clamp(Math.round(hookScore), 0, 100),
    fight: clamp(Math.round(fightScore), 0, 100),
    haul: clamp(Math.round(haulScore), 0, 100),
  });
  const pressureReduction =
    input.effects.inventoryPressureReduction +
    Math.max(0, Math.floor((haulScore - 68) / 22)) +
    (input.characterClass === SeasonFiveCharacterClass.BURNT_OUT_ROGUE ? 1 : 0);
  const effectivePressure = Math.max(
    1,
    input.inventoryPressure - pressureReduction
  );
  const rarityBonus =
    input.effects.rarityBonus +
    Math.floor((fightScore - 50) / 3) +
    (jackpot ? 24 : 0) -
    (safetyNet ? 12 : 0);
  const sizeBonusPercent =
    input.effects.sizeBonusPercent +
    Math.floor((haulScore - 50) / 2) +
    (jackpot ? 30 : 0) -
    (safetyNet ? 10 : 0);

  const primary = {
    ...createSeasonFiveCatch({
      seed: input.seed,
      hash: hashString(`${input.seed}:cast-reel-primary`),
      minWeightGrams: input.minWeightGrams,
      maxWeightGrams: input.maxWeightGrams,
      difficulty: input.difficulty,
      sizeBonusPercent,
      rarityBonus,
      inventoryPressure: effectivePressure,
      profileKey: input.profileKey,
    }),
    castReel: {
      outcome: "primary" as const,
      jackpot,
      safetyNet,
      phases: phaseScores,
    },
  } satisfies SeasonFiveCastReelCatch;

  const bonusChance = clamp(
    classModifiers.bonusNibble +
      Math.floor(input.stats.smell / 3) +
      input.rhythmStage * 3 +
      (base.baitTags.includes("Hook+") ? 3 : 0),
    0,
    24
  );
  const bonus =
    hookScore >= 86 && rollPercent(input.seed, "bonus") < bonusChance
      ? ({
          ...createSeasonFiveCatch({
            seed: `${input.seed}:bonus`,
            hash: hashString(`${input.seed}:cast-reel-bonus`),
            minWeightGrams: input.minWeightGrams,
            maxWeightGrams: Math.max(
              input.minWeightGrams,
              Math.round(
                input.minWeightGrams +
                  (input.maxWeightGrams - input.minWeightGrams) * 0.48
              )
            ),
            difficulty: Math.max(1, input.difficulty - 1),
            sizeBonusPercent: Math.max(0, Math.floor(sizeBonusPercent / 2)),
            rarityBonus: Math.max(0, Math.floor(rarityBonus / 2)),
            inventoryPressure: Math.max(1, effectivePressure - 1),
            profileKey: input.profileKey,
          }),
          castReel: {
            outcome: "bonus" as const,
            jackpot: false,
            safetyNet,
            phases: phaseScores,
          },
        } satisfies SeasonFiveCastReelCatch)
      : null;

  return {
    catches: bonus ? [primary, bonus] : [primary],
    missed: false,
    jackpot,
    safetyNet,
    preview,
  };
}
