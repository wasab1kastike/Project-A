"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  attackFromMapAction,
  attackMapHexAction,
  claimMapHexAction,
  instantRecallAttackUnitAction,
  joinBattlefieldAction,
  markChatReadAction,
  recallBattlefieldArmyAction,
  recallAttackUnitAction,
  recallGarrisonArmyAction,
} from "@/app/game-actions";
import { ChatPanel } from "./chat-panel";
import {
  FortressMap,
  type AttackUnitMarker,
  type MapFortress,
  type MapHexOwnershipMarker,
} from "./fortress-map";
import { HEX_TILES, type HexBiome } from "@/lib/game/map-hex";
import {
  getHomeOfABonus,
  getTileBonus,
  isHomeOfATile,
} from "@/lib/game/territory";
import { NoticeToast } from "./notice-toast";
import styles from "./battlefield-experience.module.css";

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
    isSystem: boolean;
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
  name: string;
  gold: number;
  army: number;
  race: string | null;
  canSetAction: boolean;
  outboundAttackUnitCount: number;
  maxSimultaneousAttacks: number;
};

type PlayerFortress = {
  id: string;
  ownerId?: string;
  name: string;
};

type ActiveBattlefield = {
  id: string;
  targetTileId: string | null;
  targetTileBiome: string | null;
  targetTileBonusLabel: string | null;
  targetName: string;
  progress: number;
  attackerArmyRemaining: number;
  defenderArmyRemaining: number;
  attackerArmyLabel: string;
  defenderArmyLabel: string;
  attackerCasualties: number;
  defenderCasualties: number;
  ownArmyCommitted: number;
  ownArmyRemaining: number;
  ownIncomingArmy: number;
  startedAt: Date;
  attackerBanner: {
    id: string;
    name: string;
    commanderName: string;
  };
  defenderBanner: {
    id: string;
    name: string;
    commanderName: string;
  } | null;
  participantCount: number;
  currentUserSide: "ATTACKER" | "DEFENDER" | null;
  canRecall: boolean;
  recallDisabledReason: string | null;
  incomingReinforcements: Array<{
    id: string;
    side: "ATTACKER" | "DEFENDER";
    armyAmount: number | null;
    arrivesAt: Date;
    fortressName: string;
    isCurrentUser: boolean;
  }>;
  canJoinAttacker: boolean;
  canJoinDefender: boolean;
  joinAttackerDisabledReason: string | null;
  joinDefenderDisabledReason: string | null;
};

type BattleReport = {
  id: string;
  type?: string;
  targetName?: string;
  targetTileId?: string | null;
  progress?: number;
  outcome?: "ATTACKER_WIN" | "DEFENDER_WIN" | "RECALLED" | "IN_PROGRESS";
  attackerName?: string;
  defenderName?: string;
  attackerOwnerId?: string;
  defenderOwnerId?: string;
  reportLines?: string[];
};

function getBattleOutcomeLabel(
  report: BattleReport,
  currentOwnerId: string | null
) {
  if (!report.outcome) {
    return "Report";
  }

  if (report.outcome === "RECALLED") {
    return "RECALLED";
  }

  if (report.outcome === "IN_PROGRESS") {
    return "IN PROGRESS";
  }

  if (!currentOwnerId || !report.attackerOwnerId || !report.defenderOwnerId) {
    return report.outcome.replace("_", " ");
  }

  const playerWon =
    (report.outcome === "ATTACKER_WIN" &&
      report.attackerOwnerId === currentOwnerId) ||
    (report.outcome === "DEFENDER_WIN" &&
      report.defenderOwnerId === currentOwnerId);
  const playerLost =
    (report.outcome === "ATTACKER_WIN" &&
      report.defenderOwnerId === currentOwnerId) ||
    (report.outcome === "DEFENDER_WIN" &&
      report.attackerOwnerId === currentOwnerId);

  if (playerWon) {
    return "VICTORY";
  }

  if (playerLost) {
    return "DEFEAT";
  }

  return report.outcome.replace("_", " ");
}

type HomeOfAState = {
  tileId: string;
  pointIncome: number;
  ownerFortressId: string | null;
  ownerName: string;
  ownerCommanderName: string;
  bannerFortressId: string | null;
  bannerName: string | null;
  holders: Array<{
    fortressId: string;
    fortressName: string;
    commanderName: string;
    contributionWeight: number;
    isCurrentUser: boolean;
  }>;
  activeBattlefieldId: string | null;
  canAttack: boolean;
  attackDisabledReason: string | null;
} | null;

const LOOT_CAMP_FIGHT_BACK_NOTICE_STORAGE_KEY =
  "project-a:loot-camp-fight-back-notice:2026-04-30";
