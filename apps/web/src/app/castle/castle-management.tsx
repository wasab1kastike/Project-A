"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useRefreshView } from "@/lib/refresh-helpers";
import { RaceSkillPanel } from "@/components/race-skill-panel";

import {
  purchaseSkillNodeAction,
  setGuardPercentAction,
  setMaxArmySizeAction,
  createBattalionAction,
} from "@/app/game-actions";
import { CastleUpgradeSpecialization } from "@/lib/prisma-client";
import {
  formatDeepMiningImpact,
  formatUnicornShatteredRealityImpact,
  getDeepMiningStatus,
} from "@/lib/game/race-history-labels";

import {
  activateDwarfDeepMiningAction,
  activateDwarfRuneOfGrudgesAction,
  activateOrkBossOrderAction,
  cancelDwarfRuneOfGrudgesAction,
  chooseDwarfGrudgeAction,
  chooseDwarfTierThreeGrudgeAction,
  investOrkWaaaghScrapAction,
  activateStimAction,
  activateUnicornShatteredRealityAction,
  activateWaaaghAction,
  choosePendingUpgradeSpecializationAction,
  claimUnicornTeleportAction,
  purchaseFortressUpgradeAction,
  reinforceDwarfRuneOfGrudgesAction,
  registerCommanderNameFormAction,
  renameFortressAction,
  recruitArmyAction,
  recallArmyOrderAction,
  selectFortressRaceAction,
  selectFortressDoctrineAction,
  updateWorkerAssignmentAction,
  useUnicornTeleportAction as activateUnicornTeleportAction,
  buyPointsWithGoldAction,
} from "@/app/game-actions";
import {
  calculateTickProduction,
  validateWorkerAssignments,
} from "@/lib/game/balance";
import {
  getPressureWorkerDescription,
  getPressureWorkerLabel,
} from "@/lib/game/tile-pressure";
import {
  calculateRecruitmentProgress,
  getArmyUpkeepCost,
  getRecruitmentCost,
  STARVATION_ATTRITION_RATE,
} from "@/lib/game/army-recruitment";
import {
  RACE_DEFINITIONS,
  isFortressRace,
  type FortressRace,
} from "@/lib/game/races";
import { RACE_TIER_TILE_THRESHOLDS } from "@/lib/game/race-buffs";
import { convertGoldToPoints, getGoldToPointsRatio } from "@/lib/game/currency";
import {
  getBuildingUpgradeComparison,
  getCastleSpecializationMultiplier,
} from "@/lib/game/specializations";
import styles from "./page.module.css";

type PlayerSummary = {
  id: string;
  cycleId: string;
  commanderName: string;
  canRegisterCommanderName: boolean;
  name: string;
  points: number;
  gold: number;
  level: number;
  displayedCastleLevel: number;
  population: number;
  defenseMultiplier: number;
  food: number;
  army: number;
  recruitmentQueue: number;
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
  pressureWorkersAssigned: number;
  legacyAbilitiesEnabled: boolean;
  doctrinesEnabled: boolean;
  doctrine: string | null;
  doctrineState: {
    selected: {
      doctrine: string;
      race: string;
      label: string;
      description: string;
    } | null;
    effectPercent: number;
    changedAt: Date | null;
    changeAvailableAt: Date | null;
    options: Array<{
      doctrine: string;
      label: string;
      description: string;
      canSelect: boolean;
      disabledReason: string | null;
    }>;
  };
  race: string | null;
  canSelectRace: boolean;
  raceSelectionLockedReason: string | null;
  factionSuppression: {
    runeFortressId: string | null;
    ownerName: string;
    ownerCommanderName: string;
    activeUntil: Date;
  } | null;
  canRename: boolean;
  canSetAction: boolean;
  locationShuffleCost: number | null;
  freeLocationShuffleAvailable: boolean;
  hasOutgoingAttackUnits: boolean;
  canShuffleLocation: boolean;
  dwarfRuneOfGrudges: {
    targetFortressId: string | null;
    targetName: string | null;
    targetCommanderName: string | null;
    runeFortressId: string | null;
    runeHealth: number | null;
    runeArmy: number | null;
    activeUntil: Date;
    goldCost: number;
    maintenanceGoldPerTick: number;
  } | null;
  upgradesUnlocked: boolean;
  nextUpgradeCost: number | null;
  nextUpgradeDurationMinutes: number | null;
  canPurchaseUpgrade: boolean;
  castleSpecializationCounts: Record<
    "POINTS" | "FOOD" | "MILITARY" | "DEFENSE",
    number
  > | null;
  buildingUpgradeOptions: Record<
    "POINTS" | "FOOD" | "MILITARY" | "DEFENSE",
    {
      level: number;
      maxLevel: number | null;
      nextCost: number | null;
      nextDurationMinutes: number | null;
      canUpgrade: boolean;
    }
  > | null;
  pendingUpgradeSpecializationLevel: number | null;
  activeCastleUpgradeProject: {
    level: number;
    specialization: "POINTS" | "FOOD" | "MILITARY" | "DEFENSE";
    goldCost: number;
    startedAt: Date;
    completesAt: Date;
  } | null;
  raceBuffs: {
    tier: number;
    matchingTileCount: number;
    canActivateWaaagh: boolean;
    waaaghActiveUntil: Date | null;
    orkScrap: number;
    orkScrapEvents: {
      id: string;
      reason: string;
      delta: number;
      balanceAfter: number;
      tileId: string | null;
      targetName: string | null;
      targetCommanderName: string | null;
      createdAt: Date;
    }[];
    activeOrkBossOrder: {
      id: string;
      kind: string;
      label: string;
      description: string;
      scrapCost: number;
      goldCost: number;
      activeUntil: Date;
    } | null;
    orkBossOrders: {
      kind: string;
      label: string;
      description: string;
      scrapCost: number;
      goldCost: number;
      durationMinutes: number;
      canActivate: boolean;
      disabledReason: string | null;
    }[];
    orkWaaaghInvestments: {
      kind: string;
      label: string;
      description: string;
      scrapCost: number;
      canActivate: boolean;
      disabledReason: string | null;
      active: boolean;
    }[];
    canActivateStim: boolean;
    canActivateUnicornShatteredReality: boolean;
    unicornShatteredRealityDisabledReason: string | null;
    stimActiveUntil: Date | null;
    canClaimUnicornTeleport: boolean;
    unicornTeleportClaimDisabledReason: string | null;
    hasUnicornTeleportToken: boolean;
    canActivateDeepMining: boolean;
    canActivateRuneOfGrudges: boolean;
    deepMiningLatest: {
      outcome: string;
      committedGold: number;
      goldDelta: number;
      armyDelta: number;
      recruitmentQueueDelta: number;
      resolvedAt: Date | null;
      activeUntil: Date | null;
      createdAt: Date;
      targetName: string | null;
      runeFortressId: string | null;
      runeHealth: number | null;
      runeArmy: number | null;
    } | null;
    deepMiningHistory: {
      outcome: string;
      committedGold: number;
      goldDelta: number;
      armyDelta: number;
      recruitmentQueueDelta: number;
      resolvedAt: Date | null;
      activeUntil: Date | null;
      createdAt: Date;
      targetName: string | null;
      runeFortressId: string | null;
      runeHealth: number | null;
      runeArmy: number | null;
    }[];
    unicornShatteredRealityLatest: {
      outcome: string;
      summary: string;
      armyDelta: number;
      garrisonArmyDelta: number;
      goldDelta: number;
      foodDelta: number;
      activeUntil: Date | null;
      createdAt: Date;
    } | null;
    unicornShatteredRealityHistory: {
      outcome: string;
      summary: string;
      armyDelta: number;
      garrisonArmyDelta: number;
      goldDelta: number;
      foodDelta: number;
      activeUntil: Date | null;
      createdAt: Date;
    }[];
    dwarfGrudges: {
      targetFortressId: string;
      targetName: string;
      targetCommanderName: string;
      slot: number;
      bonusMultiplier: number;
    }[];
    canChooseDwarfGrudge: boolean;
    canChooseDwarfTierThree: boolean;
  };
  activeUnicornTeleport: {
    originTile: string;
    temporaryTile: string;
    returnAt: Date;
    isReturnDelayed: boolean;
  } | null;
  ownedTileSummary: {
    totalTileCount: number;
    goldIncome: number;
    pointIncome: number;
    foodIncome: number;
    armyIncome: number;
    workerPoolBonus: number;
    defenseBonusPercent: number;
  };
  expansionSummary: {
    pressureOutput: number;
    activePriorityCount: number;
    leadingPriority: {
      tileId: string;
      progress: number;
      outputPerTick: number;
    } | null;
    pressureThreshold: number;
    estimatedMinutesRemaining: number | null;
    decayingPressureCount: number;
  } | null;
  operationsSummary: {
    committedArmy: number;
    activeOrderCount: number;
    guards: Array<{
      id: string;
      tileId: string;
      committedArmy: number;
    }>;
    campaigns: Array<{
      id: string;
      orderId: string;
      tileId: string;
      opponentName: string;
      committedArmy: number;
      status: string;
      progress: number;
      threshold: number;
      responseEndsAt: Date | null;
      canRecall: boolean;
    }>;
    logistics: {
      escortCount: number;
      escortArmy: number;
      raidCount: number;
      raidArmy: number;
    };
  } | null;
  growPerTick: number;
  battalions: Array<{
    id: string;
    name: string;
    size: number;
    maxSize: number;
    tier: number;
    xp: number;
    readyAt: number | null;
    stance: string;
    garrisonedAt: string | null;
    frontId: string | null;
  }>;
  warPolicy: {
    maxArmySize: number;
    guardPercent: number;
    defaultAggression: string;
  } | null;
  warFronts: Array<{
    id: string;
    attackerFortressId: string;
    enemyFortressId: string;
    status: string;
    aggression: string;
  }>;
  skillPurchases: Array<{ nodeKey: string }>;
  skillPointsEarned: number;
};

