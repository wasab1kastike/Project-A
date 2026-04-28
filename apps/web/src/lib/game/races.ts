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
  pointsPerTenMiners: number;
  foodPerTenFarmers: number;
  armyPerTenRecruiters: number;
  carryCapacityPerSurvivorBonus: number;
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
  pointsPerTenMiners: 0,
  foodPerTenFarmers: 0,
  armyPerTenRecruiters: 0,
  carryCapacityPerSurvivorBonus: 0,
};

export const RACE_DEFINITIONS = [
  {
    key: "DWARFS",
    displayName: "Dwarfs",
    iconPlaceholder: "DW",
    flavorQuote: "We mine because we care.",
    flavorText:
      "Stone-minded planners who turn deep mines and stubborn walls into seasonal leverage.",
    passiveSummary: ["+10% defense bonus", "+1 point per 10 miners"],
    modifiers: {
      ...NO_RACE_MODIFIERS,
      defenseBonus: 0.1,
      pointsPerTenMiners: 1,
    },
  },
  {
    key: "UNSTABLE_UNICORNS",
    displayName: "Unstable Unicorns",
    iconPlaceholder: "UU",
    flavorQuote:
      "Everything is under control. (Everything is not under control.)",
    flavorText:
      "Glittering chaos farmers who somehow make the food stores bigger and the castle louder.",
    passiveSummary: ["+1 food per 10 farmers", "+2 population", "Enemies cannot see your army size in transit"],
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
      "Disciplined orbital rodents with clean recruitment lines and reinforced bunker doctrine.",
    passiveSummary: ["+1 army per 10 recruiters", "+5% defense bonus", "Attack slots: 2 + 2×castle level"],
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
      "Loud, improvised, and alarmingly effective when survivors find room for extra loot.",
    passiveSummary: [
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
