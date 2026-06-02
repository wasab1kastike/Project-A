"use client";

import Link from "next/link";
import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRefreshView } from "@/lib/refresh-helpers";
import { RaceSkillPanel } from "@/components/race-skill-panel";
import { PoliticsClient } from "@/app/politics/politics-client";

import {
  purchaseSkillNodeAction,
  setAllianceSupportPolicyAction,
  setMaxArmySizeAction,
  createBattalionAction,
  commitNukeComponentBidAction,
  launchNukeAction,
  equipCosmeticUnlockAction,
  openArcadeLootBoxAction,
  purchaseArcadeLootBoxAction,
  unequipCosmeticAction,
} from "@/app/game-actions";
import {
  ArcadeCosmeticSlot,
  ArcadeLootBoxType,
  CastleUpgradeSpecialization,
  NukeComponentKind,
} from "@/lib/prisma-client";
import type { ArcadeHubState } from "@/lib/game/arcade";
import { getArcadeLootBoxSkin } from "@/lib/game/constants";
import {
  getCosmeticSpriteStyle,
  type CosmeticSpriteSlot,
} from "@/lib/game/cosmetic-sprites";
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
} from "@/lib/game/pressure-workers";
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
import { getTradeWagonResourceLimit } from "@/lib/game/trading";
import styles from "./page.module.css";

type BuildingSpecialization = "POINTS" | "FOOD" | "MILITARY" | "DEFENSE" | "TRADE";

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
    BuildingSpecialization,
    number
  > | null;
  buildingUpgradeOptions: Record<
    BuildingSpecialization,
    {
      level: number;
      maxLevel: number | null;
      nextCost: number | null;
      nextDurationMinutes: number | null;
      canUpgrade: boolean;
    }
  > | null;
  tradeWagonResourceLimit: number;
  pendingUpgradeSpecializationLevel: number | null;
  activeCastleUpgradeProject: {
    level: number;
    specialization: BuildingSpecialization;
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
    tileCapacity: number;
    tilesHeld: number;
    tilesOverCapacity: number;
    activePriorityCount: number;
    leadingPriority: {
      tileId: string;
      progress: number;
      outputPerTick: number;
      rank: number;
      pressureThreshold: number;
    } | null;
    pressureThreshold: number;
    priorityLimit: number;
    priorityQueue: Array<{
      tileId: string;
      rank: number;
      ownerFortressId: string | null;
      targetKind: string;
      progress: number;
      pressureThreshold: number;
    }>;
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
    mode?: string | null;
    garrisonedAt: string | null;
    frontId: string | null;
  }>;
  warPolicy: {
    maxArmySize: number;
    guardPercent: number;
    defaultAggression: string;
    allianceSupportAttack: boolean;
    allianceSupportDefense: boolean;
  } | null;
  allianceWarRoom: {
    allianceBattalionArmy: number;
    allies: Array<{
      fortressId: string;
      name: string;
      commanderName: string;
      trustTier: number;
    }>;
    battlefields: Array<{
      id: string;
      targetLabel: string;
      alliedSide: "ATTACKER" | "DEFENDER" | null;
      allyName: string;
      opponentName: string;
      attackerArmyRemaining: number;
      defenderArmyRemaining: number;
    }>;
    outgoingReinforcements: Array<{
      id: string;
      armyAmount: number;
      arrivesAt: Date;
      side: "ATTACKER" | "DEFENDER" | null;
      allyName: string;
      targetLabel: string;
    }>;
  };
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

type NukeState = {
  round: {
    startsAt: Date;
    endsAt: Date;
    status: string;
    isOpen: boolean;
    bidsArePrivate: boolean;
    playerBids: Array<{
      id: string;
      componentKind: NukeComponentKind;
      label: string;
      amount: number;
      createdAt: Date;
    }>;
  };
  inventory: Record<NukeComponentKind, number>;
  completeNukeCount: number;
  canLaunch: boolean;
  launchGoldCost: number;
  launchDisabledReason: string | null;
  eligibleTargets: Array<{
    id: string;
    name: string;
    commanderName: string;
    level: number;
  }>;
} | null;