type CommandTarget = {
  id: string;
  name: string;
  isNpc: boolean;
};

type BuildingSpecialization = "POINTS" | "FOOD" | "MILITARY" | "DEFENSE";
type CastleTab = "OVERVIEW" | "ECONOMY" | "WAR_ROOM" | "SKILLS" | "SHOP";
type WorkerAssignmentKey =
  | "minersAssigned"
  | "farmersAssigned"
  | "recruitersAssigned";
type BuildingMetadata = {
  key: BuildingSpecialization;
  name: string;
  role: string;
  workerKey: WorkerAssignmentKey | null;
};
type BuildingRaceKey = FortressRace | "DEFAULT";

const BUILDING_WORKER_KEYS = {
  DEFENSE: null,
  POINTS: "minersAssigned",
  FOOD: "farmersAssigned",
  MILITARY: "recruitersAssigned",
} as const satisfies Record<BuildingSpecialization, WorkerAssignmentKey | null>;

const BUILDING_COPY_BY_RACE = {
  DEFAULT: {
    DEFENSE: {
      name: "Keep",
      role: "Command, population, and defensive structure.",
    },
    POINTS: {
      name: "Mine",
      role: "Gold generation and mining bonuses.",
    },
    FOOD: {
      name: "Farm",
      role: "Food generation and army upkeep support.",
    },
    MILITARY: {
      name: "Barracks",
      role: "Army recruitment and reinforcement support.",
    },
  },
  DWARFS: {
    DEFENSE: {
      name: "Grudgehold",
      role: "Ancestral stone halls that shelter the clan and harden every oath.",
    },
    POINTS: {
      name: "Oathmine",
      role: "Deep shafts where gold is weighed against old debts.",
    },
    FOOD: {
      name: "Fungus Vaults",
      role: "Sealed underhalls that feed the throng through siege and spite.",
    },
    MILITARY: {
      name: "Muster Hall",
      role: "Iron muster grounds where grudges become marching orders.",
    },
  },
  UNSTABLE_UNICORNS: {
    DEFENSE: {
      name: "Prismatic Bastion",
      role: "Shifting walls and decoy towers that refuse to stay where expected.",
    },
    POINTS: {
      name: "Glitter Quarry",
      role: "Unstable seams that shed suspiciously valuable sparkle.",
    },
    FOOD: {
      name: "Moon Pasture",
      role: "Overgrown grazing rings that turn chaos into food stores.",
    },
    MILITARY: {
      name: "Horn Drill Yard",
      role: "A loud training ring for charges, feints, and sudden retreats.",
    },
  },
  SPACE_MURINES: {
    DEFENSE: {
      name: "Command Bunker",
      role: "Armored command decks coordinating disciplined fortress defense.",
    },
    POINTS: {
      name: "Ore Refinery",
      role: "Industrial extraction bays converting raw ore into campaign funds.",
    },
    FOOD: {
      name: "Nutrient Vats",
      role: "Sealed ration systems keeping the war machine supplied.",
    },
    MILITARY: {
      name: "Drop Barracks",
      role: "Readiness decks that process recruits into deployable strike teams.",
    },
  },
  ORKS: {
    DEFENSE: {
      name: "Boss Fort",
      role: "Reinforced scrap walls where Boss Orders are shouted into policy.",
    },
    POINTS: {
      name: "Teef Pit",
      role: "A noisy dig site that turns loot, teef, and Scrap into pressure.",
    },
    FOOD: {
      name: "Squig Pens",
      role: "Dangerous food pens that keep the horde fed between raids.",
    },
    MILITARY: {
      name: "Mob Yard",
      role: "A brawling ground where Scrap-funded plans become marching mobs.",
    },
  },
} as const satisfies Record<
  BuildingRaceKey,
  Record<BuildingSpecialization, { name: string; role: string }>
