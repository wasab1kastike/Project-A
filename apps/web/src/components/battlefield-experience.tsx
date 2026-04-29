"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import {
  attackFromMapAction,
  recallAttackUnitAction,
  activateStimAction,
  activateWaaaghAction,
  chooseDwarfGrudgeAction,
  chooseDwarfTierThreeGrudgeAction,
  choosePendingUpgradeSpecializationAction,
  claimUnicornTeleportAction,
  editRegistrationFortressNameAction,
  markChatReadAction,
  purchaseFortressUpgradeAction,
  registerCommanderNameAction,
  renameFortressAction,
  selectFortressRaceAction,
  setFortressActionAction,
  updateWorkerAssignmentAction,
  shuffleFortressLocationAction,
  useUnicornTeleportAction,
} from "@/app/game-actions";
import {
  CARRY_CAPACITY_PER_SURVIVOR,
  calculateTickProduction,
  FOOD_COST_PER_ARMY,
  getDefenseBonusPercent,
  getDisplayedCastleLevel,
  validateWorkerAssignments,
} from "@/lib/game/balance";
import { formatRaidAttackPreview } from "@/lib/game/battle-report";
import {
  getRaceDefinition,
  getRaceModifiers,
  RACE_DEFINITIONS,
  type FortressRace,
} from "@/lib/game/races";
import { ChatPanel } from "./chat-panel";
import {
  FortressMap,
  type AttackUnitMarker,
  type MapFortress,
} from "./fortress-map";
import styles from "./battlefield-experience.module.css";

type CommandTarget = {
  id: string;
  commanderName: string;
  name: string;
  level: number;
  race: FortressRace | null;
  points: number;
  isNpc: boolean;
  health: number;
  maxHealth: number;
  currentAction: "GROW" | "ATTACK";
};

  type ChatProps = {
  messages: Array<{
    id: string;
    type: "TEXT" | "GIF";
    body: string;
    gif: {
      provider: string;
      providerId: string;
      title: string;
      previewUrl: string;
      displayUrl: string;
      width: number;
      height: number;
      sourceUrl: string;
    } | null;
    createdAt: Date;
    authorName: string;
    isCurrentUser: boolean;
  }>;
  canPost: boolean;
  maxLength: number;
  postHint: string | null;
  unreadCount: number;
  hasUnread: boolean;
    latestMessageAt: Date | null;
    persistsUnread: boolean;
  };

type PlayerSummary = {
  id: string;
  commanderName: string;
  canRegisterCommanderName: boolean;
  name: string;
  points: number;
  level: number;
  displayedCastleLevel: number;
  population: number;
  defenseMultiplier: number;
  food: number;
  army: number;
  minersAssigned: number;
  farmersAssigned: number;
  recruitersAssigned: number;
  race: FortressRace | null;
  currentAction: "GROW" | "ATTACK";
  currentTargetId?: string | null;
  currentTargetName?: string | null;
  isSlayerOfA?: boolean;
  isTestingPhase?: boolean;
  canRename: boolean;
  canSetAction: boolean;
  locationShuffleCost: number | null;
  freeLocationShuffleAvailable: boolean;
  hasOutgoingAttackUnits: boolean;
  outboundAttackUnitCount: number;
  maxSimultaneousAttacks: number;
  canShuffleLocation: boolean;
  upgradesUnlocked: boolean;
  nextUpgradeCost: number | null;
  canAffordUpgrade: boolean;
  canPurchaseUpgrade: boolean;
  castleSpecializationCounts: Record<
    "POINTS" | "FOOD" | "MILITARY" | "DEFENSE",
    number
  > | null;
  pendingUpgradeSpecializationLevel: number | null;
  raceBuffs: {
    tier: number;
    tierThreeUnlocksAt: Date | null;
    dwarfGrudges: Array<{
      targetFortressId: string;
      targetName: string;
      targetCommanderName: string;
      slot: number;
      bonusMultiplier: number;
    }>;
    canChooseDwarfGrudge: boolean;
    canChooseDwarfTierThree: boolean;
    canActivateWaaagh: boolean;
    waaaghActiveUntil: Date | null;
    canActivateStim: boolean;
    stimActiveUntil: Date | null;
    canClaimUnicornTeleport: boolean;
    hasUnicornTeleportToken: boolean;
    unicornTeleportTokenExpiresAt: Date | null;
  };
  receivedSlayerUpgrade: boolean;
  growPerTick: number;
  attackDamage: number;
};

type PlayerFortress = {
  id: string;
  commanderName: string;
  canRegisterCommanderName: boolean;
  name: string;
  points: number;
  level: number;
  race: FortressRace | null;
  currentAction: "GROW" | "ATTACK";
  mapX: number;
  mapY: number;
};

type BattleReport = {
  id: string;
  launchedAt: Date;
  resolvedAt: Date;
  attackerName: string;
  attackerCommanderName: string;
  attackerOwnerId: string;
  defenderName: string;
  defenderCommanderName: string;
  defenderOwnerId: string;
  sentArmy: number;
  defenderArmyEstimate: string;
  defenderDbLevel: number;
  defenseBonusPercent: number;
  defenseMultiplier: number;
  resolvedAttackPower: number;
  resolvedDefensePowerEstimate: string;
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN" | "RECALLED";
  attackerSurvivors: number;
  attackerRetired: number;
  attackerReturned: number;
  defenderLosses: number;
  pointsLooted: number;
  foodLooted: number;
  reportLines: string[];
};

type CastleTab = "ECONOMY" | "COMBAT" | "REPORTS" | "RACE";

const CASTLE_TABS = [
  { value: "ECONOMY", label: "Economy" },
  { value: "COMBAT", label: "Combat" },
  { value: "REPORTS", label: "Reports" },
  { value: "RACE", label: "Race" },
] as const satisfies readonly { value: CastleTab; label: string }[];

const CASTLE_SPECIALIZATION_OPTIONS = [
  { value: "POINTS", label: "Points", summary: "+10% point production" },
  { value: "FOOD", label: "Food", summary: "+10% food production" },
  { value: "MILITARY", label: "Military", summary: "+10% army production" },
  { value: "DEFENSE", label: "Defense", summary: "+10% defense" },
] as const;