const BIOME_LABELS: Record<HexBiome, string> = {
  water: "Sea",
  coast: "Coast",
  plains: "Plains",
  forest: "Forest",
  hills: "Hills",
  mountains: "Mountains",
  marsh: "Marsh",
  lake: "Lake",
};

function formatClaimRemaining(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.ceil(seconds / 60)}m`;
}

export function BattlefieldExperience({
  title,
  description,
  playerFortress,
  playerSummary,
  mapFortresses,
  mapHexes,
  homeOfA,
  battlefields,
  attackUnits,
  battleReports,
  chat,
  phaseStatus,
  immersive = false,
  topActionsContainerId,
}: {
  title: string;
  description: string;
  playerFortress: PlayerFortress | null;
  playerSummary: PlayerSummary | null;
  mapFortresses: MapFortress[];
  mapHexes: MapHexOwnershipMarker[];
  homeOfA: HomeOfAState;
  battlefields: ActiveBattlefield[];
  attackUnits: AttackUnitMarker[];
  battleReports: BattleReport[];
  availableTargets: unknown[];
  chat: ChatProps;
  phaseStatus: string | null;
  canEditRegistrationName: boolean;
  immersive?: boolean;
  topActionsContainerId?: string;
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [battleLogOpen, setBattleLogOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(chat.unreadCount);
  const [unreadBattleReportCount, setUnreadBattleReportCount] = useState(0);
  const [selectedFortressId, setSelectedFortressId] = useState<string | null>(
    playerFortress?.id ?? null
  );
  const [mapActionPending, setMapActionPending] = useState(false);
  const [topActionsRoot, setTopActionsRoot] = useState<HTMLElement | null>(
    null
  );
  const knownChatMessageIdsRef = useRef(
    new Set(chat.messages.map((message) => message.id))
  );
  const knownBattleReportIdsRef = useRef(
    new Set(battleReports.map((report) => report.id))
  );
  const markChatReadPendingRef = useRef(false);
  const selectedTargetId = null;
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [tileAttackArmy, setTileAttackArmy] = useState(1);
  const [battleJoinArmyById, setBattleJoinArmyById] = useState<
    Record<string, number>
  >({});
  const [battleRecallArmyById, setBattleRecallArmyById] = useState<
    Record<string, number>
  >({});
  const [garrisonRecallArmyById, setGarrisonRecallArmyById] = useState<
    Record<string, number>
  >({});
  const [battleRecallPendingId, setBattleRecallPendingId] = useState<
    string | null
  >(null);
  const [garrisonRecallPendingId, setGarrisonRecallPendingId] = useState<
    string | null
  >(null);
  const [optimisticAttackUnits, setOptimisticAttackUnits] = useState<
    AttackUnitMarker[]
  >([]);

  useEffect(() => {
    if (!topActionsContainerId) {
      queueMicrotask(() => setTopActionsRoot(null));
      return;
    }

    queueMicrotask(() =>
      setTopActionsRoot(document.getElementById(topActionsContainerId))
    );
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

  useEffect(() => {
    const knownReportIds = knownBattleReportIdsRef.current;
    const unseenReportCount = battleReports.filter(
      (report) => !knownReportIds.has(report.id)
    ).length;

    if (battleLogOpen) {
      queueMicrotask(() => {
        setUnreadBattleReportCount(0);
      });
    } else if (unseenReportCount > 0) {
      queueMicrotask(() => {
        setUnreadBattleReportCount(
          (currentCount) => currentCount + unseenReportCount
        );
      });
    }

    knownBattleReportIdsRef.current = new Set(
      battleReports.map((report) => report.id)
    );
  }, [battleReports, battleLogOpen]);

  useEffect(() => {
    if (optimisticAttackUnits.length === 0) {
      return;
    }

    const serverAttackUnitIds = new Set(attackUnits.map((unit) => unit.id));

    queueMicrotask(() => {
      setOptimisticAttackUnits((currentUnits) =>
        currentUnits.filter((unit) => !serverAttackUnitIds.has(unit.id))
      );
    });
  }, [attackUnits, optimisticAttackUnits.length]);

  const visibleAttackUnits = useMemo(() => {
    if (optimisticAttackUnits.length === 0) {
      return attackUnits;
    }

    const mergedById = new Map<string, AttackUnitMarker>();

    for (const unit of optimisticAttackUnits) {
      mergedById.set(unit.id, unit);
    }

    for (const unit of attackUnits) {
      mergedById.set(unit.id, unit);
    }

    return [...mergedById.values()].sort(
      (left, right) =>
        new Date(left.launchedAt).getTime() -
        new Date(right.launchedAt).getTime()
    );
  }, [attackUnits, optimisticAttackUnits]);

  const gameplayOpen = phaseStatus === "ACTIVE" || phaseStatus === "TESTING";
  const hasUnreadChat = unreadChatCount > 0;
  const unreadBadgeLabel =
    unreadChatCount > 99 ? "99+" : unreadChatCount.toString();
  const hasUnreadBattleReports = unreadBattleReportCount > 0;
  const battleLogCountLabel =
    unreadBattleReportCount > 99 ? "99+" : unreadBattleReportCount.toString();
  const mapHexByTileId = useMemo(
    () => new Map(mapHexes.map((ownership) => [ownership.tileId, ownership])),
    [mapHexes]
  );
  const selectedTile = selectedTileId
    ? (HEX_TILES.find((tile) => tile.id === selectedTileId) ?? null)
    : null;
  const selectedOwnership = selectedTileId
    ? (mapHexByTileId.get(selectedTileId) ?? null)
    : null;
  const selectedTileIsHomeOfA = selectedTileId
    ? isHomeOfATile(selectedTileId)
    : false;
  const selectedTileBonus =
    selectedOwnership?.bonus ??
    (selectedTileIsHomeOfA ? getHomeOfABonus() : getTileBonus(selectedTile));
  const selectedPendingClaim = selectedOwnership?.pendingClaim ?? null;
  const selectedOwnGarrison = selectedOwnership?.ownGarrison ?? null;
  const selectedClaimCost =
    !selectedTileIsHomeOfA && !selectedOwnership?.ownerFortressId
      ? (selectedOwnership?.claimCost ?? null)
      : null;
  const selectedCanClaim = selectedOwnership?.canClaim ?? false;
  const selectedClaimDisabledReason =
    selectedOwnership?.claimDisabledReason ?? null;
  const selectedActiveBattlefieldId =
    selectedOwnership?.activeBattlefieldId ??
    (selectedTileId
      ? (battlefields.find(
          (battlefield) => battlefield.targetTileId === selectedTileId
        )?.id ?? null)
      : null);
  const currentOwnerId = playerFortress?.ownerId ?? null;
  const clampedTileAttackArmy =
    playerSummary && playerSummary.army > 0
      ? Math.min(Math.max(1, tileAttackArmy), playerSummary.army)
      : 0;
  function getBattleJoinArmy(battlefieldId: string) {
    if (!playerSummary || playerSummary.army <= 0) {
      return 0;
    }

    return Math.min(
      Math.max(1, battleJoinArmyById[battlefieldId] ?? 1),
      playerSummary.army
    );
  }
  function getBattleRecallArmy(battlefield: ActiveBattlefield) {
    if (battlefield.ownArmyRemaining <= 0) {
      return 0;
    }

    return Math.min(
      Math.max(1, battleRecallArmyById[battlefield.id] ?? battlefield.ownArmyRemaining),
      battlefield.ownArmyRemaining
    );
  }
  function getGarrisonRecallArmy(garrison: NonNullable<MapHexOwnershipMarker["ownGarrison"]>) {
    if (garrison.army <= 0) {
      return 0;
    }

    return Math.min(
      Math.max(1, garrisonRecallArmyById[garrison.id] ?? garrison.army),
      garrison.army
    );
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

  const getAttackValidationError = useCallback(
    (sentArmy: number) => {
      if (!playerSummary?.canSetAction) {
        return "You need an active castle before attacking.";
      }

      if (!playerSummary.race) {
        return "Choose a race from Castle before attacking.";
      }

      if (playerSummary.army <= 0) {
        return "You need at least 1 idle army before attacking.";
      }

      if (!Number.isInteger(sentArmy) || sentArmy <= 0) {
        return "Send at least 1 army.";
      }

      if (sentArmy > playerSummary.army) {
        return `You can send at most ${playerSummary.army} army.`;
      }

      if (
        playerSummary.outboundAttackUnitCount >=
        playerSummary.maxSimultaneousAttacks
      ) {
        return `Maximum attacks in flight (${playerSummary.outboundAttackUnitCount}/${playerSummary.maxSimultaneousAttacks}).`;
      }

      return null;
    },
    [playerSummary]
  );

  const handleConfirmAttackTarget = useCallback(
    async (fortress: MapFortress, sentArmy: number) => {
      if (!fortress.isTargetable || mapActionPending) {
        return;
      }

      const validationError = getAttackValidationError(sentArmy);

      if (validationError) {
        window.alert(validationError);
        return;
      }

      setSelectedFortressId(playerFortress?.id ?? null);
      setMapActionPending(true);

      try {
        const result = await attackFromMapAction(fortress.id, sentArmy);

        if (!result.ok) {
          window.alert(result.error);
          return;
        }

        router.refresh();
      } finally {
        setMapActionPending(false);
      }
    },
    [getAttackValidationError, mapActionPending, playerFortress?.id, router]
  );

  async function handleClaimMapHex(tileId: string) {
    if (mapActionPending || !gameplayOpen) {
      return;
    }

    setMapActionPending(true);

    try {
      const result = await claimMapHexAction(tileId);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      router.refresh();
    } finally {
      setMapActionPending(false);
    }
  }

  async function handleAttackMapHex(tileId: string, sentArmy: number) {
    if (mapActionPending || !gameplayOpen) {
      return;
    }

    const validationError = getAttackValidationError(sentArmy);

    if (validationError) {
      window.alert(validationError);
      return;
    }

    setMapActionPending(true);

    try {
      const result = await attackMapHexAction(tileId, sentArmy);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      if (isHomeOfATile(tileId) && result.launchedAttackUnit) {
        setOptimisticAttackUnits((currentUnits) => {
          const nextUnit: AttackUnitMarker = {
            ...result.launchedAttackUnit,
            launchedAt: new Date(result.launchedAttackUnit.launchedAt),
            arrivesAt: new Date(result.launchedAttackUnit.arrivesAt),
            recalledAt: result.launchedAttackUnit.recalledAt
              ? new Date(result.launchedAttackUnit.recalledAt)
              : null,
          };

          if (currentUnits.some((unit) => unit.id === nextUnit.id)) {
            return currentUnits;
          }

          return [...currentUnits, nextUnit];
        });
      }

      router.refresh();
    } finally {
      setMapActionPending(false);
    }
  }

  const handleRecallAttackUnit = useCallback(
    async (attackUnit: AttackUnitMarker) => {
      const result = await recallAttackUnitAction(attackUnit.id);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      router.refresh();
    },
    [router]
  );

  const handleInstantRecallAttackUnit = useCallback(
    async (attackUnit: AttackUnitMarker) => {
      const result = await instantRecallAttackUnitAction(attackUnit.id);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      router.refresh();
    },
    [router]
  );

  const handleRecallBattlefieldArmy = useCallback(
    async (battlefield: ActiveBattlefield, armyAmount: number) => {
      setBattleRecallPendingId(battlefield.id);

      try {
        const result = await recallBattlefieldArmyAction(
          battlefield.id,
          armyAmount
        );

        if (!result.ok) {
          window.alert(result.error);
          return;
        }

        router.refresh();
      } finally {
        setBattleRecallPendingId(null);
      }
    },
    [router]
  );

  const handleRecallGarrisonArmy = useCallback(
    async (
      garrison: NonNullable<MapHexOwnershipMarker["ownGarrison"]>,
      armyAmount: number
    ) => {
      setGarrisonRecallPendingId(garrison.id);

      try {
        const result = await recallGarrisonArmyAction(garrison.id, armyAmount);

        if (!result.ok) {
          window.alert(result.error);
          return;
        }

        router.refresh();
      } finally {
        setGarrisonRecallPendingId(null);
      }
    },
    [router]
  );

  const handleSelectFortress = useCallback(
    (fortress: MapFortress) => {
      if (fortress.isCurrentUser) {
        setSelectedFortressId(fortress.id);
        return;
      }

      if (homeOfA && fortress.fortressKind === "MEGA") {
        setSelectedTileId(homeOfA.tileId);
      }
    },
    [homeOfA]
  );

  const handleSelectMapHex = useCallback((tileId: string) => {
    setSelectedTileId(tileId);
  }, []);

  const actionButtons = (
    <div
      className={
        topActionsRoot
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
      {battleReports.length > 0 ? (
        <button
          type="button"
          className={`${styles.overlayButton} ${
            hasUnreadBattleReports ? styles.overlayButtonAttention : ""
          }`}
          aria-label={
            hasUnreadBattleReports
              ? `Battle log, ${unreadBattleReportCount} unread reports`
              : "Battle log"
          }
          aria-expanded={battleLogOpen}
          onClick={() => {
            setBattleLogOpen((current) => {
              const nextOpen = !current;

              if (nextOpen) {
                setUnreadBattleReportCount(0);
              }

              return nextOpen;
            });
          }}
        >
          <span className={styles.overlayButtonLabel}>Battle log</span>
          {hasUnreadBattleReports ? (
            <span className={styles.unreadBadge} aria-hidden="true">
              {battleLogCountLabel}
            </span>
          ) : null}
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
  const battleLogDrawer = battleLogOpen ? (
    <aside
      className={`${styles.drawer} ${styles.battleLogDrawer} ${styles.drawerOpen}`}
      aria-label="Battle log"
    >
      <button
        type="button"
        className={styles.closeButton}
        aria-label="Close battle log"
        onClick={() => setBattleLogOpen(false)}
      >
        Close
      </button>
      <div className={styles.drawerBody}>
        <div className={styles.sectionHeading}>
          <span className={styles.label}>Reports</span>
          <strong>{battleReports.length}</strong>
        </div>
        <div className={styles.battlefieldList}>
          {battleReports.slice(0, 12).map((report) => (
            <article key={report.id} className={styles.battlefieldCard}>
              <div className={styles.battlefieldCardHeader}>
                <strong>{report.targetName ?? "Battle report"}</strong>
                <span>{getBattleOutcomeLabel(report, currentOwnerId)}</span>
              </div>
              <ul className={styles.compactList}>
                {(report.reportLines ?? []).slice(0, 4).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </aside>
  ) : null;
  const selectedTilePanel = selectedTile ? (
    <aside className={styles.tilePanel} aria-label="Selected map tile">
      <div className={styles.tilePanelHeader}>
        <div>
          <span className={styles.label}>
            {selectedTileIsHomeOfA
              ? "Center objective"
              : BIOME_LABELS[selectedTile.biome]}
          </span>
          <strong>
            {selectedTileIsHomeOfA ? "Home of A" : `Tile ${selectedTile.id}`}
          </strong>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close tile details"
          onClick={() => setSelectedTileId(null)}
        >
          Close
        </button>
      </div>

      <dl className={styles.tileStats}>
        <div>
          <dt>Owner</dt>
          <dd>
            {selectedPendingClaim
              ? selectedPendingClaim.isCurrentUser
                ? "You (acquiring)"
                : `${selectedPendingClaim.ownerName} (acquiring)`
              : selectedOwnership?.ownerFortressId
              ? selectedOwnership.isCurrentUser
                ? "You"
                : selectedOwnership.ownerName
              : "Neutral"}
          </dd>
        </div>
        <div>
          <dt>Bonus</dt>
          <dd>{selectedTileBonus.label}</dd>
        </div>
        {selectedOwnership?.pointIncome ? (
          <div>
            <dt>Objective</dt>
            <dd>+{selectedOwnership.pointIncome} points / tick</dd>
          </div>
        ) : null}
        {!selectedTileIsHomeOfA ? (
          <div>
            <dt>Claim cost</dt>
            <dd>
              {selectedPendingClaim
                ? `${selectedPendingClaim.goldCost} gold paid`
                : selectedClaimCost !== null
                  ? `${selectedClaimCost} gold`
                  : "-"}
            </dd>
          </div>
        ) : null}
        {!selectedTileIsHomeOfA && !selectedOwnership?.ownerFortressId ? (
          <div>
            <dt>Claim time</dt>
            <dd>
              {selectedPendingClaim
                ? `${selectedPendingClaim.remainingSeconds >= 60 ? `${Math.ceil(selectedPendingClaim.remainingSeconds / 60)} min` : `${selectedPendingClaim.remainingSeconds}s`} left`
                : selectedOwnership?.claimDurationMinutes != null
                  ? `${selectedOwnership.claimDurationMinutes} min`
                  : "-"}
            </dd>
          </div>
        ) : null}
        {!selectedTileIsHomeOfA && selectedOwnership ? (
          <div>
            <dt>Size surcharge</dt>
            <dd>{selectedOwnership.sizeSurcharge ?? 0} gold</dd>
          </div>
        ) : null}
        {!selectedTileIsHomeOfA && selectedOwnership ? (
          <div>
            <dt>Connected</dt>
            <dd>
              {selectedOwnership.isConnectedToPlayerTerritory ? "Yes" : "No"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>State</dt>
          <dd>
            {selectedActiveBattlefieldId
              ? "Contested"
              : selectedPendingClaim
                ? "Acquiring"
              : selectedOwnership?.ownerFortressId
                ? selectedOwnership.canAttack
                  ? "Attackable"
                  : "Controlled"
                : selectedTileIsHomeOfA
                  ? homeOfA?.canAttack
                    ? "Attackable"
                    : "Center control"
                  : "Claimable"}
          </dd>
        </div>
      </dl>

      {selectedOwnership?.holders?.length ? (
        <ul className={styles.compactList}>
          {selectedOwnership.holders.slice(0, 4).map((holder) => (
            <li key={`${holder.fortressName}:${holder.commanderName}`}>
              {holder.fortressName}: weight {holder.contributionWeight}
            </li>
          ))}
        </ul>
      ) : null}

      {selectedOwnGarrison ? (
        <div className={styles.recallPanel}>
          <div className={styles.recallPanelHeader}>
            <span>Your garrison</span>
            <strong>{selectedOwnGarrison.army} army</strong>
          </div>
          {selectedOwnGarrison.army > 0 ? (
            <label className={styles.tileArmyControl}>
              <span>
                Recall: {getGarrisonRecallArmy(selectedOwnGarrison)}/
                {selectedOwnGarrison.army}
              </span>
              <input
                type="range"
                min={1}
                max={Math.max(1, selectedOwnGarrison.army)}
                step={1}
                value={Math.max(1, getGarrisonRecallArmy(selectedOwnGarrison))}
                onChange={(event) => {
                  const nextArmy = Number(event.currentTarget.value);
                  setGarrisonRecallArmyById((current) => ({
                    ...current,
                    [selectedOwnGarrison.id]: Number.isFinite(nextArmy)
                      ? Math.floor(nextArmy)
                      : 1,
                  }));
                }}
              />
            </label>
          ) : null}
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={
              !selectedOwnGarrison.canRecall ||
              garrisonRecallPendingId === selectedOwnGarrison.id
            }
            title={selectedOwnGarrison.recallDisabledReason ?? undefined}
            onClick={() => {
              void handleRecallGarrisonArmy(
                selectedOwnGarrison,
                getGarrisonRecallArmy(selectedOwnGarrison)
              );
            }}
          >
            {garrisonRecallPendingId === selectedOwnGarrison.id
              ? "Recalling..."
              : `Recall ${getGarrisonRecallArmy(selectedOwnGarrison)} army`}
          </button>
        </div>
      ) : null}

      {selectedActiveBattlefieldId ? (
        <p className={styles.helper}>
          This tile already has an active battlefield. Use the battle card to
          reinforce either side.
        </p>
      ) : null}

      {selectedPendingClaim ? (
        <p className={styles.helper}>
          Completes at{" "}
          {new Date(selectedPendingClaim.completesAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {selectedPendingClaim.isCurrentUser ? " — your acquisition." : "."}
        </p>
      ) : null}

      <div className={styles.tileActions}>
        {!selectedOwnership?.ownerFortressId &&
        !selectedPendingClaim &&
        !selectedTileIsHomeOfA ? (
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={
              mapActionPending ||
              !selectedCanClaim ||
              selectedClaimCost === null
            }
            title={selectedClaimDisabledReason ?? undefined}
            onClick={() => {
              void handleClaimMapHex(selectedTile.id);
            }}
          >
            Claim tile
          </button>
        ) : null}

        {(selectedOwnership?.canAttack ||
          (selectedTileIsHomeOfA && homeOfA?.canAttack)) &&
        !selectedActiveBattlefieldId ? (
          <>
            <label className={styles.tileArmyControl}>
              <span>
                Army to send: {clampedTileAttackArmy}/{playerSummary?.army ?? 0}
              </span>
              <input
                type="range"
                min={1}
                max={Math.max(1, playerSummary?.army ?? 1)}
                step={1}
                value={Math.max(1, clampedTileAttackArmy)}
                disabled={!playerSummary || playerSummary.army <= 0}
                onChange={(event) => {
                  const nextArmy = Number(event.currentTarget.value);
                  setTileAttackArmy(
                    Number.isFinite(nextArmy) ? Math.floor(nextArmy) : 1
                  );
                }}
              />
            </label>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={mapActionPending || clampedTileAttackArmy <= 0}
              onClick={() => {
                void handleAttackMapHex(selectedTile.id, clampedTileAttackArmy);
              }}
            >
              Attack with {clampedTileAttackArmy} army
            </button>
          </>
        ) : null}

        {selectedOwnership?.attackDisabledReason ||
        (selectedTileIsHomeOfA && homeOfA?.attackDisabledReason) ? (
          <p className={styles.helper}>
            {selectedTileIsHomeOfA
              ? homeOfA?.attackDisabledReason
              : selectedOwnership?.attackDisabledReason}
          </p>
        ) : null}
      </div>
    </aside>
  ) : null;

  const battlefieldsPanel =
    battlefields.length > 0 || battleReports.length > 0 ? (
      <aside className={styles.battlefieldPanel} aria-label="Active battles">
        {battlefields.length > 0 ? (
          <>
            <div className={styles.sectionHeading}>
              <span className={styles.label}>Battles</span>
              <strong>{battlefields.length}</strong>
            </div>
            <div className={styles.battlefieldList}>
              {battlefields.slice(0, 4).map((battlefield) => {
                const currentSide =
                  battlefield.currentUserSide === "ATTACKER"
                    ? "Joined attack"
                    : battlefield.currentUserSide === "DEFENDER"
                      ? "Joined defense"
                      : playerSummary?.army
                        ? "Choose a side to reinforce"
                        : "No idle army";
                const joinAmount = getBattleJoinArmy(battlefield.id);
                const recallAmount = getBattleRecallArmy(battlefield);

                return (
                  <article
                    key={battlefield.id}
                    className={styles.battlefieldCard}
                  >
                    <div className={styles.battlefieldCardHeader}>
                      <strong>
                        {battlefield.targetTileId
                          ? `${battlefield.targetName}${
                              battlefield.targetTileBiome
                                ? ` (${battlefield.targetTileBiome})`
                                : ""
                            } conquest`
                          : battlefield.targetName}
                      </strong>
                      <span>{battlefield.progress}%</span>
                    </div>
                    <progress value={battlefield.progress} max={100} />
                    {(() => {
                      const totalArmy =
                        (battlefield.attackerArmyRemaining ?? 0) +
                        (battlefield.defenderArmyRemaining ?? 0);
                      const attackerFlex =
                        totalArmy > 0
                          ? Math.max(
                              1,
                              (battlefield.attackerArmyRemaining / totalArmy) *
                                100
                            )
                          : 50;
                      const defenderFlex = Math.max(1, 100 - attackerFlex);
                      return (
                        <>
                          <div className={styles.armyBalanceBar}>
                            <div
                              className={styles.armyBalanceAttacker}
                              style={{ flex: attackerFlex }}
                            />
                            <div
                              className={styles.armyBalanceDefender}
                              style={{ flex: defenderFlex }}
                            />
                          </div>
                          <div className={styles.armyStats}>
                            <div className={styles.armyStatAttacker}>
                              <div className={styles.armyStatLabel}>
                                ⚔ {battlefield.attackerBanner.commanderName}
                              </div>
                              <div>{battlefield.attackerArmyLabel}</div>
                              {battlefield.attackerCasualties > 0 ? (
                                <div className={styles.armyStatLoss}>
                                  −{battlefield.attackerCasualties} lost
                                </div>
                              ) : null}
                            </div>
                            <div className={styles.armyStatDefender}>
                              <div className={styles.armyStatLabel}>
                                {battlefield.defenderBanner?.commanderName ??
                                  "Defenders"}{" "}
                                🛡
                              </div>
                              <div>{battlefield.defenderArmyLabel}</div>
                              {battlefield.defenderCasualties > 0 ? (
                                <div className={styles.armyStatLoss}>
                                  −{battlefield.defenderCasualties} lost
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    {battlefield.currentUserSide ? (
                      <p className={styles.helper}>
                        Your army: {battlefield.ownArmyRemaining}/
                        {battlefield.ownArmyCommitted} fighting
                        {battlefield.ownIncomingArmy > 0
                          ? `, ${battlefield.ownIncomingArmy} incoming`
                          : ""}
                        .{" "}
                        {battlefield.targetTileBonusLabel
                          ? `Tile bonus: ${battlefield.targetTileBonusLabel}.`
                          : ""}
                      </p>
                    ) : (
                      <p className={styles.helper}>
                        {currentSide}
                        {battlefield.targetTileBonusLabel
                          ? ` · Tile bonus: ${battlefield.targetTileBonusLabel}`
                          : ""}
                        .
                      </p>
                    )}
                    {battlefield.currentUserSide ? (
                      <div className={styles.recallPanel}>
                        {battlefield.ownArmyRemaining > 0 ? (
                          <label className={styles.battlefieldArmyControl}>
                            <span>
                              Recall: {recallAmount}/
                              {battlefield.ownArmyRemaining}
                            </span>
                            <input
                              type="range"
                              min={1}
                              max={Math.max(1, battlefield.ownArmyRemaining)}
                              step={1}
                              value={Math.max(1, recallAmount)}
                              onChange={(event) => {
                                const nextArmy = Number(
                                  event.currentTarget.value
                                );
                                setBattleRecallArmyById((current) => ({
                                  ...current,
                                  [battlefield.id]: Number.isFinite(nextArmy)
                                    ? Math.floor(nextArmy)
                                    : 1,
                                }));
                              }}
                            />
                          </label>
                        ) : null}
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={
                            !battlefield.canRecall ||
                            battleRecallPendingId === battlefield.id
                          }
                          title={
                            battlefield.recallDisabledReason ?? undefined
                          }
                          onClick={() => {
                            void handleRecallBattlefieldArmy(
                              battlefield,
                              recallAmount
                            );
                          }}
                        >
                          {battleRecallPendingId === battlefield.id
                            ? "Recalling..."
                            : `Recall ${recallAmount} army`}
                        </button>
                      </div>
                    ) : null}
                    {battlefield.incomingReinforcements.length > 0 ? (
                      <ul className={styles.compactList}>
                        {battlefield.incomingReinforcements
                          .slice(0, 3)
                          .map((unit) => (
                            <li key={unit.id}>
                              {unit.fortressName}: {unit.armyAmount ?? "?"} to{" "}
                              {unit.side.toLowerCase()} at{" "}
                              {unit.arrivesAt.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                    {playerSummary ? (
                      <>
                        {playerSummary.army <= 0 ? (
                          <p className={styles.helper}>
                            No idle army available for reinforcements.
                          </p>
                        ) : null}
                        {playerSummary.army > 0 ? (
                          <label className={styles.battlefieldArmyControl}>
                            <span>
                              Reinforcements: {joinAmount}/{playerSummary.army}
                            </span>
                            <input
                              type="range"
                              min={1}
                              max={Math.max(1, playerSummary.army)}
                              step={1}
                              value={Math.max(1, joinAmount)}
                              onChange={(event) => {
                                const nextArmy = Number(
                                  event.currentTarget.value
                                );
                                setBattleJoinArmyById((current) => ({
                                  ...current,
                                  [battlefield.id]: Number.isFinite(nextArmy)
                                    ? Math.floor(nextArmy)
                                    : 1,
                                }));
                              }}
                            />
                          </label>
                        ) : null}
                        <div className={styles.battlefieldJoinGrid}>
                          <form action={joinBattlefieldAction}>
                            <input
                              name="battlefieldId"
                              type="hidden"
                              value={battlefield.id}
                            />
                            <input name="side" type="hidden" value="ATTACKER" />
                            <input
                              name="armyAmount"
                              type="hidden"
                              value={joinAmount}
                            />
                            <button
                              className={styles.secondaryButton}
                              type="submit"
                              disabled={!battlefield.canJoinAttacker}
                              title={
                                battlefield.joinAttackerDisabledReason ??
                                undefined
                              }
                            >
                              Reinforce attack ({joinAmount})
                            </button>
                          </form>
                          <form action={joinBattlefieldAction}>
                            <input
                              name="battlefieldId"
                              type="hidden"
                              value={battlefield.id}
                            />
                            <input name="side" type="hidden" value="DEFENDER" />
                            <input
                              name="armyAmount"
                              type="hidden"
                              value={joinAmount}
                            />
                            <button
                              className={styles.secondaryButton}
                              type="submit"
                              disabled={!battlefield.canJoinDefender}
                              title={
                                battlefield.joinDefenderDisabledReason ??
                                undefined
                              }
                            >
                              Reinforce defense ({joinAmount})
                            </button>
                          </form>
                        </div>
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </aside>
    ) : null;

  const overlayRoot =
    typeof document !== "undefined"
      ? document.getElementById("battlefield-overlay-root")
      : null;
  const immersiveOverlay =
    immersive && overlayRoot
      ? createPortal(
          <div className={styles.immersiveOverlayUi}>
            {topActionsRoot ? null : actionButtons}
            {chatDrawer}
            {battleLogDrawer}
            {selectedTilePanel}
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
        {!immersive && !topActionsRoot ? actionButtons : null}
      </div>

      <div className={styles.mapStage}>
        {!immersive && !topActionsRoot ? actionButtons : null}
        {playerSummary ? (
          <NoticeToast
            autoDismissMs={null}
            message="Loot camps fight back now. Check their defending army before sending troops."
            storageKey={LOOT_CAMP_FIGHT_BACK_NOTICE_STORAGE_KEY}
          />
        ) : null}
        <FortressMap
          className={immersive ? styles.fullMap : undefined}
          fortresses={mapFortresses}
          mapHexes={mapHexes}
          attackUnits={visibleAttackUnits}
          selectedFortressId={selectedFortressId}
          selectedTargetId={selectedTargetId}
          selectedTileId={selectedTileId}
          onSelectFortress={handleSelectFortress}
          onConfirmAttackTarget={handleConfirmAttackTarget}
          onSelectMapHex={handleSelectMapHex}
          onRecallAttackUnit={handleRecallAttackUnit}
          onInstantRecallAttackUnit={handleInstantRecallAttackUnit}
        />

        {battlefieldsPanel}
        {!immersive ? selectedTilePanel : null}
        {!immersive ? chatDrawer : null}
        {!immersive ? battleLogDrawer : null}
      </div>
      {immersiveOverlay}
      {topbarActionsPortal}
    </section>
  );
}