>;

const BUILDING_SPECIALIZATIONS = [
  "DEFENSE",
  "POINTS",
  "FOOD",
  "MILITARY",
] as const satisfies readonly BuildingSpecialization[];

const EMPTY_BUILDING_COUNTS: Record<BuildingSpecialization, number> = {
  DEFENSE: 0,
  POINTS: 0,
  FOOD: 0,
  MILITARY: 0,
};

const RACE_TIER_BIOME_REQUIREMENTS: Record<FortressRace, string> = {
  DWARFS: "Mountains",
  ORKS: "Plains or Lake",
  SPACE_MURINES: "Sea or Coast",
  UNSTABLE_UNICORNS: "Marsh or Forest",
};

const RACE_TIER_THRESHOLDS_LABEL = "Tier 1/2/3 at 3/6/9 matching tiles";
const CASTLE_TABS = [
  { key: "OVERVIEW", label: "Overview" },
  { key: "ECONOMY", label: "Economy" },
  { key: "WAR_ROOM", label: "War Room" },
  { key: "SKILLS", label: "Skills" },
  { key: "SHOP", label: "Shop" },
] as const satisfies readonly { key: CastleTab; label: string }[];
const RACE_TOKEN_PATHS: Partial<Record<FortressRace, string>> = {
  DWARFS: "/assets/token-dwarf.png",
  ORKS: "/assets/token-orks.png",
  SPACE_MURINES: "/assets/token-space-murines.png",
  UNSTABLE_UNICORNS: "/assets/token-unstable-unicorns.png",
};

function getBuildingsForRace(race: string | null): readonly BuildingMetadata[] {
  const raceKey: BuildingRaceKey =
    race && isFortressRace(race) ? race : "DEFAULT";
  const copy = BUILDING_COPY_BY_RACE[raceKey];

  return BUILDING_SPECIALIZATIONS.map((key) => ({
    key,
    name: copy[key].name,
    role: copy[key].role,
    workerKey: BUILDING_WORKER_KEYS[key],
  }));
}

function formatTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEstimate(minutes: number) {
  if (minutes < 60) {
    return `about ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `about ${hours}h ${remainingMinutes}m`
    : `about ${hours}h`;
}

function getCampaignStatusLabel(status: string) {
  if (status === "SIEGE_WARNING") {
    return "Siege warning";
  }

  return status === "ENGAGED" ? "Siege live" : "Building";
}

function getBuildingEffect({
  key,
  level,
  production,
  defenseMultiplier,
  population,
}: {
  key: BuildingSpecialization;
  level: number;
  production: ReturnType<typeof calculateTickProduction>;
  defenseMultiplier: number;
  population: number;
}) {
  switch (key) {
    case "DEFENSE":
      return `Population ${population}, defense x${defenseMultiplier.toFixed(2)}`;
    case "POINTS":
      return `+${production.goldProduced} gold/tick from miners`;
    case "FOOD":
      return `+${production.foodProduced} food/tick from farmers`;
    case "MILITARY":
      return "Recruiters process queued army orders";
    default:
      return `Level ${level}`;
  }
}

function getBuildingUpgradeBenefitPreview({
  key,
  level,
  currentProduction,
  projectedProduction,
}: {
  key: BuildingSpecialization;
  level: number;
  currentProduction: ReturnType<typeof calculateTickProduction>;
  projectedProduction: ReturnType<typeof calculateTickProduction>;
}) {
  const comparison = getBuildingUpgradeComparison(level);

  switch (key) {
    case "DEFENSE":
      return `Defense multiplier x${comparison.currentMultiplier.toFixed(2)} -> x${comparison.nextMultiplier.toFixed(2)} (+${comparison.percentageIncrease.toFixed(2)}%).`;
    case "POINTS": {
      const diff =
        projectedProduction.goldProduced - currentProduction.goldProduced;

      return `Gold per tick +${currentProduction.goldProduced} -> +${projectedProduction.goldProduced} (${diff >= 0 ? "+" : ""}${diff}/tick).`;
    }
    case "FOOD": {
      const diff =
        projectedProduction.foodProduced - currentProduction.foodProduced;

      return `Food per tick +${currentProduction.foodProduced} -> +${projectedProduction.foodProduced} (${diff >= 0 ? "+" : ""}${diff}/tick).`;
    }
    case "MILITARY": {
      const diff =
        projectedProduction.armyRequested - currentProduction.armyRequested;

      return `Recruitment capacity ${currentProduction.armyRequested} -> ${projectedProduction.armyRequested} (${diff >= 0 ? "+" : ""}${diff}/tick).`;
    }
    default:
      return `Level ${level}`;
  }
}

function BuildingChoiceFields({
  buildings,
}: {
  buildings: readonly BuildingMetadata[];
}) {
  return (
    <div className={styles.buildingChoiceGrid}>
      {buildings.map((building) => (
        <label key={building.key} className={styles.buildingChoice}>
          <input
            name="specialization"
            type="radio"
            value={building.key}
            required
          />
          <span>
            <strong>{building.name}</strong>
            <small>{building.role}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function getRecruitmentQueueCompletionText(ticksToComplete: number): string {
  return Number.isFinite(ticksToComplete)
    ? `${ticksToComplete} ticks`
    : "no ticks until recruiters are assigned";
}

function getRecruitmentDisplayState({
  army,
  gold,
  race,
  recruitAmount,
  recruitmentQueue,
  recruitersAssigned,
  recruitmentCapacityMultiplier,
}: {
  army: number;
  gold: number;
  race: string | null;
  recruitAmount: number;
  recruitmentQueue: number;
  recruitersAssigned: number;
  recruitmentCapacityMultiplier: number;
}) {
  const recruitmentProgress = calculateRecruitmentProgress(
    recruitmentQueue,
    recruitersAssigned,
    race as never,
    recruitmentCapacityMultiplier
  );
  const recruitCost = getRecruitmentCost(recruitAmount);

  return {
    armyUpkeep: Math.floor(getArmyUpkeepCost(army)),
    canSubmitRecruitment: Boolean(race) && recruitCost <= gold,
    queueCompletionText: getRecruitmentQueueCompletionText(
      recruitmentProgress.ticksToComplete
    ),
    recruitCost,
    starvationAttritionPercent: Math.round(STARVATION_ATTRITION_RATE * 100),
  };
}

export function CastleManagement({
  playerSummary,
  targets,
}: {
  playerSummary: PlayerSummary;
  targets: CommandTarget[];
}) {
  const refreshView = useRefreshView();
  const [workers, setWorkers] = useState({
    minersAssigned: playerSummary.minersAssigned,
    farmersAssigned: playerSummary.farmersAssigned,
    recruitersAssigned: playerSummary.recruitersAssigned,
    pressureWorkersAssigned: playerSummary.pressureWorkersAssigned,
  });
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [workerPending, setWorkerPending] = useState(false);
  const [recruitAmount, setRecruitAmount] = useState(10);
  const [recruitError, setRecruitError] = useState<string | null>(null);
  const [recruitPending, setRecruitPending] = useState(false);
  const [goldToConvert, setGoldToConvert] = useState(getGoldToPointsRatio());
  const [activeTab, setActiveTab] = useState<CastleTab>("OVERVIEW");
  const [guardPercent, setGuardPercent] = useState(
    playerSummary.warPolicy?.guardPercent ?? 30,
  );
  const [maxArmySize, setMaxArmySize] = useState(
    playerSummary.warPolicy?.maxArmySize ?? 500,
  );
  const [battalionPending, setBattalionPending] = useState(false);

  const handleGuardPercentChange = useCallback(
    async (value: number) => {
      setGuardPercent(value);
      const result = await setGuardPercentAction({
        cycleId: playerSummary.cycleId,
        fortressId: playerSummary.id,
        guardPercent: value,
      });
      await handleInlineResult(result);
    },
    [playerSummary.cycleId, playerSummary.id],
  );

  const handleMaxArmySizeChange = useCallback(
    async (value: number) => {
      setMaxArmySize(value);
      const result = await setMaxArmySizeAction({
        cycleId: playerSummary.cycleId,
        fortressId: playerSummary.id,
        maxArmySize: value,
      });
      await handleInlineResult(result);
    },
    [playerSummary.cycleId, playerSummary.id],
  );

  const handleCreateBattalion = useCallback(async () => {
    setBattalionPending(true);
    try {
      const result = await createBattalionAction({
        cycleId: playerSummary.cycleId,
        fortressId: playerSummary.id,
        race: playerSummary.race,
        fortressLevel: playerSummary.level,
        existingBattalionCount: playerSummary.battalions?.length ?? 0,
      });
      await handleInlineResult(result);
    } finally {
      setBattalionPending(false);
    }
  }, [
    playerSummary.cycleId,
    playerSummary.id,
    playerSummary.race,
    playerSummary.level,
    playerSummary.battalions?.length,
  ]);

  const buildings = getBuildingsForRace(playerSummary.race);
  const raceTokenPath =
    playerSummary.race && (playerSummary.race && isFortressRace(playerSummary.race!))
      ? RACE_TOKEN_PATHS[playerSummary.race]
      : null;
  const castleSpecializationCounts =
    playerSummary.castleSpecializationCounts ?? EMPTY_BUILDING_COUNTS;
  const production = useMemo(
    () =>
      calculateTickProduction({
        level: playerSummary.level,
        race: playerSummary.race as never,
        food: playerSummary.food,
        castleSpecializations: castleSpecializationCounts,
        ...workers,
      }),
    [
      castleSpecializationCounts,
      playerSummary.food,
      playerSummary.level,
      playerSummary.race,
      workers,
    ]
  );
  const validation = validateWorkerAssignments({
    level: playerSummary.level,
    race: playerSummary.race as never,
    extraPopulation: playerSummary.ownedTileSummary.workerPoolBonus,
    ...workers,
  });
  const assigned =
    workers.minersAssigned +
    workers.farmersAssigned +
    workers.recruitersAssigned +
    workers.pressureWorkersAssigned;
  const pressureWorkerLabel = getPressureWorkerLabel(
    playerSummary.race as never
  );
  const pressureWorkerDescription = getPressureWorkerDescription(
    playerSummary.race as never
  );
  const recruitmentCapacityMultiplier = getCastleSpecializationMultiplier(
    castleSpecializationCounts[CastleUpgradeSpecialization.MILITARY]
  );
  const recruitmentDisplay = getRecruitmentDisplayState({
    army: playerSummary.army,
    gold: playerSummary.gold,
    race: playerSummary.race,
    recruitAmount,
    recruitmentQueue: playerSummary.recruitmentQueue,
    recruitersAssigned: workers.recruitersAssigned,
    recruitmentCapacityMultiplier,
  });
  const pointsFromGold = convertGoldToPoints(goldToConvert);
  const canConvertGoldToPoints =
    pointsFromGold > 0 &&
    goldToConvert > 0 &&
    goldToConvert <= playerSummary.gold;
  const shatteredRealityDisabledReason =
    playerSummary.raceBuffs.unicornShatteredRealityDisabledReason;
  const unicornTeleportClaimDisabledReason =
    playerSummary.raceBuffs.unicornTeleportClaimDisabledReason;

  function setWorker(key: keyof typeof workers, value: number) {
    setWorkerError(null);
    setWorkers((current) => ({
      ...current,
      [key]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
    }));
  }

  async function saveWorkers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validation.isValid) {
      setWorkerError("Worker assignments must fit within population.");
      return;
    }

    setWorkerPending(true);
    try {
      const result = await updateWorkerAssignmentAction(workers);

      if (!result.ok) {
        setWorkerError(result.error);
        return;
      }

      refreshView();
    } finally {
      setWorkerPending(false);
    }
  }

  async function recruitArmy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecruitError(null);
    setRecruitPending(true);

    try {
      const result = await recruitArmyAction({
        unitCount: recruitAmount,
      });

      if (!result.ok) {
        setRecruitError(result.error);
        return;
      }

      refreshView();
    } finally {
      setRecruitPending(false);
    }
  }

  function getStringValue(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  }

  async function handleInlineResult(result: { ok: true } | { ok: false; error: string }) {
    if (!result.ok) {
      window.alert(result.error);
      return;
    }

    refreshView();
  }

  async function buyPointsWithGoldFormAction(formData: FormData): Promise<void> {
    const goldAmount = Number(getStringValue(formData, "goldAmount"));
    await handleInlineResult(
      await buyPointsWithGoldAction(Number.isFinite(goldAmount) ? goldAmount : 0)
    );
  }

  async function purchaseFortressUpgradeFormAction(
    formData: FormData
  ): Promise<void> {
    await handleInlineResult(
      await purchaseFortressUpgradeAction(getStringValue(formData, "specialization"))
    );
  }

  async function choosePendingUpgradeSpecializationFormAction(
    formData: FormData
  ): Promise<void> {
    await handleInlineResult(
      await choosePendingUpgradeSpecializationAction(
        getStringValue(formData, "specialization")
      )
    );
  }

  async function activateWaaaghFormAction(): Promise<void> {
    await handleInlineResult(await activateWaaaghAction());
  }

  async function activateOrkBossOrderFormAction(formData: FormData): Promise<void> {
    const kind = getStringValue(formData, "kind");
    await handleInlineResult(await activateOrkBossOrderAction(kind as never));
  }

  async function investOrkWaaaghScrapFormAction(formData: FormData): Promise<void> {
    const kind = getStringValue(formData, "kind");
    await handleInlineResult(await investOrkWaaaghScrapAction(kind));
  }

  async function activateStimFormAction(): Promise<void> {
    await handleInlineResult(await activateStimAction());
  }

  async function activateUnicornShatteredRealityFormAction(): Promise<void> {
    await handleInlineResult(await activateUnicornShatteredRealityAction());
  }

  async function useUnicornTeleportFormAction(): Promise<void> {
    await handleInlineResult(await activateUnicornTeleportAction());
  }

  async function claimUnicornTeleportFormAction(): Promise<void> {
    await handleInlineResult(await claimUnicornTeleportAction());
  }

  async function activateDwarfRuneOfGrudgesFormAction(
    formData: FormData
  ): Promise<void> {
    await handleInlineResult(
      await activateDwarfRuneOfGrudgesAction(
        getStringValue(formData, "targetFortressId")
      )
    );
  }

  async function reinforceDwarfRuneOfGrudgesFormAction(
    formData: FormData
  ): Promise<void> {
    const sentArmy = Number(getStringValue(formData, "sentArmy"));
    await handleInlineResult(
      await reinforceDwarfRuneOfGrudgesAction(
        Number.isFinite(sentArmy) ? sentArmy : 0
      )
    );
  }

  async function cancelDwarfRuneOfGrudgesFormAction(): Promise<void> {
    await handleInlineResult(await cancelDwarfRuneOfGrudgesAction());
  }

  async function activateDwarfDeepMiningFormAction(
    formData: FormData
  ): Promise<void> {
    const committedGold = Number(getStringValue(formData, "committedGold"));
    await handleInlineResult(
      await activateDwarfDeepMiningAction(
        Number.isFinite(committedGold) ? committedGold : 0
      )
    );
  }

  async function chooseDwarfGrudgeFormAction(formData: FormData): Promise<void> {
    await handleInlineResult(
      await chooseDwarfGrudgeAction(getStringValue(formData, "targetFortressId"))
    );
  }

  async function chooseDwarfTierThreeGrudgeFormAction(
    formData: FormData
  ): Promise<void> {
    const choice = getStringValue(formData, "choice");
    const targetFortressId = getStringValue(formData, "targetFortressId");
    await handleInlineResult(
      await chooseDwarfTierThreeGrudgeAction(
        targetFortressId || undefined,
        choice === "double"
      )
    );
  }

  async function selectFortressRaceFormAction(formData: FormData): Promise<void> {
    await handleInlineResult(
      await selectFortressRaceAction(getStringValue(formData, "race"))
    );
  }

  async function selectFortressDoctrineFormAction(formData: FormData): Promise<void> {
    await handleInlineResult(
      await selectFortressDoctrineAction(getStringValue(formData, "doctrine"))
    );
  }

  async function renameFortressFormAction(formData: FormData): Promise<void> {
    await handleInlineResult(
      await renameFortressAction(getStringValue(formData, "fortressName"))
    );
  }

  async function recallArmyOrderFormAction(formData: FormData): Promise<void> {
    await handleInlineResult(
      await recallArmyOrderAction(getStringValue(formData, "armyOrderId"))
    );
  }

  return (
    <div className={styles.castleConsole}>
      <header className={styles.commandHeader}>
        <div className={styles.fortressIdentity}>
          {raceTokenPath ? (
            <img
              className={styles.raceToken}
              src={raceTokenPath}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <span className={styles.raceTokenPlaceholder} aria-hidden="true" />
          )}
          <div>
            <span className={styles.eyebrow}>Castle command</span>
            <h2>{playerSummary.name}</h2>
            <p className={styles.identityMeta}>
              Level {playerSummary.displayedCastleLevel} &middot;{" "}
              {playerSummary.race ?? "No race selected"}
              {playerSummary.doctrineState.selected
                ? ` / ${playerSummary.doctrineState.selected.label}`
                : ""}
            </p>
          </div>
        </div>
        <dl className={styles.resourceStrip}>
          <div>
            <dt>Points</dt>
            <dd>{playerSummary.points}</dd>
          </div>
          <div>
            <dt>Gold</dt>
            <dd>{playerSummary.gold}</dd>
          </div>
          <div>
            <dt>Food</dt>
            <dd>{playerSummary.food}</dd>
          </div>
          <div>
            <dt>Army</dt>
            <dd>{playerSummary.army}</dd>
          </div>
        </dl>
        {playerSummary.doctrinesEnabled ? (
          <div className={styles.expansionStatus}>
            <img
              src="/assets/ui/crest-pressure.webp"
              className={styles.featureCrest}
              alt=""
              aria-hidden="true"
            />
            <div>
              <span className={styles.eyebrow}>Expansion</span>
              <strong>Pressure operations</strong>
            </div>
          </div>
        ) : null}
      </header>

      <nav
        className={styles.tabBar}
        aria-label="Castle management sections"
        role="tablist"
      >
        {CASTLE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={styles.tabButton}
            id={`castle-tab-${tab.key.toLowerCase()}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`castle-panel-${tab.key.toLowerCase()}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        className={styles.castleGrid}
        id={`castle-panel-${activeTab.toLowerCase()}`}
        role="tabpanel"
        aria-labelledby={`castle-tab-${activeTab.toLowerCase()}`}
      >
      {activeTab === "OVERVIEW" ? (
        <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Castle</span>
          <strong>Level {playerSummary.displayedCastleLevel}</strong>
        </div>
        <h1>{playerSummary.name}</h1>
        <dl className={styles.statGrid}>
          <div>
            <dt>Points</dt>
            <dd>{playerSummary.points}</dd>
          </div>
          <div>
            <dt>Gold</dt>
            <dd>{playerSummary.gold}</dd>
          </div>
          <div>
            <dt>Food</dt>
            <dd>{playerSummary.food}</dd>
          </div>
          <div>
            <dt>Army</dt>
            <dd>{playerSummary.army}</dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>{playerSummary.recruitmentQueue}</dd>
          </div>
          <div>
            <dt>Defense</dt>
            <dd>x{playerSummary.defenseMultiplier.toFixed(2)}</dd>
          </div>
        </dl>
        <form action={buyPointsWithGoldFormAction} className={styles.form}>
          <label>
            Buy points with gold
            <input
              type="number"
              name="goldAmount"
              min={getGoldToPointsRatio()}
              step={1}
              value={goldToConvert}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                setGoldToConvert(
                  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
                );
              }}
            />
          </label>
          <p className={styles.muted}>
            Rate: {getGoldToPointsRatio()} gold = 1 point. This converts{" "}
            {goldToConvert} gold into {pointsFromGold} points.
          </p>
          <button type="submit" disabled={!canConvertGoldToPoints}>
            Convert gold to points
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Owned land</span>
          <strong>{playerSummary.ownedTileSummary.totalTileCount} tiles</strong>
        </div>
        <dl className={styles.statGrid}>
          <div>
            <dt>Gold/tick</dt>
            <dd>+{playerSummary.ownedTileSummary.goldIncome}</dd>
          </div>
          <div>
            <dt>Points/tick</dt>
            <dd>+{playerSummary.ownedTileSummary.pointIncome}</dd>
          </div>
          <div>
            <dt>Food/tick</dt>
            <dd>+{playerSummary.ownedTileSummary.foodIncome}</dd>
          </div>
          <div>
            <dt>Army/tick</dt>
            <dd>+{playerSummary.ownedTileSummary.armyIncome}</dd>
          </div>
          <div>
            <dt>Worker pool</dt>
            <dd>+{playerSummary.ownedTileSummary.workerPoolBonus}</dd>
          </div>
          <div>
            <dt>Defense</dt>
            <dd>+{playerSummary.ownedTileSummary.defenseBonusPercent}%</dd>
          </div>
        </dl>
        <p className={styles.muted}>
          {playerSummary.doctrinesEnabled
            ? "Neutral borders grow through pressure priorities. The center monument is preserved and provides no income."
            : "Normal hexes now feed gold and food, while Home of A generates score income."}
        </p>
      </section>

      {playerSummary.expansionSummary ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Expansion</span>
            <strong>
              {playerSummary.expansionSummary.activePriorityCount} priorities
            </strong>
          </div>
          <div className={styles.operationTitle}>
            <img
              className={styles.rowCrest}
              src="/assets/ui/crest-pressure.webp"
              alt=""
            />
            <div>
              <strong>Pressure momentum</strong>
              <p className={styles.muted}>
                {playerSummary.pressureWorkersAssigned} workers generate{" "}
                {playerSummary.expansionSummary.pressureOutput} pressure per
                tick.
              </p>
            </div>
          </div>
          {playerSummary.expansionSummary.leadingPriority ? (
            <div className={styles.progressRow}>
              <div className={styles.statusRow}>
                <span>Leading claim</span>
                <strong>
                  Tile {playerSummary.expansionSummary.leadingPriority.tileId}
                </strong>
              </div>
              <progress
                max={playerSummary.expansionSummary.pressureThreshold}
                value={playerSummary.expansionSummary.leadingPriority.progress}
              />
              <div className={styles.statusRow}>
                <span>
                  {playerSummary.expansionSummary.leadingPriority.progress} /{" "}
                  {playerSummary.expansionSummary.pressureThreshold}
                </span>
                {playerSummary.expansionSummary.estimatedMinutesRemaining !==
                null ? (
                  <small>
                    {formatEstimate(
                      playerSummary.expansionSummary.estimatedMinutesRemaining
                    )}{" "}
                    at current uncontested allocation
                  </small>
                ) : null}
              </div>
            </div>
          ) : (
            <p className={styles.muted}>No neutral tile currently prioritized.</p>
          )}
          {playerSummary.expansionSummary.decayingPressureCount > 0 ? (
            <p className={styles.warning}>
              {playerSummary.expansionSummary.decayingPressureCount} unsupported
              pressure{" "}
              {playerSummary.expansionSummary.decayingPressureCount === 1
                ? "claim is"
                : "claims are"}{" "}
              decaying without an active priority.
            </p>
          ) : null}
          <Link className={styles.textLink} href="/">
            Change priorities on battlefield
          </Link>
        </section>
      ) : null}
        </>
      ) : null}

      {activeTab === "ECONOMY" ? (
        <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Buildings</span>
          <strong>
            {playerSummary.activeCastleUpgradeProject
              ? "Construction active"
              : `${playerSummary.level} upgrades`}
          </strong>
        </div>
        <div className={styles.buildingGrid}>
          {buildings.map((building) => {
            const buildingLevel =
              playerSummary.castleSpecializationCounts?.[building.key] ?? 0;
            const projectedProduction = calculateTickProduction({
              level: playerSummary.level,
              race: playerSummary.race as never,
              food: playerSummary.food,
              castleSpecializations: {
                ...castleSpecializationCounts,
                [building.key]: buildingLevel + 1,
              },
              ...workers,
            });
            const upgradeOption =
              playerSummary.buildingUpgradeOptions?.[building.key] ?? null;
            const activeProject =
              playerSummary.activeCastleUpgradeProject?.specialization ===
              building.key
                ? playerSummary.activeCastleUpgradeProject
                : null;

            return (
              <article key={building.key} className={styles.buildingCard}>
                <div className={styles.buildingCardHeader}>
                  <strong>{building.name}</strong>
                  <span>Level {buildingLevel}</span>
                </div>
                <p>{building.role}</p>
                <small>
                  {getBuildingEffect({
                    key: building.key,
                    level: buildingLevel,
                    production,
                    defenseMultiplier: playerSummary.defenseMultiplier,
                    population: playerSummary.population,
                  })}
                </small>
                <small>
                  Next level:{" "}
                  {getBuildingUpgradeBenefitPreview({
                    key: building.key,
                    level: buildingLevel,
                    currentProduction: production,
                    projectedProduction,
                  })}
                </small>
                {building.workerKey ? (
                  <small>Workers: {workers[building.workerKey]} assigned</small>
                ) : null}
                {activeProject ? (
                  <p className={styles.muted}>
                    Upgrading to level {activeProject.level}; completes at{" "}
                    {formatTime(activeProject.completesAt)}.
                  </p>
                ) : playerSummary.upgradesUnlocked &&
                  upgradeOption !== null &&
                  upgradeOption.nextCost !== null &&
                  playerSummary.pendingUpgradeSpecializationLevel === null ? (
                  <form
                    action={purchaseFortressUpgradeFormAction}
                    className={styles.form}
                  >
                    <input
                      name="specialization"
                      type="hidden"
                      value={building.key}
                    />
                    <p>
                      Upgrade costs {upgradeOption?.nextCost} gold and{" "}
                      {upgradeOption?.nextDurationMinutes} minutes.
                      {building.key === "DEFENSE"
                        ? " Raises castle level."
                        : upgradeOption?.maxLevel !== null
                        ? ` Max level: ${upgradeOption?.maxLevel}.`
                        : ""}
                    </p>
                    <button
                      type="submit"
                      disabled={
                        !playerSummary.canPurchaseUpgrade ||
                        !upgradeOption?.canUpgrade
                      }
                    >
                      Upgrade {building.name}
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
        {playerSummary.pendingUpgradeSpecializationLevel !== null ? (
          <form
            action={choosePendingUpgradeSpecializationFormAction}
            className={styles.form}
          >
            <p>
              Choose a building for level{" "}
              {playerSummary.pendingUpgradeSpecializationLevel}.
            </p>
            <BuildingChoiceFields buildings={buildings} />
            <button type="submit">Lock building</button>
          </form>
        ) : playerSummary.activeCastleUpgradeProject ? (
          <p className={styles.muted}>
            One building can be under construction at a time. Gold has already
            been spent for the active upgrade.
          </p>
        ) : (
          <p className={styles.muted}>
            Castle upgrades are available once gameplay starts.
          </p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Workers</span>
          <strong>
            {assigned}/{playerSummary.population}
          </strong>
        </div>
        <form className={styles.form} onSubmit={saveWorkers}>
          <label>
            Miners
            <input
              type="number"
              min={0}
              value={workers.minersAssigned}
              onChange={(event) =>
                setWorker("minersAssigned", event.currentTarget.valueAsNumber)
              }
            />
          </label>
          <label>
            Farmers
            <input
              type="number"
              min={0}
              value={workers.farmersAssigned}
              onChange={(event) =>
                setWorker("farmersAssigned", event.currentTarget.valueAsNumber)
              }
            />
          </label>
          <label>
            Recruiters
            <input
              type="number"
              min={0}
              value={workers.recruitersAssigned}
              onChange={(event) =>
                setWorker(
                  "recruitersAssigned",
                  event.currentTarget.valueAsNumber
                )
              }
            />
          </label>
          <label>
            {pressureWorkerLabel}
            <input
              type="number"
              min={0}
              value={workers.pressureWorkersAssigned}
              onChange={(event) =>
                setWorker(
                  "pressureWorkersAssigned",
                  event.currentTarget.valueAsNumber
                )
              }
            />
            <small>{pressureWorkerDescription}</small>
          </label>
          <p className={styles.muted}>
            Tick preview: +{production.goldProduced} gold, +
            {production.foodProduced} food, {production.armyRequested} queue
            capacity, -
            {recruitmentDisplay.armyUpkeep} food upkeep. If unpaid, active army
            loses {recruitmentDisplay.starvationAttritionPercent}%.
          </p>
          {workerError ? <p className={styles.error}>{workerError}</p> : null}
          <button type="submit" disabled={workerPending || !playerSummary.race}>
            Save workers
          </button>
        </form>
      </section>
        </>
      ) : null}

      {activeTab === "WAR_ROOM" ? (
        <>
      {/* Battalion Roster */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Battalions</span>
          <strong>{playerSummary.battalions?.length ?? 0} active</strong>
        </div>
        {playerSummary.battalions && playerSummary.battalions.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {playerSummary.battalions.map((bn) => (
              <li
                key={bn.id}
                style={{
                  padding: "8px 10px",
                  background: "var(--bg-raised)",
                  borderRadius: 6,
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <strong>{bn.name}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {bn.size}/{bn.maxSize} · Tier {bn.tier}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>{bn.stance}</span>
                  {bn.garrisonedAt ? (
                    <span style={{ color: "var(--text-muted)" }}>@ {bn.garrisonedAt}</span>
                  ) : null}
                  {bn.frontId ? (
                    <span style={{ color: "#4caf50" }}>Front</span>
                  ) : null}
                  {bn.readyAt ? (
                    <span style={{ color: "#ff9800" }}>Fatigued</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No battalions. Commission one to get started.
          </p>
        )}
        <button
          type="button"
          onClick={handleCreateBattalion}
          disabled={battalionPending}
          style={{
            marginTop: 8,
            padding: "6px 12px",
            fontSize: 13,
            background: "var(--color-accent, #48f)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            width: "100%",
          }}
        >
          {battalionPending ? "Commissioning..." : "Commission Battalion"}
        </button>
      </section>

      {/* War Fronts */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>War Fronts</span>
          <strong>
            {playerSummary.warFronts?.filter((f) => f.status === "ADVANCING" || f.status === "STALLED").length ?? 0} active
          </strong>
        </div>
        {playerSummary.warFronts && playerSummary.warFronts.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {playerSummary.warFronts.map((front) => {
              const frontBattalions = playerSummary.battalions?.filter(
                (b) => b.frontId === front.id,
              ) ?? [];
              return (
                <li
                  key={front.id}
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg-raised)",
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ color: front.status === "ADVANCING" ? "#4caf50" : front.status === "STALLED" ? "#ff9800" : "#888" }}>
                      vs. {front.enemyFortressId}
                    </strong>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {front.status} · {front.aggression}
                    </span>
                  </div>
                  {frontBattalions.length > 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {frontBattalions.map((b) => `${b.name} (${b.size})`).join(", ")}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      No battalions assigned.
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No active war fronts. Declare war and open a front from the battlefield.
          </p>
        )}
      </section>

      {/* Guard & Army Settings */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Army Settings</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
          <label style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <span>Guard allocation</span>
            <strong>{playerSummary.warPolicy?.guardPercent ?? 30}%</strong>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={playerSummary.warPolicy?.guardPercent ?? 30}
            style={{ width: "100%" }}
          />
          <label style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <span>Max army size</span>
            <strong>{playerSummary.warPolicy?.maxArmySize ?? 500}</strong>
          </label>
          <input
            type="number"
            min={100}
            step={50}
            defaultValue={playerSummary.warPolicy?.maxArmySize ?? 500}
            style={{
              width: "100%",
              padding: "4px 8px",
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Guards auto-distribute to owned tiles by priority. Set aggression per front from the battlefield.
          </p>
        </div>
      </section>

      {/* Passive Recruitment */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Recruitment</span>
          <strong>Passive — assign recruiters</strong>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0" }}>
          Army grows passively each tick based on assigned recruiters. Adjust
          recruiters in the <strong>Economy</strong> tab. Cap growth with max
          army size above.
        </p>
        <dl className={styles.readinessGrid}>
          <div>
            <dt>Available army</dt>
            <dd>{playerSummary.army}</dd>
          </div>
          <div>
            <dt>Recruiters assigned</dt>
            <dd>{playerSummary.recruitersAssigned ?? 0}</dd>
          </div>
          <div>
            <dt>Max army cap</dt>
            <dd>{playerSummary.warPolicy?.maxArmySize ?? 500}</dd>
          </div>
        </dl>
      </section>
      {playerSummary.operationsSummary ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Standing orders</span>
            <strong>{playerSummary.operationsSummary.activeOrderCount} active</strong>
          </div>
          <div className={styles.operationGroup}>
            <div className={styles.operationTitle}>
              <img
                className={styles.rowCrest}
                src="/assets/ui/crest-guard.webp"
                alt=""
              />
              <strong>Guards</strong>
            </div>
            <p className={styles.muted}>
              Guard allocation is now set via the % slider above. Army
              automatically distributes to owned tiles by priority.
            </p>
          </div>
          <div className={styles.operationGroup}>
            <div className={styles.operationTitle}>
              <img
                className={styles.rowCrest}
                src="/assets/ui/crest-campaign.webp"
                alt=""
              />
              <strong>Campaigns</strong>
            </div>
            {playerSummary.operationsSummary.campaigns.length > 0 ? (
              playerSummary.operationsSummary.campaigns.map((campaign) => (
                <div className={styles.operationRow} key={campaign.id}>
                  <div className={styles.campaignDetail}>
                    <div className={styles.statusRow}>
                      <strong>
                        Tile {campaign.tileId} vs {campaign.opponentName}
                      </strong>
                      <span>{getCampaignStatusLabel(campaign.status)}</span>
                    </div>
                    <small>{campaign.committedArmy} army committed</small>
                    <progress max={campaign.threshold} value={campaign.progress} />
                    <small>
                      {campaign.progress} / {campaign.threshold}
                      {campaign.status === "SIEGE_WARNING" &&
                      campaign.responseEndsAt
                        ? ` - warning until ${formatTime(campaign.responseEndsAt)}`
                        : ""}
                    </small>
                  </div>
                  {campaign.canRecall ? (
                    <form action={recallArmyOrderFormAction}>
                      <input
                        type="hidden"
                        name="armyOrderId"
                        value={campaign.orderId}
                      />
                      <button type="submit">Recall campaign</button>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <p className={styles.muted}>No active territorial campaigns.</p>
            )}
          </div>
          <div className={styles.operationGroup}>
            <div className={styles.operationTitle}>
              <strong>Logistics</strong>
            </div>
            <div className={styles.logisticsRows}>
              <div className={styles.statusRow}>
                <span>Escorts</span>
                <strong>
                  {playerSummary.operationsSummary.logistics.escortCount} orders
                  {" / "}
                  {playerSummary.operationsSummary.logistics.escortArmy} army
                </strong>
              </div>
              <div className={styles.statusRow}>
                <span>Raids</span>
                <strong>
                  {playerSummary.operationsSummary.logistics.raidCount} orders
                  {" / "}
                  {playerSummary.operationsSummary.logistics.raidArmy} army
                </strong>
              </div>
            </div>
            <Link className={styles.textLink} href="/politics">
              Manage logistics in Politics
            </Link>
          </div>
        </section>
      ) : null}
        </>
      ) : null}



      {activeTab === "OVERVIEW" ? (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Utility</span>
          <strong>Castle actions</strong>
        </div>
        <div className={styles.form}>
          {playerSummary.canRegisterCommanderName ? (
            <form
              action={registerCommanderNameFormAction}
              className={styles.inlineForm}
            >
              <input
                name="commanderName"
                defaultValue={playerSummary.commanderName}
                maxLength={32}
                required
              />
              <button type="submit">Register nick</button>
            </form>
          ) : null}
          <form action={renameFortressFormAction} className={styles.inlineForm}>
            <input
              name="fortressName"
              defaultValue={playerSummary.name}
              maxLength={32}
              required
            />
            <button type="submit" disabled={!playerSummary.canRename}>
              Rename
            </button>
          </form>
        </div>
      </section>
      ) : null}

      {activeTab === "SKILLS" ? (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Skills</span>
          <strong>{playerSummary.race ?? "Choose a race"}</strong>
        </div>
        {playerSummary.race && (playerSummary.race && isFortressRace(playerSummary.race!)) ? (
          <RaceSkillPanel
            skillState={{
              race: playerSummary.race,
              purchasedNodeKeys: playerSummary.skillPurchases.map(
                (purchase) => purchase.nodeKey
              ),
              earnedPoints: playerSummary.skillPointsEarned,
              totalPurchased: playerSummary.skillPurchases.length,
              playerLevel: playerSummary.level,
              tileCount: playerSummary.ownedTileSummary.totalTileCount,
            }}
            onPurchase={async (nodeKey) => {
              const result = await purchaseSkillNodeAction(
                playerSummary.id,
                nodeKey
              );
              if (!result.ok) window.alert(result.error);
            }}
          />
        ) : (
          <p className={styles.muted}>
            Skill tree available after choosing a race.
          </p>
        )}
      </section>
      ) : null}

      {activeTab === "SHOP" ? (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Cosmetics</span>
          <strong>Shop</strong>
        </div>
        <p className={styles.muted}>
          Visit the <a href="/shop">full shop</a> to buy loot boxes, equip cosmetics, and manage your fortress and unit skins.
        </p>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <a href="/shop" className={styles.button} style={{ textDecoration: "none", padding: "6px 14px", fontSize: "0.8rem" }}>
            Open Shop
          </a>
        </div>
      </section>
      ) : null}

      </div>
    </div>
  );
}
