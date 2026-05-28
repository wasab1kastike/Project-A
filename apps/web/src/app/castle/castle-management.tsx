"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRefreshView } from "@/lib/refresh-helpers";
import { RaceSkillPanel } from "@/components/race-skill-panel";

import { purchaseSkillTierAction } from "@/app/game-actions";
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
  skillPurchases: Array<{ path: string; tier: number }>;
  skillPointsEarned: number;
};

type CommandTarget = {
  id: string;
  name: string;
  isNpc: boolean;
};

type BuildingSpecialization = "POINTS" | "FOOD" | "MILITARY" | "DEFENSE";
type CastleTab = "OVERVIEW" | "ECONOMY" | "OPERATIONS" | "SKILLS" | "SHOP";
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
  { key: "OPERATIONS", label: "Operations" },
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
  const buildings = getBuildingsForRace(playerSummary.race);
  const raceTokenPath =
    playerSummary.race && (playerSummary.race && isFortressRace(playerSummary.race))
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

      {activeTab === "OPERATIONS" ? (
        <>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Recruitment</span>
          <strong>{playerSummary.recruitmentQueue} queued</strong>
        </div>
        {playerSummary.operationsSummary ? (
          <dl className={styles.readinessGrid}>
            <div>
              <dt>Available army</dt>
              <dd>{playerSummary.army}</dd>
            </div>
            <div>
              <dt>Queued recruits</dt>
              <dd>{playerSummary.recruitmentQueue}</dd>
            </div>
            <div>
              <dt>Committed army</dt>
              <dd>{playerSummary.operationsSummary.committedArmy}</dd>
            </div>
            <div>
              <dt>Active orders</dt>
              <dd>{playerSummary.operationsSummary.activeOrderCount}</dd>
            </div>
          </dl>
        ) : null}
        <form className={styles.form} onSubmit={recruitArmy}>
          <label>
            Army units
            <input
              type="number"
              min={1}
              value={recruitAmount}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                setRecruitError(null);
                setRecruitAmount(
                  Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
                );
              }}
            />
          </label>
          <p className={styles.muted}>
            Cost: {recruitmentDisplay.recruitCost} gold. Current queue finishes
            in {recruitmentDisplay.queueCompletionText}.
          </p>
          {recruitError ? <p className={styles.error}>{recruitError}</p> : null}
          <button
            type="submit"
            disabled={
              recruitPending || !recruitmentDisplay.canSubmitRecruitment
            }
          >
            Recruit army
          </button>
        </form>
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
            {playerSummary.operationsSummary.guards.length > 0 ? (
              playerSummary.operationsSummary.guards.map((guard) => (
                <div className={styles.operationRow} key={guard.id}>
                  <div>
                    <strong>Tile {guard.tileId}</strong>
                    <small>{guard.committedArmy} army committed - Active</small>
                  </div>
                  <form action={recallArmyOrderFormAction}>
                    <input type="hidden" name="armyOrderId" value={guard.id} />
                    <button type="submit">Recall guard</button>
                  </form>
                </div>
              ))
            ) : (
              <p className={styles.muted}>No active guard commitments.</p>
            )}
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

      {false ? (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Race</span>
          <strong>{playerSummary.race ?? "Choose"}</strong>
        </div>
        {playerSummary.race ? (
          <div className={styles.form}>
            <p className={styles.muted}>
              Current race tier: {playerSummary.raceBuffs.tier}. Upgrade path:
              {" "}
              {(playerSummary.race && isFortressRace(playerSummary.race))
                ? `${RACE_TIER_THRESHOLDS_LABEL}. Required biomes: ${RACE_TIER_BIOME_REQUIREMENTS[playerSummary.race]}.`
                : "control 3/6/9 tiles of your race biomes."}
            </p>
            {playerSummary.doctrinesEnabled ? (
              <article className={styles.buildingCard}>
                <div className={styles.buildingCardHeader}>
                  <strong>Standing doctrine</strong>
                  <span>
                    {playerSummary.doctrineState.selected?.label ?? "Unselected"}
                  </span>
                </div>
                <p>
                  {playerSummary.doctrineState.selected?.description ??
                    "Select one passive doctrine for Season 4."}
                </p>
                <p className={styles.muted}>
                  Tier {playerSummary.raceBuffs.tier} effect: +
                  {playerSummary.doctrineState.effectPercent}%.
                  {playerSummary.doctrineState.changeAvailableAt
                    ? ` Next change after ${playerSummary.doctrineState.changeAvailableAt.toLocaleString()}.`
                    : " Changes lock for 12 hours."}
                </p>
                <div className={styles.buildingChoiceGrid}>
                  {playerSummary.doctrineState.options.map((option) => (
                    <form
                      key={option.doctrine}
                      action={selectFortressDoctrineFormAction}
                      className={styles.buildingChoice}
                    >
                      <input
                        name="doctrine"
                        type="hidden"
                        value={option.doctrine}
                      />
                      <strong>{option.label}</strong>
                      <p>{option.description}</p>
                      <button
                        type="submit"
                        disabled={!option.canSelect}
                        title={option.disabledReason ?? undefined}
                      >
                        {playerSummary.doctrine === option.doctrine
                          ? "Active"
                          : "Select"}
                      </button>
                    </form>
                  ))}
                </div>
              </article>
            ) : null}
            {playerSummary.legacyAbilitiesEnabled &&
            playerSummary.race === "ORKS" ? (
              <div className={styles.buildingGrid}>
                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Scrap Pile</strong>
                    <span>{playerSummary.raceBuffs.orkScrap} Scrap</span>
                  </div>
                  <p>
                    {playerSummary.doctrinesEnabled
                      ? 'Earn Scrap from raids and tile wins.'
                      : 'Earn Scrap from raids, tile wins, Home of A, and loot camps.'}
                    Spend it on Boss Orders or feed an active WAAAGH.
                  </p>
                  {playerSummary.raceBuffs.orkScrapEvents.length > 0 ? (
                    <ul className={styles.compactList}>
                      {playerSummary.raceBuffs.orkScrapEvents.map((event) => (
                        <li key={event.id}>
                          {event.delta > 0 ? "+" : ""}
                          {event.delta} Scrap:{" "}
                          {event.reason.replaceAll("_", " ")}
                          {event.targetName ? ` vs ${event.targetName}` : ""}
                          {event.tileId ? ` on tile ${event.tileId}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>
                      No Scrap has been recorded yet.
                    </p>
                  )}
                </article>

                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>WAAAGH</strong>
                    <span>
                      {playerSummary.raceBuffs.waaaghActiveUntil
                        ? `Active until ${playerSummary.raceBuffs.waaaghActiveUntil.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Tier 2 daily"}
                    </span>
                  </div>
                  <form action={activateWaaaghFormAction}>
                    <button
                      type="submit"
                      disabled={!playerSummary.raceBuffs.canActivateWaaagh}
                    >
                      Summon WAAAGH
                    </button>
                  </form>
                  <div className={styles.form}>
                    {playerSummary.raceBuffs.orkWaaaghInvestments.map(
                      (investment) => (
                        <form
                          key={investment.kind}
                          action={investOrkWaaaghScrapFormAction}
                        >
                          <input
                            type="hidden"
                            name="kind"
                            value={investment.kind}
                          />
                          <button
                            type="submit"
                            disabled={!investment.canActivate}
                            title={investment.disabledReason ?? undefined}
                          >
                            {investment.active
                              ? `${investment.label} active`
                              : `${investment.label} (${investment.scrapCost} Scrap)`}
                          </button>
                          <p className={styles.muted}>
                            {investment.description}
                          </p>
                        </form>
                      )
                    )}
                  </div>
                </article>

                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Boss Orders</strong>
                    <span>
                      {playerSummary.raceBuffs.activeOrkBossOrder
                        ? `${playerSummary.raceBuffs.activeOrkBossOrder.label} active`
                        : "One at a time"}
                    </span>
                  </div>
                  {playerSummary.raceBuffs.activeOrkBossOrder ? (
                    <p className={styles.muted}>
                      {playerSummary.raceBuffs.activeOrkBossOrder.description}{" "}
                      Ends at{" "}
                      {playerSummary.raceBuffs.activeOrkBossOrder.activeUntil.toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                      .
                    </p>
                  ) : null}
                  <div className={styles.form}>
                    {playerSummary.raceBuffs.orkBossOrders.map((order) => (
                      <form
                        key={order.kind}
                        action={activateOrkBossOrderFormAction}
                      >
                        <input type="hidden" name="kind" value={order.kind} />
                        <button
                          type="submit"
                          disabled={!order.canActivate}
                          title={order.disabledReason ?? undefined}
                        >
                          {order.label} ({order.scrapCost} Scrap,{" "}
                          {order.goldCost} gold)
                        </button>
                        <p className={styles.muted}>{order.description}</p>
                      </form>
                    ))}
                  </div>
                </article>
              </div>
            ) : null}
            {playerSummary.legacyAbilitiesEnabled &&
            playerSummary.race === "SPACE_MURINES" ? (
              <form action={activateStimFormAction}>
                <button
                  type="submit"
                  disabled={!playerSummary.raceBuffs.canActivateStim}
                >
                  Activate STIM
                </button>
              </form>
            ) : null}
            {playerSummary.legacyAbilitiesEnabled &&
            playerSummary.race === "UNSTABLE_UNICORNS" ? (
              <>
                <form action={activateUnicornShatteredRealityFormAction}>
                  <button
                    type="submit"
                    disabled={
                      !playerSummary.raceBuffs
                        .canActivateUnicornShatteredReality
                    }
                    title={shatteredRealityDisabledReason ?? undefined}
                  >
                    Trigger Shattered Reality (daily)
                  </button>
                </form>
                {shatteredRealityDisabledReason ? (
                  <p className={styles.muted}>
                    {shatteredRealityDisabledReason}
                  </p>
                ) : null}
                <p className={styles.muted}>
                  Rolls a random chaos boon: mirror armies, surge combat, or
                  boost economy for one hour.
                </p>
                {playerSummary.raceBuffs.unicornShatteredRealityHistory
                  .length > 0 ? (
                  <ul className={styles.compactList}>
                    {playerSummary.raceBuffs.unicornShatteredRealityHistory.map(
                      (roll, index) => (
                        <li key={`${roll.createdAt.toISOString()}-${index}`}>
                          {roll.outcome.replaceAll("_", " ")}:{" "}
                          {formatUnicornShatteredRealityImpact({
                            outcome: roll.outcome,
                            armyDelta: roll.armyDelta,
                            garrisonArmyDelta: roll.garrisonArmyDelta,
                            activeUntil: roll.activeUntil,
                          })}
                          .
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className={styles.muted}>
                    No Shattered Reality rolls recorded yet.
                  </p>
                )}
                {playerSummary.activeUnicornTeleport ? (
                  <p className={styles.muted}>
                    Temporary teleport active at{" "}
                    {playerSummary.activeUnicornTeleport.temporaryTile}; returns
                    home to {playerSummary.activeUnicornTeleport.originTile} at{" "}
                    {playerSummary.activeUnicornTeleport.returnAt.toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                    .
                    {playerSummary.activeUnicornTeleport.isReturnDelayed
                      ? " Return is delayed until the home tile is clear."
                      : ""}
                  </p>
                ) : null}
                {playerSummary.raceBuffs.hasUnicornTeleportToken ? (
                  <form action={useUnicornTeleportFormAction}>
                    <button
                      type="submit"
                      disabled={playerSummary.activeUnicornTeleport !== null}
                    >
                      Use Unicorn teleport (1 hour)
                    </button>
                  </form>
                ) : (
                  <>
                    <form action={claimUnicornTeleportFormAction}>
                      <button
                        type="submit"
                        disabled={
                          !playerSummary.raceBuffs.canClaimUnicornTeleport
                        }
                        title={unicornTeleportClaimDisabledReason ?? undefined}
                      >
                        Claim Unicorn teleport
                      </button>
                    </form>
                    {unicornTeleportClaimDisabledReason ? (
                      <p className={styles.muted}>
                        {unicornTeleportClaimDisabledReason}
                      </p>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
            {playerSummary.legacyAbilitiesEnabled &&
            playerSummary.race === "DWARFS" ? (
              <div className={styles.buildingGrid}>
                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Book of Grudges</strong>
                    <span>
                      {playerSummary.raceBuffs.dwarfGrudges.length} locked
                    </span>
                  </div>
                  <p>
                    Grudges add attack and defense pressure against chosen enemy
                    fortresses.
                  </p>
                  {playerSummary.raceBuffs.dwarfGrudges.length > 0 ? (
                    <ul className={styles.noteList}>
                      {playerSummary.raceBuffs.dwarfGrudges.map((grudge) => (
                        <li key={`${grudge.slot}-${grudge.targetFortressId}`}>
                          Slot {grudge.slot}: {grudge.targetName} (
                          {grudge.targetCommanderName}) x
                          {(1 + 0.25 * grudge.bonusMultiplier).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>No grudges locked yet.</p>
                  )}
                  {playerSummary.raceBuffs.canChooseDwarfGrudge ? (
                    <form
                      action={chooseDwarfGrudgeFormAction}
                      className={styles.form}
                    >
                      <label>
                        First target
                        <select name="targetFortressId" required>
                          <option value="">Choose target</option>
                          {targets
                            .filter(
                              (target) =>
                                !target.isNpc && target.id !== playerSummary.id
                            )
                            .map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="submit">Set first grudge</button>
                    </form>
                  ) : null}
                  {playerSummary.raceBuffs.canChooseDwarfTierThree ? (
                    <div className={styles.form}>
                      <form action={chooseDwarfTierThreeGrudgeFormAction}>
                        <input name="choice" type="hidden" value="double" />
                        <button type="submit">Double first grudge</button>
                      </form>
                      <form
                        action={chooseDwarfTierThreeGrudgeFormAction}
                        className={styles.form}
                      >
                        <label>
                          Second target
                          <select name="targetFortressId" required>
                            <option value="">Choose target</option>
                            {targets
                              .filter(
                                (target) =>
                                  !target.isNpc &&
                                  target.id !== playerSummary.id
                              )
                              .map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button type="submit">Set second grudge</button>
                      </form>
                    </div>
                  ) : null}
                </article>

                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Rune of Grudges</strong>
                    <span>
                      {playerSummary.dwarfRuneOfGrudges
                        ? "Active"
                        : playerSummary.raceBuffs.canActivateRuneOfGrudges
                          ? "Ready"
                          : `Locked: Tier ${playerSummary.raceBuffs.tier}`}
                    </span>
                  </div>
                  {playerSummary.dwarfRuneOfGrudges ? (
                    <>
                      <p>
                        Targeting {playerSummary.dwarfRuneOfGrudges.targetName}(
                        {playerSummary.dwarfRuneOfGrudges.targetCommanderName}).
                        Upkeep{" "}
                        {
                          playerSummary.dwarfRuneOfGrudges
                            .maintenanceGoldPerTick
                        }
                        gold per tick until{" "}
                        {formatTime(
                          playerSummary.dwarfRuneOfGrudges.activeUntil
                        )}
                        .
                      </p>
                      <small>
                        Rune fortress{" "}
                        {playerSummary.dwarfRuneOfGrudges.runeFortressId}
                        has {playerSummary.dwarfRuneOfGrudges.runeHealth} health
                        and
                        {playerSummary.dwarfRuneOfGrudges.runeArmy} army.
                      </small>
                      <form
                        action={reinforceDwarfRuneOfGrudgesFormAction}
                        className={styles.form}
                      >
                        <label>
                          Reinforcement army
                          <input
                            type="number"
                            name="sentArmy"
                            min={1}
                            max={playerSummary.army}
                            defaultValue={Math.min(Math.max(1, playerSummary.army), 10)}
                            required
                          />
                        </label>
                        <button type="submit" disabled={playerSummary.army < 1}>
                          Reinforce rune
                        </button>
                      </form>
                      <form
                        action={cancelDwarfRuneOfGrudgesFormAction}
                        className={styles.form}
                      >
                        <p className={styles.muted}>
                          Canceling ends suppression immediately and gives no refund.
                        </p>
                        <button type="submit">Cancel rune</button>
                      </form>
                    </>
                  ) : (
                    <form
                      action={activateDwarfRuneOfGrudgesFormAction}
                      className={styles.form}
                    >
                      <p className={styles.muted}>
                        Current race tier: {playerSummary.raceBuffs.tier}. You
                        control {playerSummary.raceBuffs.matchingTileCount}{" "}
                        mountain tiles. Rune of Grudges unlocks at Tier 2 ({
                          RACE_TIER_TILE_THRESHOLDS.tier2
                        } mountains).
                      </p>
                      <label>
                        Target fortress
                        <select name="targetFortressId" required>
                          <option value="">Choose target</option>
                          {targets
                            .filter(
                              (target) =>
                                !target.isNpc && target.id !== playerSummary.id
                            )
                            .map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className={styles.muted}>
                        Costs 250 gold upfront and 25 gold per tick while
                        active.
                      </p>
                      <button
                        type="submit"
                        disabled={
                          !playerSummary.raceBuffs.canActivateRuneOfGrudges
                        }
                      >
                        Raise Rune of Grudges
                      </button>
                    </form>
                  )}
                </article>

                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Deep Mining</strong>
                    <span>
                      {getDeepMiningStatus({
                        latest: playerSummary.raceBuffs.deepMiningLatest,
                        canActivate:
                          playerSummary.raceBuffs.canActivateDeepMining,
                      })}
                    </span>
                  </div>
                  <p>
                    Invest gold now and resolve the mine later. Bigger
                    commitments wait longer and can swing harder.
                  </p>
                  {playerSummary.raceBuffs.deepMiningHistory.length > 0 ? (
                    <ul className={styles.compactList}>
                      {playerSummary.raceBuffs.deepMiningHistory.map(
                        (expedition, index) => (
                          <li
                            key={`${expedition.createdAt.toISOString()}-${index}`}
                          >
                            {expedition.outcome.replaceAll("_", " ")}:
                            {expedition.resolvedAt
                              ? ` resolved at ${formatTime(expedition.resolvedAt)}`
                              : expedition.activeUntil
                                ? ` resolves at ${formatTime(expedition.activeUntil)}`
                                : " resolves later"}
                            {` (${formatDeepMiningImpact({
                              outcome: expedition.outcome,
                              committedGold: expedition.committedGold,
                              goldDelta: expedition.goldDelta,
                              armyDelta: expedition.armyDelta,
                              recruitmentQueueDelta:
                                expedition.recruitmentQueueDelta,
                              activeUntil: expedition.activeUntil,
                              resolvedAt: expedition.resolvedAt,
                            })})`}
                            .
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <p className={styles.muted}>
                      No deep mining expeditions recorded yet.
                    </p>
                  )}
                  <form
                    action={activateDwarfDeepMiningFormAction}
                    className={styles.form}
                  >
                    <label>
                      Gold commitment
                      <input
                        name="committedGold"
                        type="number"
                        min={150}
                        max={600}
                        step={25}
                        defaultValue={250}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!playerSummary.raceBuffs.canActivateDeepMining}
                    >
                      Start Deep Mining
                    </button>
                  </form>
                </article>
              </div>
            ) : null}
          </div>
        ) : playerSummary.canSelectRace ? (
          <div className={styles.raceGrid}>
            {RACE_DEFINITIONS.map((race) => (
              <form
                key={race.key}
                action={selectFortressRaceFormAction}
                className={styles.raceCard}
              >
                <input name="race" type="hidden" value={race.key} />
                <img
                  className={styles.raceChoiceToken}
                  src={RACE_TOKEN_PATHS[race.key]}
                  alt=""
                  aria-hidden="true"
                />
                <strong>{race.displayName}</strong>
                <p>{race.flavorText}</p>
                <p className={styles.muted}>{RACE_TIER_THRESHOLDS_LABEL}</p>
                <p className={styles.muted}>
                  Required biomes: {RACE_TIER_BIOME_REQUIREMENTS[race.key]}.
                </p>
                <button type="submit">Lock race</button>
              </form>
            ))}
          </div>
        ) : (
          <p className={styles.muted}>
            {playerSummary.raceSelectionLockedReason ??
              "Race selection is not open yet."}
          </p>
        )}
      </section>
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
        {playerSummary.race && (playerSummary.race && isFortressRace(playerSummary.race)) ? (
          <RaceSkillPanel
            skillState={{
              race: playerSummary.race,
              unlockedTiers: new Map(
                playerSummary.skillPurchases.map((p) => [p.path, p.tier])
              ),
              earnedPoints: playerSummary.skillPointsEarned,
              totalPurchased: playerSummary.skillPurchases.reduce((s, p) => s + p.tier, 0),
              playerLevel: playerSummary.level,
              tileCount: 0,
            }}
            onPurchase={async (pathKey) => {
              const result = await purchaseSkillTierAction(
                playerSummary.id,
                pathKey
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