type CastleTab =
  | "OVERVIEW"
  | "ECONOMY"
  | "WAR_ROOM"
  | "NUKES"
  | "DIPLOMACY"
  | "SKILLS"
  | "SHOP";
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
  TRADE: null,
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
    TRADE: {
      name: "Trade Wagons",
      role: "Convoy capacity for gold and food shipments.",
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
    TRADE: {
      name: "Runed Cartworks",
      role: "Stone-ribbed wagons that haul proper tribute through rough roads.",
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
    TRADE: {
      name: "Glitter Caravan",
      role: "Sparkling wagons with suspiciously elastic cargo space.",
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
    TRADE: {
      name: "Convoy Command",
      role: "Logistics bays that move heavier cargo with cleaner manifests.",
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
    TRADE: {
      name: "Loot Wagons",
      role: "Big rolling piles of boards, wheels, and optimistic capacity.",
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
  "TRADE",
] as const satisfies readonly BuildingSpecialization[];

const EMPTY_BUILDING_COUNTS: Record<BuildingSpecialization, number> = {
  DEFENSE: 0,
  POINTS: 0,
  FOOD: 0,
  MILITARY: 0,
  TRADE: 0,
};

const BUILDING_SPRITE_FRAME_COUNT = 10;
const DEFAULT_BUILDING_SPRITES: Record<BuildingSpecialization, string> = {
  DEFENSE: "/assets/buildings/building-defense.png",
  POINTS: "/assets/buildings/building-points.png",
  FOOD: "/assets/buildings/building-food.png",
  MILITARY: "/assets/buildings/building-military.png",
  TRADE: "/assets/buildings/building-trade.png",
};
const BUILDING_SPRITES_BY_RACE: Record<
  FortressRace,
  Record<BuildingSpecialization, string>
> = {
  DWARFS: {
    DEFENSE: "/assets/buildings/building-dwarfs-defense.png",
    POINTS: "/assets/buildings/building-dwarfs-points.png",
    FOOD: "/assets/buildings/building-dwarfs-food.png",
    MILITARY: "/assets/buildings/building-dwarfs-military.png",
    TRADE: "/assets/buildings/building-dwarfs-trade.png",
  },
  ORKS: {
    DEFENSE: "/assets/buildings/building-orks-defense.png",
    POINTS: "/assets/buildings/building-orks-points.png",
    FOOD: "/assets/buildings/building-orks-food.png",
    MILITARY: "/assets/buildings/building-orks-military.png",
    TRADE: "/assets/buildings/building-orks-trade.png",
  },
  SPACE_MURINES: {
    DEFENSE: "/assets/buildings/building-space-murines-defense.png",
    POINTS: "/assets/buildings/building-space-murines-points.png",
    FOOD: "/assets/buildings/building-space-murines-food.png",
    MILITARY: "/assets/buildings/building-space-murines-military.png",
    TRADE: "/assets/buildings/building-space-murines-trade.png",
  },
  UNSTABLE_UNICORNS: {
    DEFENSE: "/assets/buildings/building-unstable-unicorns-defense.png",
    POINTS: "/assets/buildings/building-unstable-unicorns-points.png",
    FOOD: "/assets/buildings/building-unstable-unicorns-food.png",
    MILITARY: "/assets/buildings/building-unstable-unicorns-military.png",
    TRADE: "/assets/buildings/building-unstable-unicorns-trade.png",
  },
};

function getBuildingSpriteStyle(
  specialization: BuildingSpecialization,
  level: number,
  race: string | null
): CSSProperties {
  const frame = Math.min(
    Math.max(Math.trunc(level), 0),
    BUILDING_SPRITE_FRAME_COUNT - 1
  );
  const position =
    frame === 0 ? 0 : (frame / (BUILDING_SPRITE_FRAME_COUNT - 1)) * 100;
  const raceSprites =
    race && isFortressRace(race) ? BUILDING_SPRITES_BY_RACE[race] : null;

  return {
    backgroundImage: `url(${
      raceSprites?.[specialization] ?? DEFAULT_BUILDING_SPRITES[specialization]
    })`,
    backgroundPosition: `${position}% 0`,
  };
}

const RACE_TIER_BIOME_REQUIREMENTS: Record<FortressRace, string> = {
  DWARFS: "Mountains",
  ORKS: "Plains or Lake",
  SPACE_MURINES: "Sea or Coast",
  UNSTABLE_UNICORNS: "Marsh or Forest",
};

const RACE_TIER_THRESHOLDS_LABEL = "Tier 1/2/3 at 3/6/9 matching tiles";
const NUKE_COMPONENTS = [
  {
    kind: NukeComponentKind.FUEL,
    label: "Fuel",
    bidResource: "gold",
    sprite: "/assets/nukes/fuel.png",
  },
  {
    kind: NukeComponentKind.ROCKET,
    label: "Rocket",
    bidResource: "food",
    sprite: "/assets/nukes/rocket.png",
  },
  {
    kind: NukeComponentKind.WRATH_OF_A,
    label: "Wrath of A",
    bidResource: "army",
    sprite: "/assets/nukes/wrath-of-a.png",
  },
] as const;
const CASTLE_TABS = [
  { key: "OVERVIEW", label: "Overview" },
  { key: "ECONOMY", label: "Economy" },
  { key: "WAR_ROOM", label: "War Room" },
  { key: "NUKES", label: "Nukes" },
  { key: "DIPLOMACY", label: "Diplomacy" },
  { key: "SKILLS", label: "Skills" },
  { key: "SHOP", label: "Shop" },
] as const satisfies readonly { key: CastleTab; label: string }[];
const CASTLE_TAB_KEYS = new Set<CastleTab>(CASTLE_TABS.map((tab) => tab.key));
const RACE_TOKEN_PATHS: Partial<Record<FortressRace, string>> = {
  DWARFS: "/assets/token-dwarf.png",
  ORKS: "/assets/token-orks.png",
  SPACE_MURINES: "/assets/token-space-murines.png",
  UNSTABLE_UNICORNS: "/assets/token-unstable-unicorns.png",
};

function getVisibleBattalionMode(mode: string | null | undefined) {
  return mode ?? "GUARD";
}

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
    case "TRADE":
      return `Wagons carry ${getTradeWagonResourceLimit(level).toLocaleString()} gold+food`;
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
    case "TRADE": {
      const currentLimit = getTradeWagonResourceLimit(level);
      const nextLimit = getTradeWagonResourceLimit(level + 1);

      return `Wagon capacity ${currentLimit.toLocaleString()} -> ${nextLimit.toLocaleString()} gold+food.`;
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

function getShopSkinMeta(slot: ArcadeCosmeticSlot, variant: string) {
  const skin = getArcadeLootBoxSkin(slot, variant);

  return {
    name: skin?.name ?? variant,
    rarity: skin?.rarity ?? "Common",
  };
}

function toCosmeticSpriteSlot(slot: ArcadeCosmeticSlot): CosmeticSpriteSlot {
  return slot === ArcadeCosmeticSlot.FORTRESS ? "FORTRESS" : "UNIT";
}

function ShopSkinSprite({
  slot,
  variant,
  className,
}: {
  slot: ArcadeCosmeticSlot;
  variant: string | null | undefined;
  className: string;
}) {
  const spriteSlot = toCosmeticSpriteSlot(slot);
  const spriteStyle = getCosmeticSpriteStyle(spriteSlot, variant);

  return (
    <span
      className={className}
      data-slot={spriteSlot.toLowerCase()}
      data-empty={spriteStyle ? undefined : "true"}
      style={spriteStyle ?? undefined}
      aria-hidden="true"
    >
      {spriteStyle ? null : spriteSlot === "UNIT" ? "Unit" : "Keep"}
    </span>
  );
}

function ShopEquippedPreview({
  slot,
  variant,
}: {
  slot: ArcadeCosmeticSlot;
  variant: string | null;
}) {
  const meta = variant
    ? getShopSkinMeta(slot, variant)
    : {
        name: slot === ArcadeCosmeticSlot.UNIT ? "Default unit" : "Default keep",
        rarity: "Standard",
      };

  return (
    <article className={styles.shopPreviewCard}>
      <ShopSkinSprite
        slot={slot}
        variant={variant}
        className={styles.shopPreviewSprite}
      />
      <div>
        <span>
          {slot === ArcadeCosmeticSlot.UNIT ? "Selected unit" : "Selected keep"}
        </span>
        <strong>{meta.name}</strong>
        <small>{meta.rarity}</small>
      </div>
    </article>
  );
}

function CastleShopPanel({ shopState }: { shopState: ArcadeHubState | null }) {
  if (!shopState) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Shop</span>
        </div>
        <p className={styles.muted}>Loading shop data...</p>
      </section>
    );
  }

  const walletBalance = shopState.walletBalance ?? 0;
  const canAccessShop =
    shopState.canBuy ||
    shopState.canOpen ||
    shopState.unopenedPurchases.length > 0 ||
    shopState.ownedSkins.unit.length > 0 ||
    shopState.ownedSkins.fortress.length > 0;
  const unitCrateAffordable = walletBalance >= shopState.shop.unitCratePrice;
  const fortressCrateAffordable =
    walletBalance >= shopState.shop.fortressCratePrice;
  const equippedUnitSkin = shopState.ownedSkins.unit.some(
    (skin) => skin.equipped
  );
  const equippedFortressSkin = shopState.ownedSkins.fortress.some(
    (skin) => skin.equipped
  );

  if (!canAccessShop) {
    return (
      <section className={`${styles.panel} ${styles.shopConsole}`}>
        <div className={styles.shopStatusBar}>
          <div>
            <span>Shop</span>
            <strong>Locked</strong>
          </div>
          <div>
            <span>Wallet</span>
            <strong>{walletBalance.toLocaleString()} coins</strong>
          </div>
        </div>
        <p className={styles.muted}>
          {shopState.lockedMessage ??
            "Join the current cycle before buying crates or managing skins."}
        </p>
        <Link className={styles.textLink} href="/shop">
          Open full shop
        </Link>
      </section>
    );
  }

  return (
    <div className={styles.shopConsole}>
      <section className={styles.panel}>
        <div className={styles.shopStatusBar}>
          <div>
            <span>Wallet</span>
            <strong>{walletBalance.toLocaleString()} coins</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{shopState.canBuy ? "Open" : "Collection"}</strong>
          </div>
          <div>
            <span>Duplicate refund</span>
            <strong>{shopState.shop.duplicateRefund} coins</strong>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Selected skins</span>
          <strong>Preview</strong>
        </div>
        <div className={styles.shopPreviewGrid}>
          <ShopEquippedPreview
            slot={ArcadeCosmeticSlot.UNIT}
            variant={shopState.equippedSkins.unit}
          />
          <ShopEquippedPreview
            slot={ArcadeCosmeticSlot.FORTRESS}
            variant={shopState.equippedSkins.fortress}
          />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Crates</span>
          <strong>{shopState.unopenedPurchases.length} unopened</strong>
        </div>
        <div className={styles.shopCrateGrid}>
          <form
            className={styles.shopCrateCard}
            action={purchaseArcadeLootBoxAction}
          >
            <input type="hidden" name="returnTo" value="/castle" />
            <input
              type="hidden"
              name="crateType"
              value={ArcadeLootBoxType.UNIT}
            />
            <div className={styles.shopCrateArt} data-crate="unit">
              Unit
            </div>
            <div>
              <strong>Unit crate</strong>
              <p>Random unit skin for marching armies.</p>
            </div>
            <div className={styles.shopCrateFooter}>
              <span>{shopState.shop.unitCratePrice} coins</span>
              <button
                type="submit"
                disabled={!shopState.canBuy || !unitCrateAffordable}
              >
                Buy
              </button>
            </div>
          </form>

          <form
            className={styles.shopCrateCard}
            action={purchaseArcadeLootBoxAction}
          >
            <input type="hidden" name="returnTo" value="/castle" />
            <input
              type="hidden"
              name="crateType"
              value={ArcadeLootBoxType.FORTRESS}
            />
            <div className={styles.shopCrateArt} data-crate="fortress">
              Keep
            </div>
            <div>
              <strong>Fortress crate</strong>
              <p>Random fortress skin for your map stronghold.</p>
            </div>
            <div className={styles.shopCrateFooter}>
              <span>{shopState.shop.fortressCratePrice} coins</span>
              <button
                type="submit"
                disabled={!shopState.canBuy || !fortressCrateAffordable}
              >
                Buy
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Unopened</span>
          <strong>{shopState.unopenedPurchases.length} crates</strong>
        </div>
        {shopState.unopenedPurchases.length > 0 ? (
          <div className={styles.shopPurchaseList}>
            {shopState.unopenedPurchases.map((purchase) => (
              <form
                action={openArcadeLootBoxAction}
                className={styles.shopPurchaseRow}
                key={purchase.id}
              >
                <input type="hidden" name="returnTo" value="/castle" />
                <input type="hidden" name="purchaseId" value={purchase.id} />
                <div>
                  <strong>
                    {purchase.crateType === ArcadeLootBoxType.UNIT
                      ? "Unit crate"
                      : "Fortress crate"}
                  </strong>
                  <span>
                    Bought {formatTime(purchase.createdAt)} for{" "}
                    {purchase.price} coins
                  </span>
                </div>
                {shopState.canOpen ? <button type="submit">Open</button> : null}
              </form>
            ))}
          </div>
        ) : (
          <p className={styles.muted}>No unopened crates right now.</p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Inventory</span>
          <strong>
            {shopState.ownedSkins.unit.length +
              shopState.ownedSkins.fortress.length}{" "}
            skins
          </strong>
        </div>
        <div className={styles.shopInventoryGrid}>
          <div className={styles.shopInventoryColumn}>
            <div className={styles.shopInventoryHeader}>
              <strong>Unit skins</strong>
              {equippedUnitSkin ? (
                <form action={unequipCosmeticAction}>
                  <input type="hidden" name="returnTo" value="/castle" />
                  <input
                    type="hidden"
                    name="slot"
                    value={ArcadeCosmeticSlot.UNIT}
                  />
                  <button type="submit">Use default</button>
                </form>
              ) : null}
            </div>
            {shopState.ownedSkins.unit.length > 0 ? (
              <div className={styles.shopSkinList}>
                {shopState.ownedSkins.unit.map((skin) => {
                  const meta = getShopSkinMeta(
                    ArcadeCosmeticSlot.UNIT,
                    skin.variant
                  );

                  return (
                    <div className={styles.shopSkinRow} key={skin.id}>
                      <div className={styles.shopSkinSummary}>
                        <ShopSkinSprite
                          slot={ArcadeCosmeticSlot.UNIT}
                          variant={skin.variant}
                          className={styles.shopSkinThumb}
                        />
                        <div>
                          <strong>{meta.name}</strong>
                          <span>
                            <small data-rarity={meta.rarity}>
                              {meta.rarity}
                            </small>
                            {skin.equipped ? <small>Equipped</small> : null}
                          </span>
                        </div>
                      </div>
                      {!skin.equipped ? (
                        <form action={equipCosmeticUnlockAction}>
                          <input type="hidden" name="returnTo" value="/castle" />
                          <input
                            type="hidden"
                            name="unlockId"
                            value={skin.id}
                          />
                          <input
                            type="hidden"
                            name="slot"
                            value={ArcadeCosmeticSlot.UNIT}
                          />
                          <button type="submit">Equip</button>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.muted}>No unit skins unlocked yet.</p>
            )}
          </div>

          <div className={styles.shopInventoryColumn}>
            <div className={styles.shopInventoryHeader}>
              <strong>Fortress skins</strong>
              {equippedFortressSkin ? (
                <form action={unequipCosmeticAction}>
                  <input type="hidden" name="returnTo" value="/castle" />
                  <input
                    type="hidden"
                    name="slot"
                    value={ArcadeCosmeticSlot.FORTRESS}
                  />
                  <button type="submit">Use default</button>
                </form>
              ) : null}
            </div>
            {shopState.ownedSkins.fortress.length > 0 ? (
              <div className={styles.shopSkinList}>
                {shopState.ownedSkins.fortress.map((skin) => {
                  const meta = getShopSkinMeta(
                    ArcadeCosmeticSlot.FORTRESS,
                    skin.variant
                  );

                  return (
                    <div className={styles.shopSkinRow} key={skin.id}>
                      <div className={styles.shopSkinSummary}>
                        <ShopSkinSprite
                          slot={ArcadeCosmeticSlot.FORTRESS}
                          variant={skin.variant}
                          className={styles.shopSkinThumb}
                        />
                        <div>
                          <strong>{meta.name}</strong>
                          <span>
                            <small data-rarity={meta.rarity}>
                              {meta.rarity}
                            </small>
                            {skin.equipped ? <small>Equipped</small> : null}
                          </span>
                        </div>
                      </div>
                      {!skin.equipped ? (
                        <form action={equipCosmeticUnlockAction}>
                          <input type="hidden" name="returnTo" value="/castle" />
                          <input
                            type="hidden"
                            name="unlockId"
                            value={skin.id}
                          />
                          <input
                            type="hidden"
                            name="slot"
                            value={ArcadeCosmeticSlot.FORTRESS}
                          />
                          <button type="submit">Equip</button>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.muted}>No fortress skins unlocked yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function CastleManagement({
  playerSummary,
  targets,
  politicsState,
  shopState,
  nukeState,
}: {
  playerSummary: PlayerSummary;
  targets: CommandTarget[];
  politicsState: any;
  shopState: ArcadeHubState | null;
  nukeState: NukeState;
}) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab")?.toUpperCase();
  const initialTab =
    requestedTab && CASTLE_TAB_KEYS.has(requestedTab as CastleTab)
      ? (requestedTab as CastleTab)
      : "OVERVIEW";
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
  const [activeTab, setActiveTab] = useState<CastleTab>(initialTab);
  const [maxArmySize, setMaxArmySize] = useState(
    playerSummary.warPolicy?.maxArmySize ?? 500
  );
  const [allianceSupportAttack, setAllianceSupportAttack] = useState(
    playerSummary.warPolicy?.allianceSupportAttack ?? true
  );
  const [allianceSupportDefense, setAllianceSupportDefense] = useState(
    playerSummary.warPolicy?.allianceSupportDefense ?? true
  );
  const [battalionPending, setBattalionPending] = useState(false);
  const [nukeBidAmounts, setNukeBidAmounts] = useState<
    Record<NukeComponentKind, number>
  >({
    [NukeComponentKind.FUEL]: 1000,
    [NukeComponentKind.ROCKET]: 1000,
    [NukeComponentKind.WRATH_OF_A]: 100,
  });
  const [nukePending, setNukePending] = useState<string | null>(null);
  const [nukeTargetId, setNukeTargetId] = useState(
    nukeState?.eligibleTargets[0]?.id ?? ""
  );

  const handleMaxArmySizeChange = useCallback(
    async (value: number) => {
      setMaxArmySize(value);
      const result = await setMaxArmySizeAction({
        fortressId: playerSummary.id,
        maxArmySize: value,
      });
      await handleInlineResult(result);
    },
    [playerSummary.id]
  );

  const saveAllianceSupportPolicy = useCallback(
    async (next?: {
      supportAttack?: boolean;
      supportDefense?: boolean;
    }) => {
      const result = await setAllianceSupportPolicyAction({
        supportAttack: next?.supportAttack ?? allianceSupportAttack,
        supportDefense: next?.supportDefense ?? allianceSupportDefense,
      });
      await handleInlineResult(result);
    },
    [allianceSupportAttack, allianceSupportDefense]
  );

  const handleCreateBattalion = useCallback(async () => {
    setBattalionPending(true);
    try {
      const result = await createBattalionAction({
        fortressId: playerSummary.id,
      });
      await handleInlineResult(result);
    } finally {
      setBattalionPending(false);
    }
  }, [playerSummary.id]);

  const handleNukeBid = useCallback(
    async (componentKind: NukeComponentKind) => {
      setNukePending(`bid:${componentKind}`);
      try {
        const result = await commitNukeComponentBidAction(
          componentKind,
          nukeBidAmounts[componentKind] ?? 0
        );
        await handleInlineResult(result);
      } finally {
        setNukePending(null);
      }
    },
    [nukeBidAmounts]
  );

  const handleNukeLaunch = useCallback(async () => {
    if (!nukeTargetId) return;
    setNukePending("launch");
    try {
      const result = await launchNukeAction(nukeTargetId);
      await handleInlineResult(result);
    } finally {
      setNukePending(null);
    }
  }, [nukeTargetId]);

  const buildings = getBuildingsForRace(playerSummary.race);
  const raceTokenPath =
    playerSummary.race &&
    playerSummary.race &&
    isFortressRace(playerSummary.race!)
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

  async function handleInlineResult(
    result: { ok: true } | { ok: false; error: string }
  ) {
    if (!result.ok) {
      window.alert(result.error);
      return;
    }

    refreshView();
  }

  async function buyPointsWithGoldFormAction(
    formData: FormData
  ): Promise<void> {
    const goldAmount = Number(getStringValue(formData, "goldAmount"));
    await handleInlineResult(
      await buyPointsWithGoldAction(
        Number.isFinite(goldAmount) ? goldAmount : 0
      )
    );
  }

  async function purchaseFortressUpgradeFormAction(
    formData: FormData
  ): Promise<void> {
    await handleInlineResult(
      await purchaseFortressUpgradeAction(
        getStringValue(formData, "specialization")
      )
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

  async function activateOrkBossOrderFormAction(
    formData: FormData
  ): Promise<void> {
    const kind = getStringValue(formData, "kind");
    await handleInlineResult(await activateOrkBossOrderAction(kind as never));
  }

  async function investOrkWaaaghScrapFormAction(
    formData: FormData
  ): Promise<void> {
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

  async function chooseDwarfGrudgeFormAction(
    formData: FormData
  ): Promise<void> {
    await handleInlineResult(
      await chooseDwarfGrudgeAction(
        getStringValue(formData, "targetFortressId")
      )
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

  async function selectFortressRaceFormAction(
    formData: FormData
  ): Promise<void> {
    await handleInlineResult(
      await selectFortressRaceAction(getStringValue(formData, "race"))
    );
  }

  async function selectFortressDoctrineFormAction(
    formData: FormData
  ): Promise<void> {
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
              <form
                action={buyPointsWithGoldFormAction}
                className={styles.form}
              >
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
                        Number.isFinite(value)
                          ? Math.max(0, Math.floor(value))
                          : 0
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
                <strong>
                  {playerSummary.ownedTileSummary.totalTileCount} tiles
                </strong>
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
                  <dd>
                    +{playerSummary.ownedTileSummary.defenseBonusPercent}%
                  </dd>
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
                    {playerSummary.expansionSummary.tilesHeld} /{" "}
                    {playerSummary.expansionSummary.tileCapacity} tiles held
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
                      {playerSummary.expansionSummary.pressureOutput} pressure
                      per tick. Capacity includes 8 claimed tiles without
                      workers, plus worker and bonus support, for{" "}
                      {playerSummary.expansionSummary.tileCapacity} total.
                    </p>
                  </div>
                </div>
                {playerSummary.expansionSummary.tilesOverCapacity > 0 ? (
                  <p className={styles.warning}>
                    {playerSummary.expansionSummary.tilesOverCapacity}{" "}
                    {playerSummary.expansionSummary.tilesOverCapacity === 1
                      ? "tile is"
                      : "tiles are"}{" "}
                    above tile capacity and will decay toward neutral.
                  </p>
                ) : null}
                {playerSummary.expansionSummary.leadingPriority ? (
                  <div className={styles.progressRow}>
                    <div className={styles.statusRow}>
                      <span>Leading claim</span>
                      <strong>
                        #{playerSummary.expansionSummary.leadingPriority.rank}{" "}
                        Tile{" "}
                        {playerSummary.expansionSummary.leadingPriority.tileId}
                      </strong>
                    </div>
                    <progress
                      max={playerSummary.expansionSummary.pressureThreshold}
                      value={
                        playerSummary.expansionSummary.leadingPriority.progress
                      }
                    />
                    <div className={styles.statusRow}>
                      <span>
                        {
                          playerSummary.expansionSummary.leadingPriority
                            .progress
                        }{" "}
                        / {playerSummary.expansionSummary.pressureThreshold}
                      </span>
                      {playerSummary.expansionSummary
                        .estimatedMinutesRemaining !== null ? (
                        <small>
                          {formatEstimate(
                            playerSummary.expansionSummary
                              .estimatedMinutesRemaining
                          )}{" "}
                          at current uncontested allocation
                        </small>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className={styles.muted}>
                    No neutral tile currently prioritized.
                  </p>
                )}
                {playerSummary.expansionSummary.priorityQueue.length > 0 ? (
                  <div className={styles.statusList}>
                    <div className={styles.statusRow}>
                      <span>Queue</span>
                      <strong>
                        {playerSummary.expansionSummary.activePriorityCount} /{" "}
                        {playerSummary.expansionSummary.priorityLimit}
                      </strong>
                    </div>
                    {playerSummary.expansionSummary.priorityQueue.map(
                      (priority) => (
                        <div className={styles.statusRow} key={priority.tileId}>
                          <span>
                            #{priority.rank} Tile {priority.tileId}
                          </span>
                          <strong>
                            {priority.targetKind === "WAR"
                              ? "War target"
                              : `${priority.progress} / ${priority.pressureThreshold}`}
                          </strong>
                        </div>
                      )
                    )}
                  </div>
                ) : null}
                {playerSummary.expansionSummary.decayingPressureCount > 0 ? (
                  <p className={styles.warning}>
                    {playerSummary.expansionSummary.decayingPressureCount}{" "}
                    unsupported pressure{" "}
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
                    playerSummary.castleSpecializationCounts?.[building.key] ??
                    0;
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
                    playerSummary.buildingUpgradeOptions?.[building.key] ??
                    null;
                  const activeProject =
                    playerSummary.activeCastleUpgradeProject?.specialization ===
                    building.key
                      ? playerSummary.activeCastleUpgradeProject
                      : null;

                  return (
                    <article key={building.key} className={styles.buildingCard}>
                      <div className={styles.buildingCardHeader}>
                        <span
                          className={styles.buildingSpriteShell}
                          data-building={building.key.toLowerCase()}
                          data-upgrading={activeProject ? "true" : undefined}
                        >
                          <span
                            aria-hidden="true"
                            className={styles.buildingSprite}
                            style={getBuildingSpriteStyle(
                              building.key,
                              buildingLevel,
                              playerSummary.race
                            )}
                          />
                        </span>
                        <span className={styles.buildingCardTitle}>
                          <strong>{building.name}</strong>
                          <span>Level {buildingLevel}</span>
                        </span>
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
                        <small>
                          Workers: {workers[building.workerKey]} assigned
                        </small>
                      ) : null}
                      {activeProject ? (
                        <p className={styles.muted}>
                          Upgrading to level {activeProject.level}; completes at{" "}
                          {formatTime(activeProject.completesAt)}.
                        </p>
                      ) : playerSummary.upgradesUnlocked &&
                        upgradeOption !== null &&
                        upgradeOption.nextCost !== null &&
                        playerSummary.pendingUpgradeSpecializationLevel ===
                          null ? (
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
                  One building can be under construction at a time. Gold has
                  already been spent for the active upgrade.
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
                      setWorker(
                        "minersAssigned",
                        event.currentTarget.valueAsNumber
                      )
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
                      setWorker(
                        "farmersAssigned",
                        event.currentTarget.valueAsNumber
                      )
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
                  {production.foodProduced} food, {production.armyRequested}{" "}
                  queue capacity, -{recruitmentDisplay.armyUpkeep} food upkeep.
                  If unpaid, active army loses{" "}
                  {recruitmentDisplay.starvationAttritionPercent}%.
                </p>
                {workerError ? (
                  <p className={styles.error}>{workerError}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={workerPending || !playerSummary.race}
                >
                  Save workers
                </button>
              </form>
            </section>
          </>
        ) : null}

        {activeTab === "WAR_ROOM" ? (
          <>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span>Alliance Support</span>
                <strong>
                  {playerSummary.allianceWarRoom.allianceBattalionArmy.toLocaleString()}{" "}
                  ready
                </strong>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: 13,
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allianceSupportDefense}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setAllianceSupportDefense(checked);
                        void saveAllianceSupportPolicy({
                          supportDefense: checked,
                        });
                      }}
                    />
                    Defend allies
                  </label>
                  <label
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allianceSupportAttack}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setAllianceSupportAttack(checked);
                        void saveAllianceSupportPolicy({
                          supportAttack: checked,
                        });
                      }}
                    />
                    Join allied attacks
                  </label>
                </div>
                <p className={styles.muted} style={{ fontSize: 12, margin: 0 }}>
                  Battalions set to ALLIANCE automatically march to allied
                  active battlefields on the enabled sides.
                </p>
              </div>

              <div className={styles.operationGroup} style={{ marginTop: 10 }}>
                <div className={styles.operationTitle}>
                  <strong>Allies</strong>
                </div>
                {playerSummary.allianceWarRoom.allies.length > 0 ? (
                  playerSummary.allianceWarRoom.allies.map((ally) => (
                    <div key={ally.fortressId} className={styles.statusRow}>
                      <span>{ally.name}</span>
                      <strong>Trust {ally.trustTier}</strong>
                    </div>
                  ))
                ) : (
                  <p className={styles.muted}>No active alliances.</p>
                )}
              </div>

              {playerSummary.allianceWarRoom.battlefields.length > 0 ? (
                <div className={styles.operationGroup}>
                  <div className={styles.operationTitle}>
                    <strong>Allied battlefields</strong>
                  </div>
                  {playerSummary.allianceWarRoom.battlefields.map(
                    (battlefield) => (
                      <div key={battlefield.id} className={styles.statusRow}>
                        <span>
                          {battlefield.allyName}{" "}
                          {battlefield.alliedSide === "ATTACKER"
                            ? "attacking"
                            : "defending"}{" "}
                          {battlefield.targetLabel}
                        </span>
                        <strong>
                          {battlefield.attackerArmyRemaining.toLocaleString()} /{" "}
                          {battlefield.defenderArmyRemaining.toLocaleString()}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              ) : null}

              {playerSummary.allianceWarRoom.outgoingReinforcements.length >
              0 ? (
                <div className={styles.operationGroup}>
                  <div className={styles.operationTitle}>
                    <strong>Support en route</strong>
                  </div>
                  {playerSummary.allianceWarRoom.outgoingReinforcements.map(
                    (unit) => (
                      <div key={unit.id} className={styles.statusRow}>
                        <span>
                          {unit.armyAmount.toLocaleString()} to {unit.allyName}{" "}
                          ({unit.side?.toLowerCase() ?? "support"})
                        </span>
                        <strong>
                          {new Date(unit.arrivesAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              ) : null}
            </section>

            {/* Battalion Roster */}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span>Battalions</span>
                <strong>{playerSummary.battalions?.length ?? 0} active</strong>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  margin: "4px 0 8px",
                  lineHeight: 1.5,
                }}
              >
                <strong>Reserves:</strong>{" "}
                {(() => {
                  const totalBn = (playerSummary.battalions ?? []).reduce(
                    (s, b) => s + b.size,
                    0
                  );
                  const reserves = Math.max(
                    0,
                    (playerSummary.army ?? 0) - totalBn
                  );
                  return `${reserves.toLocaleString()} unassigned`;
                })()}
                {" · "}
                Refill battalions with recruiters; they do not heal passively.
                {" · "}
                <strong>Tiers:</strong>{" "}
                <span title="1.0× dmg/def, max 500">Recruit</span> →{" "}
                <span title="1.15× dmg, 1.10× def, max 5k">Regular (1.5k)</span>{" "}
                →{" "}
                <span title="1.35× dmg, 1.25× def, max 15k">Veteran (5k)</span>{" "}
                → <span title="1.60× dmg, 1.45× def, max 50k">Elite (15k)</span>
              </div>
              {playerSummary.battalions &&
              playerSummary.battalions.length > 0 ? (
                <ul
                  style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}
                >
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
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <strong>{bn.name}</strong>
                        <span
                          style={{ color: "var(--text-muted)", fontSize: 12 }}
                        >
                          {bn.size}/{bn.maxSize} · Tier {bn.tier}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          fontSize: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <select
                          defaultValue={getVisibleBattalionMode(
                            (bn as any).mode
                          )}
                          onChange={async (e) => {
                            const selectEl = e.target as HTMLSelectElement;
                            const newMode = selectEl.value;
                            selectEl.disabled = true;
                            try {
                              const { setBattalionModeAction } =
                                await import("@/app/game-actions");
                              const result = await setBattalionModeAction({
                                battalionId: bn.id,
                                mode: newMode,
                              });
                              if (!result?.ok) {
                                selectEl.value = getVisibleBattalionMode(
                                  (bn as any).mode
                                );
                                console.error("Failed:", result?.error);
                              }
                            } catch (err) {
                              selectEl.value = getVisibleBattalionMode(
                                (bn as any).mode
                              );
                              console.error("Error:", err);
                            } finally {
                              selectEl.disabled = false;
                              refreshView();
                            }
                          }}
                          style={{
                            fontSize: 11,
                            padding: "1px 4px",
                            background:
                              getVisibleBattalionMode((bn as any).mode) === "ATTACK"
                                ? "#3a2a0a"
                                : getVisibleBattalionMode((bn as any).mode) ===
                                    "GUARD"
                                  ? "#123326"
                                  : getVisibleBattalionMode((bn as any).mode) ===
                                    "RESERVE"
                                    ? "#2a2a2a"
                                    : "#2a1a3a",
                            color:
                              getVisibleBattalionMode((bn as any).mode) === "ATTACK"
                                ? "#ffb040"
                                : getVisibleBattalionMode((bn as any).mode) ===
                                    "GUARD"
                                  ? "#62d39a"
                                  : getVisibleBattalionMode((bn as any).mode) ===
                                    "RESERVE"
                                    ? "#888"
                                    : "#c080ff",
                            border: "1px solid var(--border)",
                            borderRadius: 3,
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <option value="RESERVE">Reserve</option>
                          <option value="GUARD">Guard</option>
                          <option value="ATTACK">Attack</option>
                          <option value="ALLIANCE">Alliance</option>
                        </select>
                        <span style={{ color: "var(--text-muted)" }}>
                          {bn.size}/{bn.maxSize}
                        </span>
                        {bn.xp > 0 ? (
                          <span style={{ color: "#ffd700", fontSize: 11 }}>
                            {bn.xp} XP
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          display: "flex",
                          gap: 4,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
                          Max:
                        </span>
                        <input
                          type="number"
                          key={`${bn.id}-${bn.maxSize}`}
                          min={bn.size}
                          max={[500, 5000, 15000, 50000][bn.tier] ?? 500}
                          step={bn.tier >= 2 ? 1000 : bn.tier >= 1 ? 500 : 50}
                          defaultValue={bn.maxSize}
                          onBlur={async (e) => {
                            const v = Number(e.target.value);
                            const tierMax =
                              [500, 5000, 15000, 50000][bn.tier] ?? 500;
                            if (
                              Number.isFinite(v) &&
                              v >= bn.size &&
                              v <= tierMax &&
                              v !== bn.maxSize
                            ) {
                              const { expandBattalionAction } =
                                await import("@/app/game-actions");
                              await expandBattalionAction({
                                battalionId: bn.id,
                                targetMaxSize: v,
                              });
                              refreshView();
                            }
                          }}
                          style={{
                            width: 50,
                            padding: "1px 4px",
                            fontSize: 11,
                            background: "var(--bg-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: 3,
                            color: "var(--text)",
                          }}
                        />
                        {bn.tier < 3 ? (
                          (() => {
                            const baseCost =
                              [2000, 8000, 25000, 0][bn.tier] ?? 0;
                            const perUnit = bn.size * 8;
                            const totalCost = baseCost + perUnit;
                            return (
                              <button
                                type="button"
                                title={`Promote to tier ${bn.tier + 1}: ${totalCost.toLocaleString()} gold`}
                                onClick={async () => {
                                  const { promoteBattalionAction } =
                                    await import("@/app/game-actions");
                                  const result = await promoteBattalionAction({
                                    battalionId: bn.id,
                                  });
                                  if (result.ok) refreshView();
                                  else window.alert(result.error);
                                }}
                                disabled={bn.tier >= 3}
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  background: "var(--bg-raised)",
                                  border: "1px solid #ffd700",
                                  borderRadius: 3,
                                  color:
                                    bn.tier >= 3
                                      ? "var(--text-muted)"
                                      : "#ffd700",
                                  cursor: bn.tier >= 3 ? "default" : "pointer",
                                }}
                              >
                                Promote ({totalCost.toLocaleString()}g)
                              </button>
                            );
                          })()
                        ) : (
                          <span style={{ fontSize: 11, color: "#ffd700" }}>
                            MAX TIER
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !confirm(`Disband ${bn.name}? 50% gold refund.`)
                            )
                              return;
                            const { disbandBattalionAction } =
                              await import("@/app/game-actions");
                            await disbandBattalionAction({
                              battalionId: bn.id,
                            });
                            refreshView();
                          }}
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            background: "var(--bg-raised)",
                            border: "1px solid #f44336",
                            borderRadius: 3,
                            color: "#f44336",
                            cursor: "pointer",
                          }}
                        >
                          Disband
                        </button>
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
                  {playerSummary.warFronts?.filter(
                    (f) => f.status === "ADVANCING" || f.status === "STALLED"
                  ).length ?? 0}{" "}
                  active
                </strong>
              </div>

              {playerSummary.warFronts && playerSummary.warFronts.length > 0 ? (
                <ul
                  style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}
                >
                  {playerSummary.warFronts.map((front) => {
                    const frontBattalions =
                      playerSummary.battalions?.filter(
                        (b) => b.frontId === front.id
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
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                          }}
                        >
                          <strong
                            style={{
                              color:
                                front.status === "ADVANCING"
                                  ? "#4caf50"
                                  : front.status === "STALLED"
                                    ? "#ff9800"
                                    : "#888",
                            }}
                          >
                            vs.{" "}
                            {(targets as any[]).find(
                              (t: any) => t.id === front.enemyFortressId
                            )?.name ?? front.enemyFortressId}
                          </strong>
                          <span
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            {front.status}
                          </span>
                        </div>
                        {/* Aggression selector */}
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            Aggression:
                          </span>
                          <select
                            defaultValue={front.aggression}
                            onChange={async (e) => {
                              const newAggression = e.target.value;
                              try {
                                const { setFrontAggressionAction } =
                                  await import("@/app/game-actions");
                                const result = await setFrontAggressionAction({
                                  frontId: front.id,
                                  fortressId: playerSummary.id,
                                  aggression: newAggression,
                                });
                                if (!result.ok) alert(result.error);
                                refreshView();
                              } catch (err) {
                                alert("Failed to change aggression.");
                              }
                            }}
                            style={{
                              fontSize: 11,
                              padding: "1px 4px",
                              background: "var(--bg-raised)",
                              border: "1px solid var(--border)",
                              borderRadius: 3,
                              color: "var(--text)",
                            }}
                          >
                            <option value="CAUTIOUS">🟢 Cautious (30%)</option>
                            <option value="BALANCED">🟡 Balanced (60%)</option>
                            <option value="AGGRESSIVE">
                              🔴 Aggressive (100%)
                            </option>
                          </select>
                        </div>
                        {frontBattalions.length > 0 ? (
                          <div
                            style={{ fontSize: 12, color: "var(--text-muted)" }}
                          >
                            {frontBattalions.map((b) => (
                              <div
                                key={b.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                }}
                              >
                                <span>
                                  {b.name} ({b.size})
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const { removeBattalionFromFrontAction } =
                                      await import("@/app/game-actions");
                                    await removeBattalionFromFrontAction({
                                      battalionId: b.id,
                                      frontId: front.id,
                                    });
                                    refreshView();
                                  }}
                                  style={{
                                    fontSize: 11,
                                    padding: "0 4px",
                                    background: "none",
                                    border: "none",
                                    color: "#f44336",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            style={{ fontSize: 12, color: "var(--text-muted)" }}
                          >
                            No battalions assigned.
                          </div>
                        )}
                        <select
                          defaultValue=""
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            try {
                              const { assignBattalionToFrontAction } =
                                await import("@/app/game-actions");
                              const result = await assignBattalionToFrontAction(
                                {
                                  battalionId: e.target.value,
                                  frontId: front.id,
                                }
                              );
                              if (!result.ok) alert(result.error);
                              refreshView();
                            } catch (err) {
                              alert("Failed to assign battalion.");
                            }
                          }}
                          style={{
                            marginTop: 4,
                            width: "100%",
                            fontSize: 12,
                            padding: "2px 4px",
                            background: "var(--bg-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: 3,
                            color: "var(--text)",
                          }}
                        >
                          <option value="">Assign battalion…</option>
                          {(playerSummary.battalions ?? [])
                            .filter(
                              (b) =>
                                !b.frontId &&
                                getVisibleBattalionMode((b as any).mode) ===
                                  "ATTACK" &&
                                b.size > 0
                            )
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.size})
                              </option>
                            ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  No active war fronts. Go to <strong>Diplomacy</strong> tab →
                  declare war on a player. Battalions will auto-attack on the
                  next tick.
                </p>
              )}
            </section>

            {/* Army Settings */}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span>Army Settings</span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "4px 0",
                }}
              >
                <label
                  style={{
                    fontSize: 13,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Max army size</span>
                  <strong>{maxArmySize}</strong>
                </label>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: -4,
                  }}
                >
                  Projected upkeep at {maxArmySize} army: ~
                  {Math.ceil(maxArmySize / 100)} food/tick
                </p>
                <input
                  type="number"
                  min={100}
                  step={50}
                  value={maxArmySize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 100) {
                      setMaxArmySize(v);
                      handleMaxArmySizeChange(v);
                    }
                  }}
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
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  Set the army ceiling here. Use battalion modes and war front
                  aggression to decide how those troops are committed.
                </p>
              </div>
            </section>

            {/* Recruitment Queue */}
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span>Recruitment</span>
                <strong>Paid queue</strong>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  margin: "4px 0",
                }}
              >
                Assign recruiters in the Economy tab to refill commissioned
                battalions. Full battalions and the max army ceiling stop new
                recruits until you expand or commission more room.
              </p>
              <dl className={styles.readinessGrid}>
                <div>
                  <dt>Available army</dt>
                  <dd>{playerSummary.army}</dd>
                </div>
                <div>
                  <dt>Recruitment queue</dt>
                  <dd>{playerSummary.recruitmentQueue ?? 0}</dd>
                </div>
                <div>
                  <dt>Max army cap</dt>
                  <dd>{playerSummary.warPolicy?.maxArmySize ?? 500}</dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}

        {activeTab === "OVERVIEW" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Utility</span>
              <strong>Castle actions</strong>
            </div>
            <div className={styles.form}>
              <form
                action={renameFortressFormAction}
                className={styles.inlineForm}
              >
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

        {activeTab === "DIPLOMACY" ? (
          politicsState ? (
            <div className={styles.fullWidthPanel}>
              <PoliticsClient state={politicsState} />
            </div>
          ) : (
            <section className={`${styles.panel} ${styles.fullWidthPanel}`}>
              <div className={styles.panelHeader}>
                <span>Diplomacy</span>
                <strong>Politics & Trade</strong>
              </div>
              <p className={styles.muted}>Loading diplomacy data...</p>
            </section>
          )
        ) : null}

        {activeTab === "NUKES" ? (
          <section className={`${styles.panel} ${styles.nukeConsole}`}>
            <div className={styles.panelHeader}>
              <span>Nukes</span>
              <strong>{nukeState?.round.status ?? "offline"}</strong>
            </div>
            {nukeState ? (
              <>
                <div className={styles.nukeStatusStrip}>
                  <img
                    src="/assets/nukes/nuke-ready.png"
                    className={styles.nukeHeroSprite}
                    alt=""
                    aria-hidden="true"
                  />
                  <div>
                    <span className={styles.eyebrow}>
                      {nukeState.round.isOpen
                        ? "Bidding open"
                        : "Bidding closed"}
                    </span>
                    <strong>
                      {new Date(nukeState.round.startsAt).toLocaleString()} -{" "}
                      {new Date(nukeState.round.endsAt).toLocaleString()}
                    </strong>
                    <small>
                      Live bids are private. Only your own commitments are
                      shown.
                    </small>
                  </div>
                </div>

                <section className={styles.nukeStorage}>
                  <div className={styles.panelHeader}>
                    <span>Storage</span>
                    <strong>
                      {nukeState.completeNukeCount > 0
                        ? `${nukeState.completeNukeCount.toLocaleString()} ready`
                        : "parts held"}
                    </strong>
                  </div>
                  <div className={styles.nukeStorageRack}>
                    {NUKE_COMPONENTS.map((component) => {
                      const owned = nukeState.inventory[component.kind] ?? 0;
                      return (
                        <article
                          key={component.kind}
                          className={styles.nukeStorageCell}
                          data-ready={owned > 0 ? "true" : "false"}
                        >
                          <img
                            src={component.sprite}
                            className={styles.nukeStorageSprite}
                            alt=""
                            aria-hidden="true"
                          />
                          <div>
                            <strong>{component.label}</strong>
                            <span>{owned.toLocaleString()} stockpiled</span>
                          </div>
                        </article>
                      );
                    })}
                    <article
                      className={styles.nukeStorageCell}
                      data-ready={nukeState.canLaunch ? "true" : "false"}
                    >
                      <img
                        src="/assets/nukes/nuke-ready.png"
                        className={styles.nukeStorageSprite}
                        alt=""
                        aria-hidden="true"
                      />
                      <div>
                        <strong>Completed nuke</strong>
                        <span>
                          {nukeState.completeNukeCount > 0
                            ? `${nukeState.completeNukeCount.toLocaleString()} ready`
                            : "Incomplete"}
                        </span>
                      </div>
                    </article>
                  </div>
                </section>

                <section className={styles.nukeMarket}>
                  <div className={styles.panelHeader}>
                    <span>Daily market</span>
                    <strong>
                      {nukeState.round.isOpen ? "accepting bids" : "closed"}
                    </strong>
                  </div>
                  <div className={styles.nukeMarketGrid}>
                    {NUKE_COMPONENTS.map((component) => {
                      const ownBids = nukeState.round.playerBids.filter(
                        (bid) => bid.componentKind === component.kind
                      );
                      const committedTotal = ownBids.reduce(
                        (sum, bid) => sum + bid.amount,
                        0
                      );
                      return (
                        <article
                          key={component.kind}
                          className={styles.nukeBidCard}
                        >
                          <div className={styles.nukeBidHeader}>
                            <img
                              src={component.sprite}
                              className={styles.nukeBidSprite}
                              alt=""
                              aria-hidden="true"
                            />
                            <div>
                              <strong>{component.label}</strong>
                              <small>
                                Highest private {component.bidResource}{" "}
                                commitment wins.
                              </small>
                            </div>
                          </div>
                          <div className={styles.nukeBidMeta}>
                            <span>
                              Owned{" "}
                              {(
                                nukeState.inventory[component.kind] ?? 0
                              ).toLocaleString()}
                            </span>
                            <span>
                              Committed {committedTotal.toLocaleString()}
                            </span>
                          </div>
                          <label className={styles.nukeBidField}>
                            <span>Bid {component.bidResource}</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={nukeBidAmounts[component.kind] ?? 1}
                              disabled={!nukeState.round.isOpen}
                              onChange={(event) =>
                                setNukeBidAmounts((current) => ({
                                  ...current,
                                  [component.kind]: Math.max(
                                    1,
                                    Number(event.target.value) || 1
                                  ),
                                }))
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className={styles.nukeActionButton}
                            disabled={
                              !nukeState.round.isOpen ||
                              nukePending === `bid:${component.kind}`
                            }
                            onClick={() => void handleNukeBid(component.kind)}
                          >
                            {nukePending === `bid:${component.kind}`
                              ? "Committing..."
                              : `Commit ${component.bidResource}`}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.nukeLaunchPanel}>
                  <div className={styles.panelHeader}>
                    <span>Launch</span>
                    <strong>
                      {nukeState.launchGoldCost.toLocaleString()} gold
                    </strong>
                  </div>
                  <label className={styles.nukeBidField}>
                    <span>Target</span>
                    <select
                      value={nukeTargetId}
                      onChange={(event) => setNukeTargetId(event.target.value)}
                    >
                      {nukeState.eligibleTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name} - level {target.level + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  {nukeState.launchDisabledReason ? (
                    <p className={styles.muted}>
                      {nukeState.launchDisabledReason}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.nukeDangerButton}
                    disabled={
                      !nukeState.canLaunch ||
                      !nukeTargetId ||
                      nukePending === "launch"
                    }
                    onClick={() => void handleNukeLaunch()}
                  >
                    {nukePending === "launch" ? "Launching..." : "Launch nuke"}
                  </button>
                </section>
              </>
            ) : (
              <p>Nuke bidding opens during Season 4 gameplay.</p>
            )}
          </section>
        ) : null}

        {activeTab === "SKILLS" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Skills</span>
              <strong>{playerSummary.race ?? "Choose a race"}</strong>
            </div>
            {playerSummary.race &&
            playerSummary.race &&
            isFortressRace(playerSummary.race!) ? (
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

        {activeTab === "SHOP" ? <CastleShopPanel shopState={shopState} /> : null}
      </div>
    </div>
  );
}
