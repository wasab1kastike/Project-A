"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useRefreshView } from "@/lib/refresh-helpers";

import {
  attackFromMapAction,
  clearTilePressurePriorityAction,
  instantRecallAttackUnitAction,
  joinBattlefieldAction,
  markChatReadAction,
  relocateCastleToTileAction,
  recallBattlefieldArmyAction,
  recallAttackUnitAction,
  recallGarrisonArmyAction,
  recallArmyOrderAction,
  torchOccupiedMapHexAction,
  setTilePressurePriorityAction,
} from "@/app/game-actions";
import { ChatPanel } from "./chat-panel";

import {
  FortressMap,
  type AttackUnitMarker,
  type MapFortress,
  type MapHexOwnershipMarker,
} from "./fortress-map";
import {
  HEX_TILES,
  snapMapPointToHex,
  type HexBiome,
} from "@/lib/game/map-hex";
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
  allUnits: number;
  race: string | null;
  canSetAction: boolean;
  locationShuffleCost: number | null;
  canShuffleLocation: boolean;
  outboundAttackUnitCount: number;
  maxSimultaneousAttacks: number;
  seasonFourRulesEnabled?: boolean;
};

type PlayerFortress = {
  id: string;
  ownerId?: string;
  name: string;
};

type ActiveBattlefield = {
  id: string;
  targetTileId: string | null;
  targetFortressId: string | null;
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
  armyDelta: number;
  attackerSharePercent: number;
  incomingAttackerArmy: number;
  incomingDefenderArmy: number;
  incomingArmyDelta: number;
  battleAgeMinutes: number;
  battleStartsInMinutes: number;
  casualtiesPerTick: number;
  battleIntensityPercent: number;
  nextIncomingEtaMinutes: number | null;
  nextIncomingSide: "ATTACKER" | "DEFENDER";
  attackerToDefenderLossRatio: number | null;
  momentumScore: number;
  momentumTier:
    | "ATTACKER_STRONG"
    | "ATTACKER_EDGE"
    | "EVEN"
    | "DEFENDER_EDGE"
    | "DEFENDER_STRONG";
  attackBuffPercent: number;
  defenseBuffPercent: number;
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

function getBattlePressure(battlefield: ActiveBattlefield): {
  label: "Attack favored" | "Defense favored" | "Even fight";
  tone: "attacker" | "defender" | "even";
} {
  if (battlefield.momentumTier === "ATTACKER_STRONG") {
    return { label: "Attack favored", tone: "attacker" };
  }

  if (battlefield.momentumTier === "ATTACKER_EDGE") {
    return { label: "Attack favored", tone: "attacker" };
  }

  if (battlefield.momentumTier === "DEFENDER_STRONG") {
    return { label: "Defense favored", tone: "defender" };
  }

  if (battlefield.momentumTier === "DEFENDER_EDGE") {
    return { label: "Defense favored", tone: "defender" };
  }

  return { label: "Even fight", tone: "even" };
}

function formatBattleMinutes(value: number) {
  if (value < 60) {
    return `${value}m`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function getBattlePhase(battlefield: ActiveBattlefield): "PREPARING" | "LIVE" {
  return battlefield.battleStartsInMinutes > 0 ? "PREPARING" : "LIVE";
}

function getBattleTimingLabel(battlefield: ActiveBattlefield): string {
  return getBattlePhase(battlefield) === "PREPARING"
    ? `Starts in ${formatBattleMinutes(battlefield.battleStartsInMinutes)}`
    : `Live ${formatBattleMinutes(battlefield.battleAgeMinutes)}`;
}

function getBattlePaceLabel(battlefield: ActiveBattlefield): string {
  return getBattlePhase(battlefield) === "PREPARING"
    ? "Casualties paused"
    : `Pace ${battlefield.casualtiesPerTick}/tick (${battlefield.battleIntensityPercent}%)`;
}

function getBattleContextHelper(
  battlefield: ActiveBattlefield,
  isHomeBattle: boolean
): string | null {
  if (isHomeBattle || getBattlePhase(battlefield) === "LIVE") {
    return null;
  }

  return "Preparation window: defenders and allies can reinforce before casualty resolution starts.";
}

function getSelectedBattlefieldHelper({
  battlefield,
  isHomeOfA,
}: {
  battlefield: ActiveBattlefield | null;
  isHomeOfA: boolean;
}): string {
  if (isHomeOfA) {
    return "Home of A is already being fought. Send more army from here or use the battle card to recall committed army.";
  }

  if (battlefield && getBattlePhase(battlefield) === "PREPARING") {
    return "This tile is preparing for battle. Use the battle card to read pressure, reinforce before casualties start, or recall your committed army.";
  }

  return "This tile already has an active battlefield. Use the battle card to read pressure, reinforce, or recall your committed army.";
}

function formatLossRatio(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(2)}:1`;
}

type HomeOfAState = {
  tileId: string;
  pointIncome: number;
  status: "ALIVE" | "DEFEATED";
  statusLabel: string;
  incomeLabel: string;
  drainLabel: string;
  neutralDefenseArmy: number;
  holderCount: number;
  ownerFortressId: string | null;
  ownerName: string;
  ownerCommanderName: string;
  bannerFortressId: string | null;
  bannerName: string | null;
  isCurrentUserHolder: boolean;
  holders: Array<{
    fortressId: string;
    fortressName: string;
    commanderName: string;
    contributionWeight: number;
    capturedAt: Date;
    currentDrainPerTick: number;
    isCurrentUser: boolean;
  }>;
  activeBattlefieldId: string | null;
  bossHealth: number;
  bossMaxHealth: number;
  bossReward: number;
  respawnsAt: Date | null;
  canAttack: boolean;
  attackDisabledReason: string | null;
} | null;

const LOOT_CAMP_FIGHT_BACK_NOTICE_STORAGE_KEY =
  "project-a:loot-camp-fight-back-notice:2026-04-30";
const SEA_MOUNTAIN_CLAIM_NOTICE_STORAGE_KEY =
  "project-a:sea-mountain-claim-notice:2026-05-11";
const CASTLE_YEET_NOTICE_STORAGE_KEY =
  "project-a:castle-yeet-notice:2026-05-11";
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
const SEASON_FOUR_CRESTS = {
  PRESSURE: {
    label: "Pressure",
    path: "/assets/ui/crest-pressure.webp",
  },
  CAMPAIGN: {
    label: "Campaign",
    path: "/assets/ui/crest-campaign.webp",
  },
  GUARD: {
    label: "Guard",
    path: "/assets/ui/crest-guard.webp",
  },
  MONUMENT: {
    label: "Monument",
    path: "/assets/ui/crest-monument.webp",
  },
} as const;

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
  alliedRoads = [],
  roadSegments = [],
  battalionMarkers = [],
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
  alliedRoads?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  roadSegments?: Array<{ tileId: string; level: number; crossings: number }>;
  battalionMarkers?: Array<{
    tileId: string;
    battalionName: string;
    size: number;
    maxSize: number;
    tier: number;
    stance: string;
    unitSpriteVariant: string;
    unitCosmeticVariant: string | null;
    race: string | null;
  }>;
  battleReports: BattleReport[];
  availableTargets: unknown[];
  chat: ChatProps;
  phaseStatus: string | null;
  canEditRegistrationName: boolean;
  immersive?: boolean;
  topActionsContainerId?: string;
}) {
  const router = useRouter();
  const refreshView = useRefreshView();
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
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const knownChatMessageIdsRef = useRef(
    new Set(chat.messages.map((message) => message.id))
  );
  const knownBattleReportIdsRef = useRef(
    new Set(battleReports.map((report) => report.id))
  );
  const markChatReadPendingRef = useRef(false);
  const selectedTargetId = null;
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [selectedBattlefieldId, setSelectedBattlefieldId] = useState<
    string | null
  >(null);
  const [selectedBattleTileId, setSelectedBattleTileId] = useState<
    string | null
  >(null);
  const [selectedBattleFortressId, setSelectedBattleFortressId] = useState<
    string | null
  >(null);
  const [castleYeetArmed, setCastleYeetArmed] = useState(false);
  const [tileAttackArmy, setTileAttackArmy] = useState(1);
  const [tileFortifyArmy, setTileFortifyArmy] = useState(1);
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
  const [battleJoinPendingId, setBattleJoinPendingId] = useState<string | null>(
    null
  );
  const [garrisonRecallPendingId, setGarrisonRecallPendingId] = useState<
    string | null
  >(null);
  const [garrisonTorchPendingId, setGarrisonTorchPendingId] = useState<
    string | null
  >(null);
  const [optimisticAttackUnits, setOptimisticAttackUnits] = useState<
    AttackUnitMarker[]
  >([]);
  const mapActionPendingRef = useRef(mapActionPending);
  const playerFortressIdRef = useRef<string | null>(playerFortress?.id ?? null);
  const homeTileIdRef = useRef<string | null>(homeOfA?.tileId ?? null);

  useEffect(() => {
    mapActionPendingRef.current = mapActionPending;
  }, [mapActionPending]);

  useEffect(() => {
    playerFortressIdRef.current = playerFortress?.id ?? null;
  }, [playerFortress?.id]);

  useEffect(() => {
    homeTileIdRef.current = homeOfA?.tileId ?? null;
  }, [homeOfA?.tileId]);

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
    queueMicrotask(() =>
      setOverlayRoot(document.getElementById("battlefield-overlay-root"))
    );
  }, []);

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
  const selectedOwnGarrison = selectedOwnership?.ownGarrison ?? null;
  const selectedPressurePriority = selectedOwnership?.pressurePriority ?? false;
  const selectedCanPrioritizePressure =
    selectedOwnership?.canPrioritizePressure ?? false;
  const selectedPressurePriorityDisabledReason =
    selectedOwnership?.pressurePriorityDisabledReason ?? null;
  const selectedTileIsSeasonFourMonument =
    selectedTileIsHomeOfA && Boolean(playerSummary?.seasonFourRulesEnabled);
  const selectedSeasonFourFeature = playerSummary?.seasonFourRulesEnabled
    ? selectedTileIsSeasonFourMonument
      ? SEASON_FOUR_CRESTS.MONUMENT
      : !selectedOwnership?.ownerFortressId
        ? SEASON_FOUR_CRESTS.PRESSURE
        : selectedOwnership.isCurrentUser
          ? SEASON_FOUR_CRESTS.GUARD
          : SEASON_FOUR_CRESTS.CAMPAIGN
    : null;
  const selectedActiveBattlefieldId =
    selectedOwnership?.activeBattlefieldId ??
    (selectedTileId
      ? (battlefields.find(
          (battlefield) => battlefield.targetTileId === selectedTileId
        )?.id ?? null)
      : null);
  const selectedActiveBattlefield = selectedActiveBattlefieldId
    ? (battlefields.find(
        (battlefield) => battlefield.id === selectedActiveBattlefieldId
      ) ?? null)
    : null;
  const selectedBattlefields = useMemo(() => {
    if (selectedBattlefieldId) {
      return battlefields.filter(
        (battlefield) => battlefield.id === selectedBattlefieldId
      );
    }

    if (selectedBattleTileId) {
      return battlefields.filter(
        (battlefield) => battlefield.targetTileId === selectedBattleTileId
      );
    }

    if (selectedBattleFortressId) {
      return battlefields.filter(
        (battlefield) =>
          battlefield.targetTileId === null &&
          (battlefield.targetFortressId === selectedBattleFortressId ||
            battlefield.attackerBanner.id === selectedBattleFortressId ||
            battlefield.defenderBanner?.id === selectedBattleFortressId)
      );
    }

    return [];
  }, [
    battlefields,
    selectedBattlefieldId,
    selectedBattleFortressId,
    selectedBattleTileId,
  ]);
  const occupiedFortressTileIds = useMemo(() => {
    return new Set(
      mapFortresses.map((fortress) => {
        return snapMapPointToHex({
          x: fortress.mapX,
          y: fortress.mapY,
        }).tile.id;
      })
    );
  }, [mapFortresses]);
  const playerFortressTileId = useMemo(() => {
    if (!playerFortress) {
      return null;
    }

    const currentFortress = mapFortresses.find((fortress) => {
      return fortress.id === playerFortress.id;
    });

    if (!currentFortress) {
      return null;
    }

    return snapMapPointToHex({
      x: currentFortress.mapX,
      y: currentFortress.mapY,
    }).tile.id;
  }, [mapFortresses, playerFortress]);
  const selectedTileTargetableCastle = useMemo(() => {
    if (!selectedTileId) {
      return null;
    }

    const candidates = mapFortresses.filter((fortress) => {
      if (!fortress.isTargetable) {
        return false;
      }

      return (
        snapMapPointToHex({
          x: fortress.mapX,
          y: fortress.mapY,
        }).tile.id === selectedTileId
      );
    });

    candidates.sort((left, right) => {
      const leftPriority =
        left.fortressKind === "PLAYER" && !left.isNpc
          ? 0
          : left.fortressKind === "PLAYER"
            ? 1
            : 2;
      const rightPriority =
        right.fortressKind === "PLAYER" && !right.isNpc
          ? 0
          : right.fortressKind === "PLAYER"
            ? 1
            : 2;

      return (
        leftPriority - rightPriority ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
      );
    });

    return candidates[0] ?? null;
  }, [mapFortresses, selectedTileId]);
  const hasActiveBattleForTileId = useCallback(
    (tileId: string) => {
      const ownership = mapHexByTileId.get(tileId);

      if (ownership?.activeBattlefieldId) {
        return true;
      }

      return battlefields.some(
        (battlefield) => battlefield.targetTileId === tileId
      );
    },
    [battlefields, mapHexByTileId]
  );
  const activeBattleFortressIds = useMemo(
    () =>
      battlefields
        .filter((battlefield) => battlefield.targetFortressId !== null)
        .flatMap((battlefield) => [
          battlefield.targetFortressId,
          battlefield.attackerBanner.id,
          battlefield.defenderBanner?.id ?? null,
        ])
        .filter((fortressId): fortressId is string => fortressId !== null),
    [battlefields]
  );
  const hasActiveBattleForFortressId = useCallback(
    (fortressId: string) => {
      return battlefields.some(
        (battlefield) =>
          battlefield.targetFortressId === fortressId ||
          battlefield.attackerBanner.id === fortressId ||
          battlefield.defenderBanner?.id === fortressId
      );
    },
    [battlefields]
  );
  const currentOwnerId = playerFortress?.ownerId ?? null;
  const clampedTileAttackArmy =
    playerSummary && playerSummary.army > 0
      ? Math.min(Math.max(1, tileAttackArmy), playerSummary.army)
      : 0;
  const clampedTileFortifyArmy =
    playerSummary && playerSummary.army > 0
      ? Math.min(Math.max(1, tileFortifyArmy), playerSummary.army)
      : 0;

  const getCastleYeetValidationError = useCallback(
    (tileId: string) => {
      if (!gameplayOpen) {
        return "Fortress relocation is only available during gameplay.";
      }

      if (!playerSummary?.canShuffleLocation) {
        return "Castle Yeet is unavailable right now.";
      }

      if (!playerSummary.race) {
        return "Choose a race from Castle before relocating.";
      }

      if (playerFortressTileId && tileId === playerFortressTileId) {
        return "Choose a different destination tile.";
      }

      if (
        occupiedFortressTileIds.has(tileId) &&
        (!playerFortressTileId || tileId !== playerFortressTileId)
      ) {
        return "That destination tile is occupied right now.";
      }

      return null;
    },
    [gameplayOpen, occupiedFortressTileIds, playerFortressTileId, playerSummary]
  );

  const selectedCastleYeetError = selectedTileId
    ? getCastleYeetValidationError(selectedTileId)
    : "Select a destination tile to relocate your castle.";
  const locationShuffleCost = playerSummary?.locationShuffleCost ?? null;
  const canShuffleLocation = playerSummary?.canShuffleLocation ?? false;
  const castleYeetTargetTileIds = useMemo(() => {
    if (!castleYeetArmed || !canShuffleLocation) {
      return [];
    }

    const currentFortress = playerFortress
      ? (mapFortresses.find((fortress) => fortress.id === playerFortress.id) ??
        null)
      : null;
    const currentTileId = currentFortress
      ? snapMapPointToHex({
          x: currentFortress.mapX,
          y: currentFortress.mapY,
        }).tile.id
      : null;
    const occupiedTileIds = new Set(
      mapFortresses.map((fortress) => {
        return snapMapPointToHex({
          x: fortress.mapX,
          y: fortress.mapY,
        }).tile.id;
      })
    );

    return HEX_TILES.filter((tile) => {
      if (!tile.spawnable) {
        return false;
      }

      if (currentTileId && tile.id === currentTileId) {
        return false;
      }

      return !occupiedTileIds.has(tile.id);
    }).map((tile) => tile.id);
  }, [castleYeetArmed, canShuffleLocation, mapFortresses, playerFortress]);

  function getBattleJoinArmy(battlefieldId: string) {
    if (!playerSummary || playerSummary.army <= 0) {
      return 0;
    }

    return Math.min(
      Math.max(1, battleJoinArmyById[battlefieldId] ?? 1),
      playerSummary.army
    );
  }

  async function handleJoinBattlefield(
    battlefieldId: string,
    side: "ATTACKER" | "DEFENDER",
    armyAmount: number
  ) {
    if (battleJoinPendingId) return;
    setBattleJoinPendingId(battlefieldId + ":" + side);
    try {
      const result = await joinBattlefieldAction(
        battlefieldId,
        side,
        armyAmount
      );
      if (result.ok) {
        refreshView();
      } else {
        window.alert(result.error);
      }
    } finally {
      setBattleJoinPendingId(null);
    }
  }

  function getBattleRecallArmy(battlefield: ActiveBattlefield) {
    if (battlefield.ownArmyRemaining <= 0) {
      return 0;
    }

    return Math.min(
      Math.max(
        1,
        battleRecallArmyById[battlefield.id] ?? battlefield.ownArmyRemaining
      ),
      battlefield.ownArmyRemaining
    );
  }
  function getGarrisonRecallArmy(
    garrison: NonNullable<MapHexOwnershipMarker["ownGarrison"]>
  ) {
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
      if (!fortress.isTargetable || mapActionPendingRef.current) {
        return;
      }

      const validationError = getAttackValidationError(sentArmy);

      if (validationError) {
        window.alert(validationError);
        return;
      }

      setSelectedFortressId(playerFortressIdRef.current);
      setMapActionPending(true);

      try {
        const result = await attackFromMapAction(fortress.id, sentArmy);

        if (!result.ok) {
          window.alert(result.error);
          return;
        }

        refreshView();
      } finally {
        setMapActionPending(false);
      }
    },
    [getAttackValidationError, router]
  );

  async function handleSetTilePressurePriority(tileId: string) {
    if (mapActionPending || !gameplayOpen) {
      return;
    }

    setMapActionPending(true);

    try {
      const result = await setTilePressurePriorityAction(tileId);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      refreshView();
    } finally {
      setMapActionPending(false);
    }
  }

  async function handleClearTilePressurePriority(tileId: string) {
    if (mapActionPending || !gameplayOpen) {
      return;
    }

    setMapActionPending(true);

    try {
      const result = await clearTilePressurePriorityAction(tileId);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      refreshView();
    } finally {
      setMapActionPending(false);
    }
  }

  // Removed: manual tile attack, fortify, campaign, guard.
  // Replaced by auto-war dispatch + guard % slider (Castle → War Room).
  function handleAttackMapHex(_a: string, _b: number) {}
  function handleFortifyMapHex(_a: string, _b: number) {}
  function handleStartTerritoryCampaign(_a: string, _b: number) {}
  function handleStationGuardOrder(_a: string, _b: number) {}

  async function handleRecallArmyOrder(armyOrderId: string) {
    if (mapActionPending || !gameplayOpen) {
      return;
    }

    setMapActionPending(true);

    try {
      const result = await recallArmyOrderAction(armyOrderId);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      refreshView();
    } finally {
      setMapActionPending(false);
    }
  }

  async function handleRelocateCastleToTile(tileId: string) {
    if (!castleYeetArmed || mapActionPending || !gameplayOpen) {
      return;
    }

    const validationError = getCastleYeetValidationError(tileId);

    if (validationError) {
      window.alert(validationError);
      return;
    }

    setMapActionPending(true);

    try {
      const result = await relocateCastleToTileAction(tileId);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      setCastleYeetArmed(false);
      refreshView();
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

      refreshView();
    },
    [refreshView]
  );

  const handleInstantRecallAttackUnit = useCallback(
    async (attackUnit: AttackUnitMarker) => {
      const result = await instantRecallAttackUnitAction(attackUnit.id);

      if (!result.ok) {
        window.alert(result.error);
        return;
      }

      refreshView();
    },
    [refreshView]
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

        refreshView();
      } finally {
        setBattleRecallPendingId(null);
      }
    },
    [refreshView]
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

        refreshView();
      } finally {
        setGarrisonRecallPendingId(null);
      }
    },
    [refreshView]
  );

  const handleTorchOccupiedMapHex = useCallback(
    async (garrison: NonNullable<MapHexOwnershipMarker["ownGarrison"]>) => {
      setGarrisonTorchPendingId(garrison.id);

      try {
        const result = await torchOccupiedMapHexAction(garrison.id);

        if (!result.ok) {
          window.alert(result.error);
          return;
        }

        refreshView();
      } finally {
        setGarrisonTorchPendingId(null);
      }
    },
    [refreshView]
  );

  const handleSelectFortress = useCallback(
    (fortress: MapFortress) => {
      let tileId: string | null = null;

      setSelectedBattlefieldId(null);

      if (fortress.isCurrentUser) {
        setSelectedFortressId(fortress.id);
        tileId = snapMapPointToHex({
          x: fortress.mapX,
          y: fortress.mapY,
        }).tile.id;
      }

      const homeTileId = homeTileIdRef.current;

      if (homeTileId && fortress.fortressKind === "MEGA") {
        tileId = homeTileId;
      }

      if (!tileId && !fortress.isCurrentUser) {
        tileId = snapMapPointToHex({
          x: fortress.mapX,
          y: fortress.mapY,
        }).tile.id;
      }

      if (!tileId) {
        setSelectedBattleTileId(null);
        setSelectedBattleFortressId(
          hasActiveBattleForFortressId(fortress.id) ? fortress.id : null
        );
        return;
      }

      setSelectedTileId(tileId);
      setSelectedBattleTileId(hasActiveBattleForTileId(tileId) ? tileId : null);
      setSelectedBattleFortressId(
        hasActiveBattleForFortressId(fortress.id) ? fortress.id : null
      );
    },
    [hasActiveBattleForFortressId, hasActiveBattleForTileId]
  );

  const handleSelectMapHex = useCallback(
    (tileId: string) => {
      setSelectedBattlefieldId(null);
      setSelectedTileId(tileId);
      setSelectedBattleTileId(hasActiveBattleForTileId(tileId) ? tileId : null);
      setSelectedBattleFortressId(null);
    },
    [hasActiveBattleForTileId]
  );

  const handleViewBattleReport = useCallback(
    (report: BattleReport) => {
      const battlefield = battlefields.find(
        (candidate) => candidate.id === report.id
      );

      if (!battlefield) {
        return;
      }

      setSelectedBattlefieldId(battlefield.id);
      setSelectedBattleTileId(battlefield.targetTileId);
      setSelectedBattleFortressId(
        battlefield.targetTileId === null
          ? (battlefield.targetFortressId ?? battlefield.attackerBanner.id)
          : null
      );

      if (battlefield.targetTileId) {
        setSelectedTileId(battlefield.targetTileId);
      }

      setBattleLogOpen(false);
    },
    [battlefields]
  );

  useEffect(() => {
    if (!playerSummary?.canShuffleLocation || !gameplayOpen) {
      queueMicrotask(() => setCastleYeetArmed(false));
    }
  }, [gameplayOpen, playerSummary?.canShuffleLocation]);

  useEffect(() => {
    if (!selectedBattlefieldId) {
      return;
    }

    if (
      !battlefields.some(
        (battlefield) => battlefield.id === selectedBattlefieldId
      )
    ) {
      queueMicrotask(() => setSelectedBattlefieldId(null));
    }
  }, [battlefields, selectedBattlefieldId]);

  useEffect(() => {
    if (!selectedBattleTileId) {
      return;
    }

    if (!hasActiveBattleForTileId(selectedBattleTileId)) {
      queueMicrotask(() => setSelectedBattleTileId(null));
    }
  }, [hasActiveBattleForTileId, selectedBattleTileId]);

  useEffect(() => {
    if (!selectedBattleFortressId) {
      return;
    }

    if (!hasActiveBattleForFortressId(selectedBattleFortressId)) {
      queueMicrotask(() => setSelectedBattleFortressId(null));
    }
  }, [hasActiveBattleForFortressId, selectedBattleFortressId]);

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
          authorName={playerSummary?.name ?? ""}
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
          {battleReports.slice(0, 12).map((report) => {
            const canViewBattle =
              report.outcome === "IN_PROGRESS" &&
              battlefields.some((battlefield) => battlefield.id === report.id);

            return (
              <article key={report.id} className={styles.battlefieldCard}>
                <div className={styles.battlefieldCardHeader}>
                  <strong>{report.targetName ?? "Battle report"}</strong>
                  <span>{getBattleOutcomeLabel(report, currentOwnerId)}</span>
                </div>
                <ul className={styles.compactList}>
                  {(report.reportLines ?? []).slice(0, 6).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {canViewBattle ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => handleViewBattleReport(report)}
                  >
                    View fight
                  </button>
                ) : null}
              </article>
            );
          })}
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
              ? selectedTileIsSeasonFourMonument
                ? "Center monument"
                : "Center objective"
              : BIOME_LABELS[selectedTile.biome]}
          </span>
          <strong>
            {selectedTileIsHomeOfA
              ? selectedTileIsSeasonFourMonument
                ? "Monument of A"
                : "Home of A"
              : `Tile ${selectedTile.id}`}
          </strong>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close tile details"
          onClick={() => {
            setSelectedTileId(null);
            setSelectedBattleTileId(null);
          }}
        >
          Close
        </button>
      </div>

      {selectedTileIsHomeOfA && homeOfA && !selectedTileIsSeasonFourMonument ? (
        <section
          className={styles.homeOfAStatus}
          aria-label={
            selectedTileIsSeasonFourMonument
              ? "Monument of A status"
              : "Home of A status"
          }
          data-status={homeOfA.status.toLowerCase()}
        >
          <div className={styles.homeOfAStatusHeader}>
            <div>
              <span className={styles.label}>Status</span>
              <strong>{homeOfA.statusLabel}</strong>
            </div>
            <span className={styles.homeOfAStatusBadge}>
              {homeOfA.status.toLowerCase()}
            </span>
          </div>
          <dl className={styles.homeOfAMetrics}>
            {!selectedTileIsSeasonFourMonument ? (
              <div>
                <dt>Health</dt>
                <dd>
                  {homeOfA.bossHealth}/{homeOfA.bossMaxHealth} HP
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Reward</dt>
              <dd>{homeOfA.incomeLabel}</dd>
            </div>
            <div>
              <dt>Buff</dt>
              <dd>{homeOfA.drainLabel}</dd>
            </div>
          </dl>
          <p className={styles.helper}>
            {homeOfA.canAttack
              ? "Send army to damage the boss. The top damage dealer when it dies receives the reward."
              : (homeOfA.attackDisabledReason ?? "Home of A is unavailable.")}
          </p>
        </section>
      ) : null}

      {selectedSeasonFourFeature && playerSummary ? (
        <section className="tileCommandPanel" aria-label="Tile info">
          <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0", margin: 0 }}>
            Manage army, war fronts, guard allocation, and campaign dispatch
            from <strong>Castle &rarr; War Room</strong>.
          </p>
        </section>
      ) : null}

      <details className={styles.tileDetails}>
        <summary>Tile details</summary>
      <dl className={styles.tileStats}>
        <div>
          <dt>Owner</dt>
          <dd>
            {selectedOwnership?.ownerFortressId
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
        {!selectedTileIsHomeOfA && selectedOwnership ? (
          <div>
            <dt>Pressure</dt>
            <dd>
              {selectedOwnership.pressureThreshold != null
                ? `You ${selectedOwnership.pressurePlayerProgress ?? 0}/${selectedOwnership.pressureThreshold}`
                : "-"}
              {selectedOwnership.pressureLeaderLabel &&
              selectedOwnership.pressureProgress != null &&
              selectedOwnership.pressureThreshold != null
                ? `, leader ${selectedOwnership.pressureLeaderLabel} ${selectedOwnership.pressureProgress}/${selectedOwnership.pressureThreshold}`
                : ""}
            </dd>
          </div>
        ) : null}
        {playerSummary?.seasonFourRulesEnabled &&
        selectedOwnership?.campaignStatus ? (
          <div>
            <dt>Campaign</dt>
            <dd>
              {selectedOwnership.campaignStatus === "SIEGE_WARNING"
                ? "Siege warning"
                : selectedOwnership.campaignStatus === "ENGAGED"
                  ? "Siege active"
                  : "Building pressure"}
              {selectedOwnership.campaignProgress != null &&
              selectedOwnership.campaignThreshold != null
                ? ` ${selectedOwnership.campaignProgress}/${selectedOwnership.campaignThreshold}`
                : ""}
            </dd>
          </div>
        ) : null}
        {!selectedTileIsHomeOfA && !selectedOwnership?.ownerFortressId ? (
          <div>
            <dt>Priority</dt>
            <dd>{selectedPressurePriority ? "Yes" : "No"}</dd>
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
              : selectedOwnership?.occupyingGarrison
                ? selectedOwnership.occupyingGarrison.isCurrentUser
                  ? "Occupied by you"
                  : "Occupied"
                : selectedOwnership?.ownerFortressId
                  ? selectedOwnership.canAttack
                    ? "Attackable"
                    : "Controlled"
                    : selectedTileIsHomeOfA
                      ? homeOfA?.canAttack
                        ? "Attackable"
                        : "Center control"
                      : selectedCanPrioritizePressure
                        ? "Pressure target"
                        : "Unavailable"}
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

      {selectedOwnership?.occupyingGarrison ? (
        <p className={styles.helper}>
          Occupied by {selectedOwnership.occupyingGarrison.fortressName} with{" "}
          {selectedOwnership.occupyingGarrison.army} army. The strongest
          occupier receives this tile&apos;s bonus.
        </p>
      ) : null}

      {selectedOwnGarrison ? (
        <div className={styles.recallPanel}>
          <div className={styles.recallPanelHeader}>
            <span>Holding force</span>
            <strong>{selectedOwnGarrison.army} army</strong>
          </div>
          <p className={styles.recallCopy}>
            Recall marches home; losses stay lost.
          </p>
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
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={
              !selectedOwnGarrison.canTorch ||
              garrisonTorchPendingId === selectedOwnGarrison.id
            }
            title={selectedOwnGarrison.torchDisabledReason ?? undefined}
            onClick={() => {
              void handleTorchOccupiedMapHex(selectedOwnGarrison);
            }}
          >
            {garrisonTorchPendingId === selectedOwnGarrison.id
              ? "Torching..."
              : "Torch tile"}
          </button>
        </div>
      ) : null}

      {selectedActiveBattlefieldId ? (
        <p className={styles.helper}>
          {getSelectedBattlefieldHelper({
            battlefield: selectedActiveBattlefield,
            isHomeOfA: selectedTileIsHomeOfA,
          })}
        </p>
      ) : null}
      </details>

      <div className={styles.tileActions}>
        {(locationShuffleCost !== null && !playerSummary?.seasonFourRulesEnabled) ? (
          <>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={
                mapActionPending || !gameplayOpen || !canShuffleLocation
              }
              onClick={() => {
                setCastleYeetArmed((current) => !current);
              }}
            >
              {castleYeetArmed
                ? "Cancel Castle Yeet targeting"
                : `Castle Yeet (${locationShuffleCost} gold)`}
            </button>
            {castleYeetArmed ? (
              <>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={
                    mapActionPending || selectedCastleYeetError !== null
                  }
                  onClick={() => {
                    if (selectedTile) {
                      void handleRelocateCastleToTile(selectedTile.id);
                    }
                  }}
                >
                  Teleport castle to selected tile
                </button>
                <p className={styles.helper}>
                  {selectedCastleYeetError ??
                    "Green tiles are valid Castle Yeet destinations."}
                </p>
              </>
            ) : null}
          </>
        ) : null}

        {!playerSummary?.seasonFourRulesEnabled &&
        !selectedOwnership?.ownerFortressId &&
        !selectedTileIsHomeOfA ? (
          <>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={
                mapActionPending ||
                (!selectedPressurePriority && !selectedCanPrioritizePressure)
              }
              title={selectedPressurePriorityDisabledReason ?? undefined}
              onClick={() => {
                if (selectedPressurePriority) {
                  void handleClearTilePressurePriority(selectedTile.id);
                } else {
                  void handleSetTilePressurePriority(selectedTile.id);
                }
              }}
            >
              {selectedPressurePriority ? "Clear priority" : "Prioritize"}
            </button>
            {selectedPressurePriorityDisabledReason ? (
              <p className={styles.helper}>
                {selectedPressurePriorityDisabledReason}
              </p>
            ) : null}
          </>
        ) : null}

        {selectedTileTargetableCastle && !playerSummary?.seasonFourRulesEnabled ? (
          <>
            <label className={styles.tileArmyControl}>
              <span>
                Castle raid: {clampedTileAttackArmy}/{playerSummary?.army ?? 0}
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
                void handleConfirmAttackTarget(
                  selectedTileTargetableCastle,
                  clampedTileAttackArmy
                );
              }}
            >
              Attack {selectedTileTargetableCastle.name} with{" "}
              {clampedTileAttackArmy} army
            </button>
          </>
        ) : null}

        {!playerSummary?.seasonFourRulesEnabled &&
        (selectedOwnership?.canAttack ||
          (selectedTileIsHomeOfA && homeOfA?.canAttack)) &&
        (!selectedActiveBattlefieldId || selectedTileIsHomeOfA) ? (
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

        {!playerSummary?.seasonFourRulesEnabled &&
        (selectedOwnership?.attackDisabledReason ||
        (selectedTileIsHomeOfA && homeOfA?.attackDisabledReason) ? (
          <p className={styles.helper}>
            {selectedTileIsHomeOfA
              ? homeOfA?.attackDisabledReason
              : selectedOwnership?.attackDisabledReason}
          </p>
        ) : null)}

        {selectedOwnership?.isCurrentUser &&
        !playerSummary?.seasonFourRulesEnabled ? (
          <>
            <label className={styles.tileArmyControl}>
              <span>
                Fortify: {clampedTileFortifyArmy}/{playerSummary?.army ?? 0}
              </span>
              <input
                type="range"
                min={1}
                max={Math.max(1, playerSummary?.army ?? 1)}
                step={1}
                value={Math.max(1, clampedTileFortifyArmy)}
                disabled={!playerSummary || playerSummary.army <= 0}
                onChange={(event) => {
                  const nextArmy = Number(event.currentTarget.value);
                  setTileFortifyArmy(
                    Number.isFinite(nextArmy) ? Math.floor(nextArmy) : 1
                  );
                }}
              />
            </label>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={
                mapActionPending ||
                clampedTileFortifyArmy <= 0 ||
                !selectedOwnership.canFortify
              }
              title={selectedOwnership.fortifyDisabledReason ?? undefined}
              onClick={() => {
                void handleFortifyMapHex(
                  selectedTile.id,
                  clampedTileFortifyArmy
                );
              }}
            >
              Fortify with {clampedTileFortifyArmy} army
            </button>
            {selectedOwnership.fortifyDisabledReason ? (
              <p className={styles.helper}>
                {selectedOwnership.fortifyDisabledReason}
              </p>
            ) : null}
          </>
        ) : null}

        {!selectedSeasonFourFeature &&
        playerSummary?.seasonFourRulesEnabled &&
        selectedOwnership?.ownerFortressId &&
        !selectedOwnership.isCurrentUser ? (
          <>
            {selectedOwnership.campaignStatus ? (
              <>
                <p className={styles.helper}>
                  {selectedOwnership.campaignStatus === "SIEGE_WARNING" &&
                  selectedOwnership.campaignResponseEndsAt
                    ? `Siege warning active until ${new Date(selectedOwnership.campaignResponseEndsAt).toLocaleString()}.`
                    : selectedOwnership.campaignStatus === "ENGAGED"
                      ? "Siege combat is resolving automatically."
                      : "Campaign pressure advances each tick."}
                </p>
                {selectedOwnership.isOwnCampaign &&
                selectedOwnership.campaignOrderId &&
                selectedOwnership.campaignStatus !== "ENGAGED" ? (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={mapActionPending}
                    onClick={() => {
                      void handleRecallArmyOrder(selectedOwnership.campaignOrderId!);
                    }}
                  >
                    Recall campaign
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <label className={styles.tileArmyControl}>
                  <span>
                    Campaign army: {clampedTileAttackArmy}/{playerSummary.army}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, playerSummary.army)}
                    step={1}
                    value={Math.max(1, clampedTileAttackArmy)}
                    disabled={playerSummary.army <= 0}
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
                  disabled={
                    mapActionPending ||
                    clampedTileAttackArmy <= 0 ||
                    !selectedOwnership.canStartCampaign
                  }
                  onClick={() => {
                    void handleStartTerritoryCampaign(
                      selectedTile.id,
                      clampedTileAttackArmy
                    );
                  }}
                >
                  Start campaign
                </button>
                {selectedOwnership.campaignDisabledReason ? (
                  <p className={styles.helper}>
                    {selectedOwnership.campaignDisabledReason}
                  </p>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {!selectedSeasonFourFeature &&
        playerSummary?.seasonFourRulesEnabled &&
        selectedOwnership?.isCurrentUser ? (
          <>
            {selectedOwnership.guardOrderId ? (
              <>
                <p className={styles.helper}>
                  Guard stationed: {selectedOwnership.guardArmy ?? 0} army.
                </p>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={mapActionPending}
                  onClick={() => {
                    void handleRecallArmyOrder(selectedOwnership.guardOrderId!);
                  }}
                >
                  Recall guard
                </button>
              </>
            ) : (
              <>
                <label className={styles.tileArmyControl}>
                  <span>
                    Guard army: {clampedTileFortifyArmy}/{playerSummary.army}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, playerSummary.army)}
                    step={1}
                    value={Math.max(1, clampedTileFortifyArmy)}
                    disabled={playerSummary.army <= 0}
                    onChange={(event) => {
                      const nextArmy = Number(event.currentTarget.value);
                      setTileFortifyArmy(
                        Number.isFinite(nextArmy) ? Math.floor(nextArmy) : 1
                      );
                    }}
                  />
                </label>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={
                    mapActionPending ||
                    clampedTileFortifyArmy <= 0 ||
                    !selectedOwnership.canStationGuard
                  }
                  onClick={() => {
                    void handleStationGuardOrder(
                      selectedTile.id,
                      clampedTileFortifyArmy
                    );
                  }}
                >
                  Station guard
                </button>
                {selectedOwnership.guardDisabledReason ? (
                  <p className={styles.helper}>
                    {selectedOwnership.guardDisabledReason}
                  </p>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>
    </aside>
  ) : null;

  const battlefieldsPanel =
    selectedBattlefields.length > 0 ? (
      <aside className={styles.battlefieldPanel} aria-label="Active battles">
        {selectedBattlefields.length > 0 ? (
          <>
            <div className={styles.sectionHeading}>
              <span className={styles.label}>Battles</span>
              <strong>{selectedBattlefields.length}</strong>
            </div>
            <div className={styles.battlefieldList}>
              {selectedBattlefields.slice(0, 4).map((battlefield) => {
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
                const pressure = getBattlePressure(battlefield);
                const isHomeBattle =
                  battlefield.targetTileId !== null &&
                  isHomeOfATile(battlefield.targetTileId);
                const battlePhase = getBattlePhase(battlefield);
                const battleContextHelper = getBattleContextHelper(
                  battlefield,
                  isHomeBattle
                );

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
                      <span className={styles.battleMeta}>
                        <span
                          className={styles.pressureBadge}
                          data-pressure={pressure.tone}
                        >
                          {pressure.label}
                        </span>
                        <span>
                          A {battlefield.attackerArmyLabel} / D{" "}
                          {battlefield.defenderArmyLabel}
                        </span>
                      </span>
                    </div>
                    <div className={styles.battleSignals}>
                      <span
                        className={styles.signalChip}
                        data-phase={battlePhase.toLowerCase()}
                      >
                        {getBattleTimingLabel(battlefield)}
                      </span>
                      <span className={styles.signalChip}>
                        {getBattlePaceLabel(battlefield)}
                      </span>
                      <span className={styles.signalChip}>
                        Army delta {battlefield.armyDelta >= 0 ? "+" : ""}
                        {battlefield.armyDelta}
                      </span>
                      <span className={styles.signalChip}>
                        Incoming {battlefield.incomingArmyDelta >= 0 ? "+" : ""}
                        {battlefield.incomingArmyDelta}
                      </span>
                      <span className={styles.signalChip}>
                        Next wave{" "}
                        {battlefield.nextIncomingEtaMinutes === null
                          ? "-"
                          : `${battlefield.nextIncomingEtaMinutes}m (${battlefield.nextIncomingSide.toLowerCase()})`}
                      </span>
                      <span className={styles.signalChip}>
                        Buffs A {battlefield.attackBuffPercent >= 0 ? "+" : ""}
                        {battlefield.attackBuffPercent}% / D +
                        {battlefield.defenseBuffPercent}%
                      </span>
                    </div>
                    {battleContextHelper ? (
                      <p className={styles.battlePhaseHelper}>
                        {battleContextHelper}
                      </p>
                    ) : null}
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
                          <dl className={styles.battleTacticalGrid}>
                            <div>
                              <dt>Pressure split</dt>
                              <dd>
                                {battlefield.attackerSharePercent}% attack
                              </dd>
                            </div>
                            <div>
                              <dt>Loss ratio A:D</dt>
                              <dd>
                                {formatLossRatio(
                                  battlefield.attackerToDefenderLossRatio
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Incoming A/D</dt>
                              <dd>
                                {battlefield.incomingAttackerArmy}/
                                {battlefield.incomingDefenderArmy}
                              </dd>
                            </div>
                            <div>
                              <dt>Momentum</dt>
                              <dd>
                                {battlefield.momentumScore >= 0 ? "+" : ""}
                                {battlefield.momentumScore}
                              </dd>
                            </div>
                            <div>
                              <dt>Buffs A / D</dt>
                              <dd>
                                {battlefield.attackBuffPercent >= 0 ? "+" : ""}
                                {battlefield.attackBuffPercent}% /
                                {battlefield.defenseBuffPercent >= 0
                                  ? " +"
                                  : " "}
                                {battlefield.defenseBuffPercent}%
                              </dd>
                            </div>
                          </dl>
                        </>
                      );
                    })()}
                    {battlefield.currentUserSide ? (
                      <div className={styles.yourForcePanel}>
                        <div className={styles.yourForceHeader}>
                          <span>
                            {isHomeBattle
                              ? "Your Home of A force"
                              : "Your force"}
                          </span>
                          <strong>
                            {battlefield.currentUserSide === "ATTACKER"
                              ? "Attack"
                              : "Defense"}
                          </strong>
                        </div>
                        <dl className={styles.yourForceStats}>
                          <div>
                            <dt>Committed</dt>
                            <dd>{battlefield.ownArmyCommitted}</dd>
                          </div>
                          <div>
                            <dt>Remaining</dt>
                            <dd>{battlefield.ownArmyRemaining}</dd>
                          </div>
                          <div>
                            <dt>Incoming</dt>
                            <dd>{battlefield.ownIncomingArmy}</dd>
                          </div>
                          <div>
                            <dt>Recallable</dt>
                            <dd>
                              {battlefield.canRecall
                                ? battlefield.ownArmyRemaining
                                : 0}
                            </dd>
                          </div>
                        </dl>
                        {battlefield.targetTileBonusLabel ? (
                          <p className={styles.helper}>
                            Tile bonus: {battlefield.targetTileBonusLabel}.
                          </p>
                        ) : null}
                      </div>
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
                        <div className={styles.recallPanelHeader}>
                          <span>
                            {isHomeBattle ? "Home of A recall" : "Recall"}
                          </span>
                          <strong>{recallAmount} army</strong>
                        </div>
                        <p className={styles.recallCopy}>
                          Recall marches home; losses stay lost.
                        </p>
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
                          title={battlefield.recallDisabledReason ?? undefined}
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
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={
                              !battlefield.canJoinAttacker ||
                              battleJoinPendingId ===
                                battlefield.id + ":ATTACKER"
                            }
                            title={
                              battlefield.joinAttackerDisabledReason ??
                              undefined
                            }
                            onClick={() =>
                              handleJoinBattlefield(
                                battlefield.id,
                                "ATTACKER",
                                joinAmount
                              )
                            }
                          >
                            {battleJoinPendingId ===
                            battlefield.id + ":ATTACKER"
                              ? "Reinforcing…"
                              : `Reinforce attack (${joinAmount})`}
                          </button>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={
                              !battlefield.canJoinDefender ||
                              battleJoinPendingId ===
                                battlefield.id + ":DEFENDER"
                            }
                            title={
                              battlefield.joinDefenderDisabledReason ??
                              undefined
                            }
                            onClick={() =>
                              handleJoinBattlefield(
                                battlefield.id,
                                "DEFENDER",
                                joinAmount
                              )
                            }
                          >
                            {battleJoinPendingId ===
                            battlefield.id + ":DEFENDER"
                              ? "Reinforcing…"
                              : `Reinforce defense (${joinAmount})`}
                          </button>
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
        {playerSummary && !playerSummary.seasonFourRulesEnabled ? (
          <NoticeToast
            autoDismissMs={null}
            message="Loot camps fight back now. Check their defending army before sending troops."
            storageKey={LOOT_CAMP_FIGHT_BACK_NOTICE_STORAGE_KEY}
          />
        ) : null}
        {playerSummary ? (
          <NoticeToast
            autoDismissMs={null}
            message="New territory unlocked: sea, mountain, and lake tiles are now claimable. Yes, even the wet ones. Yes, it costs more. Worth it."
            storageKey={SEA_MOUNTAIN_CLAIM_NOTICE_STORAGE_KEY}
          />
        ) : null}
        {!playerSummary?.seasonFourRulesEnabled ? (
        <NoticeToast
          autoDismissMs={5000}
          message="Castle Yeet is live: arm it from the Battlefield map, then pick a destination tile to relocate your castle."
          storageKey={CASTLE_YEET_NOTICE_STORAGE_KEY}
        />
        ) : null}
        <FortressMap
          className={immersive ? styles.fullMap : undefined}
          fortresses={mapFortresses}
          mapHexes={mapHexes}
          attackUnits={visibleAttackUnits}
          alliedRoads={alliedRoads}
          roadSegments={roadSegments}
          battalionMarkers={battalionMarkers}
          selectedFortressId={selectedFortressId}
          selectedTargetId={selectedTargetId}
          selectedTileId={selectedTileId}
          activeBattleFortressIds={activeBattleFortressIds}
          highlightedTileIds={castleYeetTargetTileIds}
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
