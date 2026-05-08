"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  activateDwarfDeepMiningAction,
  activateDwarfRuneOfGrudgesAction,
  activateOrkBossOrderAction,
  chooseDwarfGrudgeAction,
  chooseDwarfTierThreeGrudgeAction,
  investOrkWaaaghScrapAction,
  activateStimAction,
  activateUnicornShatteredRealityAction,
  activateWaaaghAction,
  choosePendingUpgradeSpecializationAction,
  claimUnicornTeleportAction,
  purchaseFortressUpgradeAction,
  registerCommanderNameAction,
  renameFortressAction,
  recruitArmyAction,
  selectFortressRaceAction,
  updateWorkerAssignmentAction,
  useUnicornTeleportAction,
  buyPointsWithGoldAction,
} from "@/app/game-actions";
import {
  calculateTickProduction,
  validateWorkerAssignments,
} from "@/lib/game/balance";
import {
  calculateRecruitmentProgress,
  getArmyUpkeepCost,
  getRecruitmentCost,
} from "@/lib/game/army-recruitment";
import {
  RACE_DEFINITIONS,
  isFortressRace,
  type FortressRace,
} from "@/lib/game/races";
import {
  convertGoldToPoints,
  getGoldToPointsRatio,
} from "@/lib/game/currency";
import { getBuildingUpgradeComparison } from "@/lib/game/specializations";
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
  race: string | null;
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
    stimActiveUntil: Date | null;
    canClaimUnicornTeleport: boolean;
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
    defenseBonusPercent: number;
  };
  growPerTick: number;
};

type CommandTarget = {
  id: string;
  name: string;
  isNpc: boolean;
};

