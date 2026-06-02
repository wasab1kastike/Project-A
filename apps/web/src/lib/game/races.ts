export const FORTRESS_RACES = [
  "DWARFS",
  "UNSTABLE_UNICORNS",
  "SPACE_MURINES",
  "ORKS",
] as const;

export type FortressRace = (typeof FORTRESS_RACES)[number];

export type RaceModifiers = {
  populationBonus: number;
  defenseBonus: number;
  goldPerTenMiners: number;
  foodPerTenFarmers: number;
  armyPerTenRecruiters: number;
  carryCapacityPerSurvivorBonus: number;
  travelSpeedMultiplier: number;
  expansionTileCapacityMultiplier: number;
};

export type RaceDefinition = {
  key: FortressRace;
  displayName: string;
  iconPlaceholder: string;
  flavorQuote: string;
  flavorText: string;
  passiveSummary: string[];
  modifiers: RaceModifiers;
};

const NO_RACE_MODIFIERS: RaceModifiers = {
  populationBonus: 0,
  defenseBonus: 0,
  goldPerTenMiners: 0,
  foodPerTenFarmers: 0,
  armyPerTenRecruiters: 0,
  carryCapacityPerSurvivorBonus: 0,
  travelSpeedMultiplier: 1,
  expansionTileCapacityMultiplier: 1,
};

export const RACE_DEFINITIONS = [
  {
    key: "DWARFS",
    displayName: "Dwarfs",
    iconPlaceholder: "DW",
    flavorQuote: "We mine because we care.",
    flavorText:
      "Stone-minded planners who turn deep mines and stubborn walls into seasonal leverage.",
    passiveSummary: [
      "+1 gold per 10 miners",
      "+25% defense on owned tiles and Home of A",
      "50% slower unit travel",
    ],
    modifiers: {
      ...NO_RACE_MODIFIERS,
      defenseBonus: 0.1,
      goldPerTenMiners: 1,
      travelSpeedMultiplier: 0.5,
      expansionTileCapacityMultiplier: 1.25,
    },
  },
  {
    key: "UNSTABLE_UNICORNS",
    displayName: "Unstable Unicorns",
    iconPlaceholder: "UU",
    flavorQuote:
      "Everything is under control. (Everything is not under control.)",
    flavorText:
      "Illusion-heavy chaos raiders who hide force reads, move fast across the map, and gamble daily power spikes with Shattered Reality.",
    passiveSummary: [
      "+1 food per 10 farmers",
      "+2 population",
      "Enemies cannot see your army size in transit",
      "2x travel speed while race buffs are active",
      "Garrisons lose army every 2 ticks (instead of every tick)",
      "T2 Shattered Reality (daily random boon)",
    ],
    modifiers: {
      ...NO_RACE_MODIFIERS,
      populationBonus: 2,
      foodPerTenFarmers: 1,
    },
  },
  {
    key: "SPACE_MURINES",
    displayName: "Space Murines",
    iconPlaceholder: "SM",
    flavorQuote:
      "In the grim darkness of the sauna, there is only steam.",
    flavorText:
      "Disciplined orbital rodents who scale harder into war with STIM discipline, hourly instant extraction, and expanded strike capacity.",
    passiveSummary: [
      "+1 army per 10 recruiters",
      "+5% defense bonus",
      "T2 STIM, T3 Instant Recall, attack slots: 2 + 2×castle level",
    ],
    modifiers: {
      ...NO_RACE_MODIFIERS,
      defenseBonus: 0.05,
      armyPerTenRecruiters: 1,
    },
  },
  {
    key: "ORKS",
    displayName: "ORKS",
    iconPlaceholder: "OK",
    flavorQuote: "IF IT MOVES, RAID IT.",
    flavorText:
      "Loud, improvised, and alarmingly effective raiders who turn wreckage into Scrap, Boss Orders, and bigger WAAAGH pressure.",
    passiveSummary: [
      "Earn Scrap from raids, tile wins, Home of A, and loot camps",
      "Spend Scrap on Boss Orders and WAAAGH investments",
      "+6 carry capacity per surviving attacker",
      "+1 army per 10 recruiters",
    ],
    modifiers: {
      ...NO_RACE_MODIFIERS,
      armyPerTenRecruiters: 1,
      carryCapacityPerSurvivorBonus: 6,
    },
  },
] as const satisfies readonly RaceDefinition[];

const RACE_DEFINITION_BY_KEY = new Map<FortressRace, RaceDefinition>(
  RACE_DEFINITIONS.map((definition) => [definition.key, definition])
);

export function getRaceDefinition(race: FortressRace | null | undefined) {
  return race ? RACE_DEFINITION_BY_KEY.get(race) ?? null : null;
}

export function getRaceModifiers(race: FortressRace | null | undefined) {
  return getRaceDefinition(race)?.modifiers ?? NO_RACE_MODIFIERS;
}

export function isFortressRace(value: string): value is FortressRace {
  return FORTRESS_RACES.includes(value as FortressRace);
}