function CastleSpecializationFields() {
  return (
    <div className={styles.specializationGrid}>
      {CASTLE_SPECIALIZATION_OPTIONS.map((option) => (
        <label key={option.value} className={styles.specializationOption}>
          <input name="specialization" type="radio" value={option.value} required />
          <span>
            <strong>{option.label}</strong>
            <small>{option.summary}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function RaceSelectionSection({
  currentRace,
  isTestingPhase = false,
}: {
  currentRace: FortressRace | null;
  isTestingPhase?: boolean;
}) {
  const selectedRace = getRaceDefinition(currentRace);

  return (
    <section className={styles.racePanel}>
      <div className={styles.sectionHeading}>
        <span className={styles.label}>Season race</span>
        <strong>{selectedRace ? "Locked" : "Choose once"}</strong>
      </div>
      {selectedRace ? (
        <article
          className={`${styles.raceCard} ${styles.raceCardSelected}`}
          data-race={selectedRace.key}
        >
          <div className={styles.raceBanner}>
            <span className={styles.raceIcon} aria-hidden="true">
              {selectedRace.iconPlaceholder}
            </span>
            <div>
              <h4>{selectedRace.displayName}</h4>
              <blockquote>{selectedRace.flavorQuote}</blockquote>
            </div>
          </div>
          <p>{selectedRace.flavorText}</p>
          <ul>
            {selectedRace.passiveSummary.map((passive) => (
              <li key={passive}>{passive}</li>
            ))}
          </ul>
          <small>
            {isTestingPhase
              ? "Testing pick only. Race resets before the real season."
              : "Race locked for this season."}
          </small>
        </article>
      ) : (
        <>
          <p className={styles.helper}>
            {isTestingPhase
              ? "Choose a sandbox race for testing. Race resets before the real season."
              : "Choose your race before active gameplay. This choice is locked for the whole season."}
          </p>
          <div className={styles.raceGrid}>
            {RACE_DEFINITIONS.map((race) => (
              <form
                key={race.key}
                action={selectFortressRaceAction}
                className={styles.raceCard}
                data-race={race.key}
              >
                <input name="race" type="hidden" value={race.key} />
                <div className={styles.raceBanner}>
                  <span className={styles.raceIcon} aria-hidden="true">
                    {race.iconPlaceholder}
                  </span>
                  <div>
                    <h4>{race.displayName}</h4>
                    <blockquote>{race.flavorQuote}</blockquote>
                  </div>
                </div>
                <p>{race.flavorText}</p>
                <ul>
                  {race.passiveSummary.map((passive) => (
                    <li key={passive}>{passive}</li>
                  ))}
                </ul>
                <button className={styles.secondaryButton} type="submit">
                  Lock {race.displayName}
                </button>
              </form>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function WorkerAssignmentSection({
  playerSummary,
}: {
  playerSummary: PlayerSummary;
}) {
  const router = useRouter();
  const [workerAssignments, setWorkerAssignments] = useState(() => ({
    minersAssigned: playerSummary.minersAssigned,
    farmersAssigned: playerSummary.farmersAssigned,
    recruitersAssigned: playerSummary.recruitersAssigned,
  }));
  const [workerAssignmentError, setWorkerAssignmentError] = useState<
    string | null
  >(null);
  const [workerAssignmentPending, setWorkerAssignmentPending] = useState(false);

  const workerAssignmentValidation = useMemo(() => {
    return validateWorkerAssignments({
      level: playerSummary.level,
      race: playerSummary.race,
      minersAssigned: workerAssignments.minersAssigned,
      farmersAssigned: workerAssignments.farmersAssigned,
      recruitersAssigned: workerAssignments.recruitersAssigned,
    });
  }, [playerSummary.level, playerSummary.race, workerAssignments]);

  const workerAssignmentPreview = useMemo(() => {
    return calculateTickProduction({
      level: playerSummary.level,
      race: playerSummary.race,
      food: playerSummary.food,
      minersAssigned: workerAssignments.minersAssigned,
      farmersAssigned: workerAssignments.farmersAssigned,
      recruitersAssigned: workerAssignments.recruitersAssigned,
    });
  }, [
    playerSummary.food,
    playerSummary.level,
    playerSummary.race,
    workerAssignments,
  ]);

  const workerAssignmentAssignedTotal =
    workerAssignments.minersAssigned +
    workerAssignments.farmersAssigned +
    workerAssignments.recruitersAssigned;
  const workerAssignmentIdlePopulation = Math.max(
    0,
    playerSummary.population - workerAssignmentAssignedTotal
  );
  const workerAssignmentValidationError = workerAssignmentValidation.isValid
    ? null
    : workerAssignments.minersAssigned < 0 ||
        workerAssignments.farmersAssigned < 0 ||
        workerAssignments.recruitersAssigned < 0
      ? "Worker assignments cannot be negative."
      : workerAssignmentAssignedTotal > playerSummary.population
        ? `Assigned workers exceed capacity (${workerAssignmentAssignedTotal}/${playerSummary.population}).`
        : "Worker assignments must be whole numbers within the fortress population.";

  function updateWorkerAssignmentRole(
    role: keyof typeof workerAssignments,
    nextValue: number
  ) {
    setWorkerAssignmentError(null);
    setWorkerAssignments((current) => ({
      ...current,
      [role]: Number.isFinite(nextValue)
        ? Math.max(0, Math.floor(nextValue))
        : 0,
    }));
  }

  function bumpWorkerAssignment(
    role: keyof typeof workerAssignments,
    delta: number
  ) {
    setWorkerAssignmentError(null);
    setWorkerAssignments((current) => ({
      ...current,
      [role]: Math.max(0, current[role] + delta),
    }));
  }

  function getRoleCap(role: keyof typeof workerAssignments) {
    const otherAssignments =
      role === "minersAssigned"
        ? workerAssignments.farmersAssigned + workerAssignments.recruitersAssigned
        : role === "farmersAssigned"
          ? workerAssignments.minersAssigned +
            workerAssignments.recruitersAssigned
          : workerAssignments.minersAssigned + workerAssignments.farmersAssigned;

    return Math.max(0, playerSummary.population - otherAssignments);
  }

  async function handleWorkerAssignmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (workerAssignmentPending || !playerSummary.race) {
      return;
    }

    if (workerAssignmentValidationError) {
      setWorkerAssignmentError(workerAssignmentValidationError);
      return;
    }

    setWorkerAssignmentPending(true);
    setWorkerAssignmentError(null);

    try {
      const result = await updateWorkerAssignmentAction({
        minersAssigned: workerAssignments.minersAssigned,
        farmersAssigned: workerAssignments.farmersAssigned,
        recruitersAssigned: workerAssignments.recruitersAssigned,
      });

      if (!result.ok) {
        setWorkerAssignmentError(result.error);
        return;
      }

      router.refresh();
    } finally {
      setWorkerAssignmentPending(false);
    }
  }

  return (
    <section className={styles.orderSection}>
      <div className={styles.sectionHeading}>
        <span className={styles.label}>Workers</span>
        <strong>
          {workerAssignmentAssignedTotal}/{playerSummary.population} pop
        </strong>
      </div>
      <p className={styles.helper}>
        Idle population: {workerAssignmentIdlePopulation}. Miners generate
        points, farmers generate food, and recruiters generate army while
        consuming food.
      </p>

      <form
        className={styles.workerForm}
        onSubmit={handleWorkerAssignmentSubmit}
      >
        <div className={styles.workerGrid}>
          <div className={styles.workerRow}>
            <div className={styles.workerRowMeta}>
              <span className={styles.workerRowLabel}>Miners</span>
              <span className={styles.workerRowHint}>
                +{workerAssignmentPreview.pointsProduced} points / tick
              </span>
            </div>
            <div className={styles.workerStepper}>
              <button
                type="button"
                className={styles.workerStepperButton}
                disabled={
                  workerAssignmentPending || workerAssignments.minersAssigned <= 0
                }
                onClick={() => bumpWorkerAssignment("minersAssigned", -1)}
                aria-label="Decrease miners"
              >
                -
              </button>
              <input
                className={styles.workerStepperInput}
                type="number"
                inputMode="numeric"
                min={0}
                max={getRoleCap("minersAssigned")}
                step={1}
                value={workerAssignments.minersAssigned}
                disabled={workerAssignmentPending}
                onChange={(event) => {
                  updateWorkerAssignmentRole(
                    "minersAssigned",
                    event.currentTarget.valueAsNumber
                  );
                }}
              />
              <button
                type="button"
                className={styles.workerStepperButton}
                disabled={
                  workerAssignmentPending ||
                  workerAssignments.minersAssigned >= getRoleCap("minersAssigned")
                }
                onClick={() => bumpWorkerAssignment("minersAssigned", 1)}
                aria-label="Increase miners"
              >
                +
              </button>
            </div>
          </div>

          <div className={styles.workerRow}>
            <div className={styles.workerRowMeta}>
              <span className={styles.workerRowLabel}>Farmers</span>
              <span className={styles.workerRowHint}>
                +{workerAssignmentPreview.foodProduced} food / tick
              </span>
            </div>
            <div className={styles.workerStepper}>
              <button
                type="button"
                className={styles.workerStepperButton}
                disabled={
                  workerAssignmentPending || workerAssignments.farmersAssigned <= 0
                }
                onClick={() => bumpWorkerAssignment("farmersAssigned", -1)}
                aria-label="Decrease farmers"
              >
                -
              </button>
              <input
                className={styles.workerStepperInput}
                type="number"
                inputMode="numeric"
                min={0}
                max={getRoleCap("farmersAssigned")}
                step={1}
                value={workerAssignments.farmersAssigned}
                disabled={workerAssignmentPending}
                onChange={(event) => {
                  updateWorkerAssignmentRole(
                    "farmersAssigned",
                    event.currentTarget.valueAsNumber
                  );
                }}
              />
              <button
                type="button"
                className={styles.workerStepperButton}
                disabled={
                  workerAssignmentPending ||
                  workerAssignments.farmersAssigned >= getRoleCap("farmersAssigned")
                }
                onClick={() => bumpWorkerAssignment("farmersAssigned", 1)}
                aria-label="Increase farmers"
              >
                +
              </button>
            </div>
          </div>

          <div className={styles.workerRow}>
            <div className={styles.workerRowMeta}>
              <span className={styles.workerRowLabel}>Recruiters</span>
              <span className={styles.workerRowHint}>
                +{workerAssignmentPreview.armyRequested} army / tick, costs{" "}
                {workerAssignmentPreview.armyRequested} food / tick
              </span>
            </div>
            <div className={styles.workerStepper}>
              <button
                type="button"
                className={styles.workerStepperButton}
                disabled={
                  workerAssignmentPending ||
                  workerAssignments.recruitersAssigned <= 0
                }
                onClick={() => bumpWorkerAssignment("recruitersAssigned", -1)}
                aria-label="Decrease recruiters"
              >
                -
              </button>
              <input
                className={styles.workerStepperInput}
                type="number"
                inputMode="numeric"
                min={0}
                max={getRoleCap("recruitersAssigned")}
                step={1}
                value={workerAssignments.recruitersAssigned}
                disabled={workerAssignmentPending}
                onChange={(event) => {
                  updateWorkerAssignmentRole(
                    "recruitersAssigned",
                    event.currentTarget.valueAsNumber
                  );
                }}
              />
              <button
                type="button"
                className={styles.workerStepperButton}
                disabled={
                  workerAssignmentPending ||
                  workerAssignments.recruitersAssigned >=
                    getRoleCap("recruitersAssigned")
                }
                onClick={() => bumpWorkerAssignment("recruitersAssigned", 1)}
                aria-label="Increase recruiters"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <dl className={styles.castleStats}>
          <div>
            <dt>Miners</dt>
            <dd>+{workerAssignmentPreview.pointsProduced} points / tick</dd>
          </div>
          <div>
            <dt>Farmers</dt>
            <dd>+{workerAssignmentPreview.foodProduced} food / tick</dd>
          </div>
          <div>
            <dt>Recruiters</dt>
            <dd>
              +{workerAssignmentPreview.armyRequested} army / tick, costs{" "}
              {workerAssignmentPreview.armyRequested} food / tick
            </dd>
          </div>
        </dl>

        {workerAssignmentError || workerAssignmentValidationError ? (
          <p className={`${styles.helper} ${styles.warningText}`}>
            {workerAssignmentError ?? workerAssignmentValidationError}
          </p>
        ) : null}

        <button
          className={`${styles.primaryButton} ${styles.emphasisButton}`}
          type="submit"
            disabled={
              workerAssignmentPending ||
              !playerSummary.race ||
              Boolean(workerAssignmentValidationError)
            }
        >
          {workerAssignmentPending ? "Saving workers..." : "Save workers"}
        </button>
      </form>
    </section>
  );
}

export function BattlefieldExperience({
  title,
  description,
  phaseStatus,
  playerSummary,
  playerFortress,
  mapFortresses,
  attackUnits,
  battleReports,
  targets,
  chat,
  canEditRegistrationName,
  immersive = false,
  topActionsContainerId,
}: {
  title: string;
  description: string;
  phaseStatus?: "REGISTRATION" | "TESTING" | "ACTIVE" | "RESOLUTION" | null;
  playerSummary: PlayerSummary | null;
  playerFortress: PlayerFortress | null;
  mapFortresses: MapFortress[];
  attackUnits: AttackUnitMarker[];
  battleReports: BattleReport[];
  targets: CommandTarget[];
  chat: ChatProps;
  canEditRegistrationName: boolean;
  immersive?: boolean;
  topActionsContainerId?: string;
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [castleTab, setCastleTab] = useState<CastleTab>("ECONOMY");
  const [unreadChatCount, setUnreadChatCount] = useState(chat.unreadCount);
  const [mapAttackPending, setMapAttackPending] = useState(false);
  const [topActionsRoot, setTopActionsRoot] = useState<HTMLElement | null>(
    null
  );
  const [selectedFortressId, setSelectedFortressId] = useState<string | null>(
    null
  );
  const knownChatMessageIdsRef = useRef(
    new Set(chat.messages.map((message) => message.id))
  );
  const markChatReadPendingRef = useRef(false);
  const [action, setAction] = useState<"GROW" | "ATTACK">(
    playerSummary?.currentAction ?? "GROW"
  );
  const [targetFortressId, setTargetFortressId] = useState(
    playerSummary?.currentTargetId ?? ""
  );
  const [sentArmy, setSentArmy] = useState(() =>
    playerSummary?.army && playerSummary.army > 0 ? 1 : 0
  );
  const selectedAttackTarget = useMemo(
    () => targets.find((target) => target.id === targetFortressId) ?? null,
    [targets, targetFortressId]
  );
  const playerRaceDefinition = getRaceDefinition(playerSummary?.race);
  const attackPreviewLines = useMemo(() => {
    return formatRaidAttackPreview({
      availableArmy: playerSummary?.army ?? 0,
      sentArmy,
      targetName: selectedAttackTarget?.name ?? null,
      targetDbLevel: selectedAttackTarget?.level ?? null,
      targetRace: selectedAttackTarget?.race ?? null,
    });
  }, [playerSummary?.army, sentArmy, selectedAttackTarget]);
  const assignedPopulation = playerSummary
    ? playerSummary.minersAssigned +
      playerSummary.farmersAssigned +
      playerSummary.recruitersAssigned
    : 0;
  const idlePopulation = playerSummary
    ? Math.max(0, playerSummary.population - assignedPopulation)
    : 0;
  const storedProductionPreview = useMemo(() => {
    if (!playerSummary) {
      return null;
    }

    return calculateTickProduction({
      level: playerSummary.level,
      race: playerSummary.race,
      castleSpecializations:
        playerSummary.castleSpecializationCounts ?? undefined,
      food: playerSummary.food,
      minersAssigned: playerSummary.minersAssigned,
      farmersAssigned: playerSummary.farmersAssigned,
      recruitersAssigned: playerSummary.recruitersAssigned,
    });
  }, [playerSummary]);
  const defenseBonusPercent = playerSummary
    ? getDefenseBonusPercent(
        playerSummary.level,
        playerSummary.race,
        playerSummary.castleSpecializationCounts ?? undefined
      )
    : 0;
  const carryPerSurvivor =
    CARRY_CAPACITY_PER_SURVIVOR +
    getRaceModifiers(playerSummary?.race).carryCapacityPerSurvivorBonus;
  const selectedArmyCarryCapacity = Math.max(0, sentArmy) * carryPerSurvivor;

  const ownFortress = useMemo(
    () => mapFortresses.find((fortress) => fortress.isCurrentUser) ?? null,
    [mapFortresses]
  );
  const overlayRoot =
    immersive && typeof document !== "undefined"
      ? document.getElementById("battlefield-overlay-root")
      : null;
  const shouldPortalActionButtons = Boolean(topActionsRoot);

  useEffect(() => {
    queueMicrotask(() => {
      setTopActionsRoot(
        topActionsContainerId
          ? document.getElementById(topActionsContainerId)
          : null
      );
    });
  }, [topActionsContainerId]);

  useEffect(() => {
    if (chatOpen || !chat.persistsUnread) {
      return;
    }

    queueMicrotask(() => {
      setUnreadChatCount(chat.unreadCount);
    });
  }, [chat.unreadCount, chat.persistsUnread, chatOpen]);

  useEffect(() => {
    const knownMessageIds = knownChatMessageIdsRef.current;
    const unseenIncomingMessages = chat.messages.filter((message) => {
      return !knownMessageIds.has(message.id) && !message.isCurrentUser;
    });

    if (chatOpen) {
      queueMicrotask(() => {
        setUnreadChatCount(0);
      });
      if (
        unseenIncomingMessages.length > 0 &&
        chat.persistsUnread &&
        !markChatReadPendingRef.current
      ) {
        markChatReadPendingRef.current = true;
        void markChatReadAction().finally(() => {
          markChatReadPendingRef.current = false;
        });
      }
    } else if (!chat.persistsUnread && unseenIncomingMessages.length > 0) {
      queueMicrotask(() => {
        setUnreadChatCount(
          (currentCount) => currentCount + unseenIncomingMessages.length
        );
      });
    }

    knownChatMessageIdsRef.current = new Set(
      chat.messages.map((message) => message.id)
    );
  }, [chat.messages, chat.persistsUnread, chatOpen]);

  const canOpenActions = Boolean(
    ownFortress &&
    (((phaseStatus === "ACTIVE" || phaseStatus === "TESTING") &&
      playerSummary) ||
      (phaseStatus === "REGISTRATION" &&
        canEditRegistrationName &&
        playerFortress))
  );

  function openOwnActions(fortressId: string) {
    if (!canOpenActions) {
      return;
    }

    setSelectedFortressId(fortressId);
    setCastleTab(action === "ATTACK" || targetFortressId ? "COMBAT" : "ECONOMY");
    setActionOpen(true);
  }

  function chooseAction(nextAction: "GROW" | "ATTACK") {
    setAction(nextAction);

    if (nextAction === "GROW") {
      setTargetFortressId("");
    } else if ((playerSummary?.army ?? 0) > 0 && sentArmy <= 0) {
      setSentArmy(1);
    }
  }

  function getAttackValidationError(
    nextTargetFortressId = targetFortressId,
    nextSentArmy = sentArmy
  ) {
    if (!playerSummary) {
      return "You need an active fortress before attacking.";
    }

    if (!playerSummary.race) {
      return "Choose a race before attacking.";
    }

    if (!nextTargetFortressId) {
      return "Choose a target fortress before attacking.";
    }

    if (playerSummary.army <= 0) {
      return "You need at least 1 army before attacking.";
    }

    if (!Number.isInteger(nextSentArmy) || nextSentArmy <= 0) {
      return "Send at least 1 army.";
    }

    if (nextSentArmy > playerSummary.army) {
      return `You can send at most ${playerSummary.army} army.`;
    }

    if (
      playerSummary.outboundAttackUnitCount >= playerSummary.maxSimultaneousAttacks
    ) {
      return `Maximum attacks in flight (${playerSummary.outboundAttackUnitCount}/${playerSummary.maxSimultaneousAttacks}). Upgrade your castle for more slots.`;
    }

    return null;
  }

  const attackValidationError =
    action === "ATTACK" ? getAttackValidationError() : null;

  async function prepareAttackTarget(
    fortress: MapFortress,
    mapSentArmy = sentArmy
  ) {
    if (!fortress.isTargetable || !playerSummary?.canSetAction) {
      return;
    }

    setAction("ATTACK");
    setCastleTab("COMBAT");
    setTargetFortressId(fortress.id);
    setSentArmy(mapSentArmy);

    const validationError = getAttackValidationError(fortress.id, mapSentArmy);

    if (validationError) {
      return;
    }

    if (!ownFortress || mapAttackPending) {
      return;
    }

    setSelectedFortressId(ownFortress.id);
    setMapAttackPending(true);

    try {
      const result = await attackFromMapAction(fortress.id, mapSentArmy);

      if (result.ok) {
        router.refresh();
      }
    } finally {
      setMapAttackPending(false);
    }
  }

  async function handleRecallAttackUnit(attackUnit: AttackUnitMarker) {
    const result = await recallAttackUnitAction(attackUnit.id);

    if (result.ok) {
      router.refresh();
    }
  }

  function handleChatToggle() {
    if (chatOpen) {
      setChatOpen(false);
      return;
    }

    setChatOpen(true);
    setUnreadChatCount(0);

    if (chat.persistsUnread && !markChatReadPendingRef.current) {
      markChatReadPendingRef.current = true;
      void markChatReadAction().finally(() => {
        markChatReadPendingRef.current = false;
      });
    }
  }

  const hasUnreadChat = unreadChatCount > 0;
  const unreadBadgeLabel =
    unreadChatCount > 99 ? "99+" : unreadChatCount.toString();

  const actionButtons = (
    <div
      className={
        shouldPortalActionButtons
          ? styles.topbarActions
          : immersive
            ? styles.floatingActions
            : styles.headerActions
      }
      aria-label="Battlefield overlays"
    >
      <button
        type="button"
        className={`${styles.overlayButton} ${
          hasUnreadChat ? styles.overlayButtonAttention : ""
        }`}
        aria-label={
          hasUnreadChat ? `Chat, ${unreadChatCount} unread messages` : "Chat"
        }
        aria-expanded={chatOpen}
        onClick={handleChatToggle}
      >
        <span className={styles.overlayButtonLabel}>Chat</span>
        {hasUnreadChat ? (
          <span className={styles.unreadBadge} aria-hidden="true">
            {unreadBadgeLabel}
          </span>
        ) : null}
      </button>
      {ownFortress ? (
        <button
          type="button"
          className={styles.overlayButton}
          aria-expanded={actionOpen}
          disabled={!canOpenActions}
          onClick={() => openOwnActions(ownFortress.id)}
        >
          Castle
        </button>
      ) : null}
    </div>
  );

  const chatDrawer = chatOpen ? (
    <aside
      className={`${styles.drawer} ${styles.chatDrawer} ${styles.drawerOpen}`}
    >
      <button
        type="button"
        className={styles.closeButton}
        aria-label="Close chat"
        onClick={() => setChatOpen(false)}
      >
        Close
      </button>
      <div className={`${styles.drawerBody} ${styles.chatDrawerBody}`}>
        <ChatPanel
          messages={chat.messages}
          canPost={chat.canPost}
          maxLength={chat.maxLength}
          postHint={chat.postHint}
        />
      </div>
    </aside>
  ) : null;

  const actionDrawer = actionOpen ? (
    <aside
      className={`${styles.drawer} ${styles.actionDrawer} ${styles.drawerOpen}`}
    >
      <button
        type="button"
        className={styles.closeButton}
        aria-label="Close castle"
        onClick={() => setActionOpen(false)}
      >
        Close
      </button>
      <div className={`${styles.drawerBody} ${styles.actionDrawerBody}`}>
        {(phaseStatus === "ACTIVE" || phaseStatus === "TESTING") &&
        playerSummary ? (
          <div className={styles.drawerContent}>
            <div className={styles.castleSummaryHeader}>
              <div>
                <h3>{playerSummary.name}</h3>
                <p className={styles.helper}>
                  {playerRaceDefinition?.displayName ?? "Race unchosen"}
                  {playerRaceDefinition
                    ? ` - ${playerRaceDefinition.passiveSummary.join(", ")}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={
                  !playerSummary.upgradesUnlocked ||
                  playerSummary.nextUpgradeCost === null
                }
                onClick={() => setCastleTab("ECONOMY")}
              >
                {playerSummary.nextUpgradeCost === null
                  ? `Level ${playerSummary.displayedCastleLevel}`
                  : `Level ${playerSummary.displayedCastleLevel} - upgrade ${playerSummary.nextUpgradeCost} pts`}
              </button>
            </div>

            {playerSummary.isTestingPhase ? (
              <p className={`${styles.helper} ${styles.warningText}`}>
                Testing mode: resources, race, attacks and upgrades reset before
                the real season.
              </p>
            ) : null}

            <section className={styles.castleSummaryPanel}>
              <dl className={styles.castleStats}>
                <div className={styles.primaryStat}>
                  <dt>Points</dt>
                  <dd>{playerSummary.points}</dd>
                </div>
                <div className={styles.primaryStat}>
                  <dt>Food</dt>
                  <dd>{playerSummary.food}</dd>
                </div>
                <div>
                  <dt>Military</dt>
                  <dd>{playerSummary.army}</dd>
                </div>
                <div>
                  <dt>Defense</dt>
                  <dd>x{playerSummary.defenseMultiplier.toFixed(2)}</dd>
                </div>
              </dl>
            </section>

            <div className={`${styles.segmentGroup} ${styles.castleTabs}`} aria-label="Castle tabs">
              {CASTLE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.segmentButton} ${
                    castleTab === tab.value ? styles.segmentButtonActive : ""
                  }`}
                  aria-pressed={castleTab === tab.value}
                  onClick={() => {
                    setCastleTab(tab.value);
                    if (tab.value === "COMBAT") {
                      chooseAction("ATTACK");
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {castleTab === "ECONOMY" ? (
              <>
                <section className={styles.orderSection}>
                  <div className={styles.sectionHeading}>
                    <span className={styles.label}>Output</span>
                    <strong>{assignedPopulation}/{playerSummary.population} pop</strong>
                  </div>
                  <dl className={styles.castleStats}>
                    <div>
                      <dt>Points</dt>
                      <dd>+{storedProductionPreview?.pointsProduced ?? 0}/tick</dd>
                    </div>
                    <div>
                      <dt>Food</dt>
                      <dd>+{storedProductionPreview?.foodProduced ?? 0}/tick</dd>
                    </div>
                    <div>
                      <dt>Army</dt>
                      <dd>
                        +{storedProductionPreview?.armyProduced ?? 0}/tick, costs{" "}
                        {storedProductionPreview?.foodConsumed ?? 0} food
                      </dd>
                    </div>
                    <div>
                      <dt>Idle</dt>
                      <dd>{idlePopulation} pop</dd>
                    </div>
                  </dl>
                </section>
                <WorkerAssignmentSection
                  key={`${playerSummary.id}:${playerSummary.minersAssigned}:${playerSummary.farmersAssigned}:${playerSummary.recruitersAssigned}`}
                  playerSummary={playerSummary}
                />
              </>
            ) : null}

            {castleTab === "COMBAT" && !playerSummary.race ? (
              <p className={`${styles.helper} ${styles.warningText}`}>
                Race selection is required before attacks.
              </p>
            ) : null}

            {castleTab === "COMBAT" ? (
              <form action={setFortressActionAction} className={styles.form}>
                <input name="action" type="hidden" value="ATTACK" />
                <input name="sentArmy" type="hidden" value={sentArmy} />
                <div className={styles.attackControls}>
                  <dl className={styles.castleStats}>
                    <div className={styles.primaryStat}>
                      <dt>Military size</dt>
                      <dd>{playerSummary.army}</dd>
                    </div>
                    <div>
                      <dt>Recruit cost</dt>
                      <dd>{FOOD_COST_PER_ARMY} food / army produced</dd>
                    </div>
                    <div>
                      <dt>Carry capacity</dt>
                      <dd>
                        {selectedArmyCarryCapacity} max ({sentArmy || 0} x{" "}
                        {carryPerSurvivor})
                      </dd>
                    </div>
                  </dl>

                  <label className={styles.field}>
                    <span>Target</span>
                    <select
                      name="targetFortressId"
                      value={targetFortressId}
                      onChange={(event) => {
                        setTargetFortressId(event.target.value);
                      }}
                      >
                        <option value="">Choose target</option>
                        {targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name} (
                            Lvl {getDisplayedCastleLevel(target.level)},{" "}
                            {target.isNpc
                              ? `${target.health}/${target.maxHealth} HP`
                              : `${target.points} pts`}
                            )
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Send army</span>
                    <input
                      name="sentArmy"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={playerSummary.army}
                      step={1}
                      value={sentArmy}
                      disabled={!playerSummary.canSetAction}
                      onChange={(event) => {
                        setSentArmy(
                          Number.isFinite(event.currentTarget.valueAsNumber)
                            ? Math.max(0, Math.floor(event.currentTarget.valueAsNumber))
                            : 0
                        );
                      }}
                    />
                  </label>

                  <p className={styles.helper}>
                    Sent army leaves home defense immediately. Loot capacity is
                    surviving troops times {carryPerSurvivor}.
                  </p>

                  <div className={styles.sectionHeading}>
                    <span className={styles.label}>Raid preview</span>
                  </div>
                  <div className={styles.battlePreview}>
                    {attackPreviewLines.map((line, index) => (
                      <p
                        key={`${index}-${line}`}
                        className={
                          index === 0
                            ? styles.battlePreviewLead
                            : styles.battlePreviewLine
                        }
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>

                {attackValidationError ? (
                  <p className={`${styles.helper} ${styles.warningText}`}>
                    {attackValidationError}
                  </p>
                ) : null}

                <button
                  className={`${styles.primaryButton} ${styles.emphasisButton}`}
                  type="submit"
                  disabled={
                    !playerSummary.race || Boolean(attackValidationError)
                  }
                >
                  Send attack ({playerSummary.outboundAttackUnitCount}/
                  {playerSummary.maxSimultaneousAttacks})
                </button>
              </form>
            ) : null}

            {castleTab === "REPORTS" ? (
              <section className={styles.orderSection}>
                <div className={styles.sectionHeading}>
                  <span className={styles.label}>Reports</span>
                  <strong>{battleReports.length}</strong>
                </div>
                {battleReports.length > 0 ? (
                  <div className={styles.battleReportList}>
                    {battleReports.map((report) => (
                      <article key={report.id} className={styles.battleReport}>
                        <p className={styles.battleReportHeadline}>
                          {report.reportLines[0]}
                        </p>
                        {report.reportLines.slice(1).map((line, index) => (
                          <p
                            key={`${report.id}-${index}`}
                            className={styles.battleReportLine}
                          >
                            {line}
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.helper}>
                    No resolved attacks or defenses yet.
                  </p>
                )}
              </section>
            ) : null}

            {castleTab === "ECONOMY" ? (
            <section className={styles.upgradePanel}>
              <div className={styles.upgradeHeader}>
                <div>
                  <span className={styles.label}>Castle Yeet</span>
                  <h4>Yeet to a new hex</h4>
                </div>
                <strong>
                  {playerSummary.locationShuffleCost === 0
                    ? "Free"
                    : `${playerSummary.locationShuffleCost} pts`}
                </strong>
              </div>
              <p className={styles.helper}>
                {playerSummary.freeLocationShuffleAvailable
                  ? `First yeet is free; later yeets cost ${playerSummary.locationShuffleCost} points.`
                  : `Free yeet used. Next yeet costs ${playerSummary.locationShuffleCost} points.`}
              </p>
              {playerSummary.hasOutgoingAttackUnits ? (
                <p className={`${styles.helper} ${styles.warningText}`}>
                  Outgoing attack units already in flight will be canceled when
                  Castle Yeet triggers.
                </p>
              ) : null}
              {!playerSummary.canShuffleLocation &&
              playerSummary.locationShuffleCost !== null &&
              playerSummary.points < playerSummary.locationShuffleCost ? (
                <p className={styles.helper}>
                  You need {playerSummary.locationShuffleCost} points for the
                  next Castle Yeet.
                </p>
              ) : null}
              <form action={shuffleFortressLocationAction}>
                <button
                  className={`${styles.secondaryButton} ${styles.emphasisButton}`}
                  type="submit"
                  disabled={!playerSummary.canShuffleLocation}
                >
                  {playerSummary.locationShuffleCost === 0
                    ? "Castle Yeet for free"
                    : `Castle Yeet for ${playerSummary.locationShuffleCost} pts`}
                </button>
              </form>
            </section>
            ) : null}

            {castleTab === "RACE" ? (
              <RaceSelectionSection
                currentRace={playerSummary.race}
                isTestingPhase={playerSummary.isTestingPhase}
              />
            ) : null}

            {castleTab === "RACE" &&
            playerSummary.race &&
            playerSummary.raceBuffs.tier >= 2 ? (
              <section className={styles.upgradePanel}>
                <div className={styles.upgradeHeader}>
                  <div>
                    <span className={styles.label}>Race buffs</span>
                    <h4>Tier {playerSummary.raceBuffs.tier}</h4>
                  </div>
                  <strong>
                    {playerSummary.raceBuffs.tier >= 3 ? "T3" : "T2"}
                  </strong>
                </div>
                {playerSummary.raceBuffs.dwarfGrudges.length > 0 ? (
                  <ul className={styles.compactList}>
                    {playerSummary.raceBuffs.dwarfGrudges.map((grudge) => (
                      <li key={`${grudge.slot}-${grudge.targetFortressId}`}>
                        Grudge {grudge.slot}: {grudge.targetName} x
                        {grudge.bonusMultiplier}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {playerSummary.raceBuffs.canChooseDwarfGrudge ? (
                  <form action={chooseDwarfGrudgeAction} className={styles.inlineForm}>
                    <select name="targetFortressId" required>
                      <option value="">Choose grudge</option>
                      {targets
                        .filter((target) => {
                          return (
                            !target.isNpc &&
                            !playerSummary.raceBuffs.dwarfGrudges.some(
                              (grudge) =>
                                grudge.targetFortressId === target.id
                            )
                          );
                        })
                        .map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name}
                          </option>
                        ))}
                    </select>
                    <button className={styles.secondaryButton} type="submit">
                      Add grudge
                    </button>
                  </form>
                ) : null}
                {playerSummary.raceBuffs.canChooseDwarfTierThree ? (
                  <>
                    <form
                      action={chooseDwarfTierThreeGrudgeAction}
                      className={styles.inlineForm}
                    >
                      <select name="targetFortressId" required>
                        <option value="">Choose second grudge</option>
                        {targets
                          .filter((target) => {
                            return (
                              !target.isNpc &&
                              !playerSummary.raceBuffs.dwarfGrudges.some(
                                (grudge) =>
                                  grudge.targetFortressId === target.id
                              )
                            );
                          })
                          .map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.name}
                            </option>
                          ))}
                      </select>
                      <button className={styles.secondaryButton} type="submit">
                        Add second
                      </button>
                    </form>
                    <form action={chooseDwarfTierThreeGrudgeAction}>
                      <input name="choice" type="hidden" value="double" />
                      <button className={styles.secondaryButton} type="submit">
                        Double first grudge
                      </button>
                    </form>
                  </>
                ) : null}
                {playerSummary.race === "ORKS" ? (
                  playerSummary.raceBuffs.waaaghActiveUntil ? (
                    <p className={styles.helper}>WAAAGH active for this hour.</p>
                  ) : (
                    <form action={activateWaaaghAction}>
                      <button
                        className={styles.secondaryButton}
                        type="submit"
                        disabled={!playerSummary.raceBuffs.canActivateWaaagh}
                      >
                        Summon WAAAGH
                      </button>
                    </form>
                  )
                ) : null}
                {playerSummary.race === "SPACE_MURINES" ? (
                  playerSummary.raceBuffs.stimActiveUntil ? (
                    <p className={styles.helper}>STIM active for this hour.</p>
                  ) : (
                    <form action={activateStimAction}>
                      <button
                        className={styles.secondaryButton}
                        type="submit"
                        disabled={!playerSummary.raceBuffs.canActivateStim}
                      >
                        Activate STIM
                      </button>
                    </form>
                  )
                ) : null}
                {playerSummary.race === "UNSTABLE_UNICORNS" ? (
                  <>
                    <p className={styles.helper}>
                      Fast units are active. Tier 1 grants one free Castle Yeet
                      claim per hour, and each Unicorn free yeet leaves an
                      attackable decoy behind.
                    </p>
                    {playerSummary.raceBuffs.hasUnicornTeleportToken ? (
                      <form action={useUnicornTeleportAction}>
                        <button
                          className={`${styles.secondaryButton} ${styles.emphasisButton}`}
                          type="submit"
                        >
                          Use Unicorn free yeet
                        </button>
                      </form>
                    ) : playerSummary.raceBuffs.canClaimUnicornTeleport ? (
                      <form action={claimUnicornTeleportAction}>
                        <button
                          className={styles.secondaryButton}
                          type="submit"
                        >
                          Claim hourly free yeet
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            {castleTab === "ECONOMY" ? (
            <section className={styles.upgradePanel}>
              <div className={styles.upgradeHeader}>
                <div>
                  <span className={styles.label}>Castle level</span>
                  <h4>Level {playerSummary.displayedCastleLevel}</h4>
                </div>
                <strong>
                  +
                  {Math.round(defenseBonusPercent * 100)}
                  %
                </strong>
              </div>
              <dl className={styles.castleStats}>
                <div className={styles.primaryStat}>
                  <dt>Population</dt>
                  <dd>
                    {assignedPopulation}/{playerSummary.population} assigned
                  </dd>
                </div>
                <div>
                  <dt>Idle</dt>
                  <dd>
                    {idlePopulation} pop
                  </dd>
                </div>
                <div>
                  <dt>Defense</dt>
                  <dd>x{playerSummary.defenseMultiplier.toFixed(2)}</dd>
                </div>
              </dl>
              <p className={styles.helper}>
                {playerSummary.upgradesUnlocked
                  ? playerSummary.nextUpgradeCost === null
                    ? "Your castle is maxed out. The fortress economy is fully scaled for this version."
                    : playerSummary.canAffordUpgrade
                      ? `Upgrade castle to increase population capacity and defensive army bonus. Next upgrade costs ${playerSummary.nextUpgradeCost} points.`
                      : `Next upgrade costs ${playerSummary.nextUpgradeCost} points.`
                  : "Castle upgrades unlock for everyone after Home of A falls for the first time."}
              </p>
              {playerSummary.receivedSlayerUpgrade ? (
                <p className={styles.helper}>
                  Home of A slayer bonus claimed: you received one free castle
                  upgrade.
                </p>
              ) : null}
              {playerSummary.castleSpecializationCounts ? (
                <p className={styles.helper}>
                  Specs: P {playerSummary.castleSpecializationCounts.POINTS}, F{" "}
                  {playerSummary.castleSpecializationCounts.FOOD}, M{" "}
                  {playerSummary.castleSpecializationCounts.MILITARY}, D{" "}
                  {playerSummary.castleSpecializationCounts.DEFENSE}
                </p>
              ) : null}
              {playerSummary.pendingUpgradeSpecializationLevel !== null ? (
                <form action={choosePendingUpgradeSpecializationAction}>
                  <p className={styles.helper}>
                    Choose specialization for level{" "}
                    {playerSummary.pendingUpgradeSpecializationLevel}.
                  </p>
                  <CastleSpecializationFields />
                  <button className={styles.secondaryButton} type="submit">
                    Lock specialization
                  </button>
                </form>
              ) : null}
              {playerSummary.upgradesUnlocked &&
              playerSummary.nextUpgradeCost !== null &&
              playerSummary.pendingUpgradeSpecializationLevel === null ? (
                <form action={purchaseFortressUpgradeAction}>
                  <CastleSpecializationFields />
                  <button
                    className={`${styles.secondaryButton} ${styles.emphasisButton}`}
                    type="submit"
                    disabled={!playerSummary.canPurchaseUpgrade}
                  >
                    Buy upgrade for {playerSummary.nextUpgradeCost} pts
                  </button>
                </form>
              ) : null}
            </section>
            ) : null}

            {castleTab === "ECONOMY" &&
            (playerSummary.canRegisterCommanderName ||
            playerSummary.canRename) ? (
              <section className={styles.orderSection}>
                <div className={styles.sectionHeading}>
                  <span className={styles.label}>Names</span>
                </div>
                {playerSummary.canRegisterCommanderName ? (
                  <form
                    action={registerCommanderNameAction}
                    className={styles.renamePanel}
                  >
                    <label className={styles.field}>
                      <span>In-game nick</span>
                      <input
                        name="commanderName"
                        type="text"
                        defaultValue={playerSummary.commanderName}
                        maxLength={32}
                        required
                      />
                    </label>
                    <button className={styles.secondaryButton} type="submit">
                      Register nick
                    </button>
                  </form>
                ) : null}

                {playerSummary.canRename ? (
                  <form
                    action={renameFortressAction}
                    className={styles.renamePanel}
                  >
                    <label className={styles.field}>
                      <span>Rename</span>
                      <input
                        name="fortressName"
                        type="text"
                        defaultValue={playerSummary.name}
                        maxLength={32}
                        required
                      />
                    </label>
                    <button className={styles.secondaryButton} type="submit">
                      Spend 10 pts
                    </button>
                  </form>
                ) : null}
              </section>
            ) : castleTab === "ECONOMY" ? (
              <p className={styles.helper}>Rename unlocks at 10 points.</p>
            ) : null}
          </div>
        ) : null}

        {phaseStatus === "REGISTRATION" &&
        canEditRegistrationName &&
        playerFortress ? (
          <div className={styles.drawerContent}>
            <div className={styles.ordersHeader}>
              <div>
                <span className={styles.label}>Registration</span>
                <h3>{playerFortress.commanderName}</h3>
              </div>
              <strong>{playerFortress.points} pts</strong>
            </div>
            <RaceSelectionSection
              currentRace={playerFortress.race}
              isTestingPhase
            />
            <form
              action={editRegistrationFortressNameAction}
              className={styles.form}
            >
              <label className={styles.field}>
                <span>In-game nick</span>
                <input
                  name="commanderName"
                  type="text"
                  defaultValue={playerFortress.commanderName}
                  maxLength={32}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Fortress name</span>
                <input
                  name="fortressName"
                  type="text"
                  defaultValue={playerFortress.name}
                  maxLength={32}
                  required
                />
              </label>
              <button
                className={`${styles.primaryButton} ${styles.emphasisButton}`}
                type="submit"
              >
                Update registration
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </aside>
  ) : null;

  const immersiveOverlay =
    immersive && overlayRoot
      ? createPortal(
          <div className={styles.immersiveOverlayUi}>
            {shouldPortalActionButtons ? null : actionButtons}
            {chatDrawer}
            {actionDrawer}
          </div>,
          overlayRoot
        )
      : null;
  const topbarActionsPortal = topActionsRoot
    ? createPortal(actionButtons, topActionsRoot)
    : null;

  return (
    <section
      className={`${styles.experience} ${immersive ? styles.immersive : ""}`}
      aria-labelledby="battlefield-title"
    >
      <div className={immersive ? styles.headerHidden : styles.header}>
        <div>
          <span className={styles.label}>Battlefield</span>
          <h2 id="battlefield-title">{title}</h2>
          <p>{description}</p>
        </div>
        {!immersive && !shouldPortalActionButtons ? actionButtons : null}
      </div>

      <div className={styles.mapStage}>
        {!immersive && !shouldPortalActionButtons ? actionButtons : null}
        <FortressMap
          className={immersive ? styles.fullMap : undefined}
          fortresses={mapFortresses}
          attackUnits={attackUnits}
          selectedFortressId={selectedFortressId}
          selectedTargetId={action === "ATTACK" ? targetFortressId : null}
            onSelectFortress={(fortress) => {
              if (fortress.isCurrentUser) {
                openOwnActions(fortress.id);
              }
            }}
            onConfirmAttackTarget={prepareAttackTarget}
            onRecallAttackUnit={handleRecallAttackUnit}
          />

        {!immersive ? chatDrawer : null}
        {!immersive ? actionDrawer : null}
      </div>
      {immersiveOverlay}
      {topbarActionsPortal}
    </section>
  );
}