type BuildingSpecialization = "POINTS" | "FOOD" | "MILITARY" | "DEFENSE";
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
      const diff = projectedProduction.goldProduced - currentProduction.goldProduced;

      return `Gold per tick +${currentProduction.goldProduced} -> +${projectedProduction.goldProduced} (${diff >= 0 ? "+" : ""}${diff}/tick).`;
    }
    case "FOOD": {
      const diff = projectedProduction.foodProduced - currentProduction.foodProduced;

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

export function CastleManagement({
  playerSummary,
  targets,
}: {
  playerSummary: PlayerSummary;
  targets: CommandTarget[];
}) {
  const router = useRouter();
  const [workers, setWorkers] = useState({
    minersAssigned: playerSummary.minersAssigned,
    farmersAssigned: playerSummary.farmersAssigned,
    recruitersAssigned: playerSummary.recruitersAssigned,
  });
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [workerPending, setWorkerPending] = useState(false);
  const [recruitAmount, setRecruitAmount] = useState(10);
  const [recruitError, setRecruitError] = useState<string | null>(null);
  const [recruitPending, setRecruitPending] = useState(false);
  const [goldToConvert, setGoldToConvert] = useState(getGoldToPointsRatio());
  const buildings = getBuildingsForRace(playerSummary.race);
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
    ...workers,
  });
  const assigned =
    workers.minersAssigned +
    workers.farmersAssigned +
    workers.recruitersAssigned;
  const recruitmentProgress = calculateRecruitmentProgress(
    playerSummary.recruitmentQueue,
    workers.recruitersAssigned,
    playerSummary.race as never
  );
  const recruitCost = getRecruitmentCost(recruitAmount);
  const armyUpkeep = Math.floor(getArmyUpkeepCost(playerSummary.army));
  const pointsFromGold = convertGoldToPoints(goldToConvert);
  const canConvertGoldToPoints =
    pointsFromGold > 0 && goldToConvert > 0 && goldToConvert <= playerSummary.gold;

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

      router.refresh();
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

      router.refresh();
    } finally {
      setRecruitPending(false);
    }
  }

  return (
    <div className={styles.castleGrid}>
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
        <form action={buyPointsWithGoldAction} className={styles.form}>
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
            Rate: {getGoldToPointsRatio()} gold = 1 point. This converts {goldToConvert} gold into {pointsFromGold} points.
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
            <dt>Defense</dt>
            <dd>+{playerSummary.ownedTileSummary.defenseBonusPercent}%</dd>
          </div>
        </dl>
        <p className={styles.muted}>
          Normal hexes now feed gold and food, while temporary objectives and
          Home of A generate score income.
        </p>
      </section>

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
                  Next level: {getBuildingUpgradeBenefitPreview({
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
                    action={purchaseFortressUpgradeAction}
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
                      {upgradeOption?.maxLevel !== null
                        ? ` Max level: ${upgradeOption?.maxLevel}.`
                        : " Raises castle level cap."}
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
            action={choosePendingUpgradeSpecializationAction}
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
          <p className={styles.muted}>
            Tick preview: +{production.goldProduced} gold, +
            {production.foodProduced} food, {recruitmentProgress.recruiterCapacityPerTick} queue capacity, -{armyUpkeep} food upkeep.
          </p>
          {workerError ? <p className={styles.error}>{workerError}</p> : null}
          <button type="submit" disabled={workerPending || !playerSummary.race}>
            Save workers
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Recruitment</span>
          <strong>{playerSummary.recruitmentQueue} queued</strong>
        </div>
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
            Cost: {recruitCost} gold. Current queue finishes in{" "}
            {Number.isFinite(recruitmentProgress.ticksToComplete)
              ? `${recruitmentProgress.ticksToComplete} ticks`
              : "no ticks until recruiters are assigned"}
            .
          </p>
          {recruitError ? <p className={styles.error}>{recruitError}</p> : null}
          <button
            type="submit"
            disabled={
              recruitPending ||
              !playerSummary.race ||
              recruitCost > playerSummary.gold
            }
          >
            Recruit army
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Race</span>
          <strong>{playerSummary.race ?? "Choose"}</strong>
        </div>
        {playerSummary.race ? (
          <div className={styles.form}>
            {playerSummary.race === "ORKS" ? (
              <div className={styles.buildingGrid}>
                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Scrap Pile</strong>
                    <span>{playerSummary.raceBuffs.orkScrap} Scrap</span>
                  </div>
                  <p>
                    Earn Scrap from raids, tile wins, Home of A, and loot camps.
                    Spend it on Boss Orders or feed an active WAAAGH.
                  </p>
                  {playerSummary.raceBuffs.orkScrapEvents.length > 0 ? (
                    <ul className={styles.compactList}>
                      {playerSummary.raceBuffs.orkScrapEvents.map((event) => (
                        <li key={event.id}>
                          {event.delta > 0 ? "+" : ""}
                          {event.delta} Scrap: {event.reason.replaceAll("_", " ")}
                          {event.targetName ? ` vs ${event.targetName}` : ""}
                          {event.tileId ? ` on tile ${event.tileId}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>No Scrap has been recorded yet.</p>
                  )}
                </article>

                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>WAAAGH</strong>
                    <span>
                      {playerSummary.raceBuffs.waaaghActiveUntil
                        ? `Active until ${playerSummary.raceBuffs.waaaghActiveUntil.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Tier 3 daily"}
                    </span>
                  </div>
                  <form action={activateWaaaghAction}>
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
                          action={investOrkWaaaghScrapAction}
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
                      <form key={order.kind} action={activateOrkBossOrderAction}>
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
            {playerSummary.race === "SPACE_MURINES" ? (
              <form action={activateStimAction}>
                <button
                  type="submit"
                  disabled={!playerSummary.raceBuffs.canActivateStim}
                >
                  Activate STIM
                </button>
              </form>
            ) : null}
            {playerSummary.race === "UNSTABLE_UNICORNS" ? (
              <>
                <form action={activateUnicornShatteredRealityAction}>
                  <button
                    type="submit"
                    disabled={
                      !playerSummary.raceBuffs.canActivateUnicornShatteredReality
                    }
                  >
                    Trigger Shattered Reality (daily)
                  </button>
                </form>
                <p className={styles.muted}>
                  Rolls a random chaos omen: surge your forces, scatter
                  garrisons home with loss, or backfire your own army.
                </p>
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
                  <form action={useUnicornTeleportAction}>
                    <button
                      type="submit"
                      disabled={playerSummary.activeUnicornTeleport !== null}
                    >
                      Use Unicorn teleport (1 hour)
                    </button>
                  </form>
                ) : (
                  <form action={claimUnicornTeleportAction}>
                    <button
                      type="submit"
                      disabled={
                        !playerSummary.raceBuffs.canClaimUnicornTeleport
                      }
                    >
                      Claim Unicorn teleport
                    </button>
                  </form>
                )}
              </>
            ) : null}
            {playerSummary.race === "DWARFS" ? (
              <div className={styles.buildingGrid}>
                <article className={styles.buildingCard}>
                  <div className={styles.buildingCardHeader}>
                    <strong>Book of Grudges</strong>
                    <span>
                      {playerSummary.raceBuffs.dwarfGrudges.length} locked
                    </span>
                  </div>
                  <p>
                    Grudges add attack and defense pressure against chosen
                    enemy fortresses.
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
                    <p className={styles.muted}>
                      No grudges locked yet.
                    </p>
                  )}
                  {playerSummary.raceBuffs.canChooseDwarfGrudge ? (
                    <form
                      action={chooseDwarfGrudgeAction}
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
                      <button type="submit">
                        Set first grudge
                      </button>
                    </form>
                  ) : null}
                  {playerSummary.raceBuffs.canChooseDwarfTierThree ? (
                    <div className={styles.form}>
                      <form action={chooseDwarfTierThreeGrudgeAction}>
                        <input name="choice" type="hidden" value="double" />
                        <button type="submit">Double first grudge</button>
                      </form>
                      <form
                        action={chooseDwarfTierThreeGrudgeAction}
                        className={styles.form}
                      >
                        <label>
                          Second target
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
                        : "Ready"}
                    </span>
                  </div>
                  {playerSummary.dwarfRuneOfGrudges ? (
                    <>
                      <p>
                        Targeting {playerSummary.dwarfRuneOfGrudges.targetName}(
                        {playerSummary.dwarfRuneOfGrudges.targetCommanderName}).
                        Upkeep {playerSummary.dwarfRuneOfGrudges.maintenanceGoldPerTick}
                        gold per tick until {formatTime(
                          playerSummary.dwarfRuneOfGrudges.activeUntil
                        )}
                        .
                      </p>
                      <small>
                        Rune fortress {playerSummary.dwarfRuneOfGrudges.runeFortressId}
                        has {playerSummary.dwarfRuneOfGrudges.runeHealth} health and
                        {playerSummary.dwarfRuneOfGrudges.runeArmy} army.
                      </small>
                    </>
                  ) : (
                    <form
                      action={activateDwarfRuneOfGrudgesAction}
                      className={styles.form}
                    >
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
                      Costs 250 gold upfront and 25 gold per tick while active.
                    </p>
                      <button
                        type="submit"
                        disabled={!playerSummary.raceBuffs.canActivateRuneOfGrudges}
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
                      {playerSummary.raceBuffs.canActivateDeepMining
                        ? "Available"
                        : "Cooling down"}
                    </span>
                  </div>
                  <p>
                    Invest gold now and resolve the mine later. Bigger
                    commitments wait longer and can swing harder.
                  </p>
                  {playerSummary.raceBuffs.deepMiningLatest ? (
                    <small>
                      Last result: {playerSummary.raceBuffs.deepMiningLatest.outcome}
                      {playerSummary.raceBuffs.deepMiningLatest.resolvedAt
                        ? ` resolved at ${formatTime(
                            playerSummary.raceBuffs.deepMiningLatest.resolvedAt
                          )}.`
                        : playerSummary.raceBuffs.deepMiningLatest.activeUntil
                          ? ` resolves at ${formatTime(
                              playerSummary.raceBuffs.deepMiningLatest.activeUntil
                            )}.`
                          : " resolves later."}
                    </small>
                  ) : null}
                  <form
                    action={activateDwarfDeepMiningAction}
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
        ) : (
          <div className={styles.raceGrid}>
            {RACE_DEFINITIONS.map((race) => (
              <form
                key={race.key}
                action={selectFortressRaceAction}
                className={styles.raceCard}
              >
                <input name="race" type="hidden" value={race.key} />
                <strong>{race.displayName}</strong>
                <p>{race.flavorText}</p>
                <button type="submit">Lock race</button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Utility</span>
          <strong>Castle actions</strong>
        </div>
        <div className={styles.form}>
          {playerSummary.canRegisterCommanderName ? (
            <form
              action={registerCommanderNameAction}
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
          <form action={renameFortressAction} className={styles.inlineForm}>
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
    </div>
  );
}
