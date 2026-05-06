"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  activateDwarfDeepMiningAction,
  activateStimAction,
  activateWaaaghAction,
  choosePendingUpgradeSpecializationAction,
  claimUnicornTeleportAction,
  purchaseFortressUpgradeAction,
  registerCommanderNameAction,
  renameFortressAction,
  selectFortressRaceAction,
  updateWorkerAssignmentAction,
  useUnicornTeleportAction,
} from "@/app/game-actions";
import {
  calculateTickProduction,
  validateWorkerAssignments,
} from "@/lib/game/balance";
import { RACE_DEFINITIONS } from "@/lib/game/races";
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
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
  race: string | null;
  canRename: boolean;
  canSetAction: boolean;
  locationShuffleCost: number | null;
  freeLocationShuffleAvailable: boolean;
  hasOutgoingAttackUnits: boolean;
  canShuffleLocation: boolean;
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
    canActivateStim: boolean;
    stimActiveUntil: Date | null;
    canClaimUnicornTeleport: boolean;
    hasUnicornTeleportToken: boolean;
    canActivateDeepMining: boolean;
  };
  activeUnicornTeleport: {
    originTile: string;
    temporaryTile: string;
    returnAt: Date;
    isReturnDelayed: boolean;
  } | null;
  ownedTileSummary: {
    totalTileCount: number;
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

const BUILDINGS = [
  {
    key: "DEFENSE",
    name: "Keep",
    role: "Command, population, and defensive structure.",
    workerKey: null,
  },
  {
    key: "POINTS",
    name: "Mine",
    role: "Gold generation and future mining tile bonuses.",
    workerKey: "minersAssigned",
  },
  {
    key: "FOOD",
    name: "Farm",
    role: "Food generation and army upkeep support.",
    workerKey: "farmersAssigned",
  },
  {
    key: "MILITARY",
    name: "Barracks",
    role: "Army production and future reinforcement bonuses.",
    workerKey: "recruitersAssigned",
  },
] as const;

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
  key: (typeof BUILDINGS)[number]["key"];
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
      return `+${production.armyProduced}/${production.armyRequested} army/tick from recruiters`;
    default:
      return `Level ${level}`;
  }
}

function BuildingChoiceFields() {
  return (
    <div className={styles.buildingChoiceGrid}>
      {BUILDINGS.map((building) => (
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
  const production = useMemo(
    () =>
      calculateTickProduction({
        level: playerSummary.level,
        race: playerSummary.race as never,
        food: playerSummary.food,
        castleSpecializations:
          playerSummary.castleSpecializationCounts ?? undefined,
        ...workers,
      }),
    [
      playerSummary.castleSpecializationCounts,
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
            <dt>Defense</dt>
            <dd>x{playerSummary.defenseMultiplier.toFixed(2)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Owned land</span>
          <strong>{playerSummary.ownedTileSummary.totalTileCount} tiles</strong>
        </div>
        <dl className={styles.statGrid}>
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
          Normal hexes feed castle ticks and score points; Home of A is tracked
          separately on the battlefield because its income can be shared.
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
          {BUILDINGS.map((building) => {
            const buildingLevel =
              playerSummary.castleSpecializationCounts?.[building.key] ?? 0;
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
            <BuildingChoiceFields />
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
            {production.foodProduced} food, +{production.armyProduced} army.
          </p>
          {workerError ? <p className={styles.error}>{workerError}</p> : null}
          <button type="submit" disabled={workerPending || !playerSummary.race}>
            Save workers
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
              <form action={activateWaaaghAction}>
                <button
                  type="submit"
                  disabled={!playerSummary.raceBuffs.canActivateWaaagh}
                >
                  Summon WAAAGH
                </button>
              </form>
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
              <form
                action={activateDwarfDeepMiningAction}
                className={styles.form}
              >
                <label>
                  Rune target
                  <select name="targetFortressId" required>
                    <option value="">Choose target</option>
                    {targets
                      .filter((target) => !target.isNpc)
                      .map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                  </select>
                </label>
                <input
                  name="committedArmy"
                  type="hidden"
                  value={Math.min(25, Math.max(1, playerSummary.army))}
                />
                <button
                  type="submit"
                  disabled={!playerSummary.raceBuffs.canActivateDeepMining}
                >
                  Activate Deep Mining
                </button>
              </form>
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
