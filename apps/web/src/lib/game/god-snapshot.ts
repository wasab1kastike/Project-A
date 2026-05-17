import type { PrismaClient } from "@/lib/prisma-client";
import { prisma } from "@/lib/prisma";
import { GOD_EMPEROR_CHAT_AUTHOR_NAME } from "./constants";
import { getHomePageState, type HomePageState } from "./read-model";

export type GodSnapshotEvent = {
  key: string;
  kind:
    | "cycle-phase"
    | "leaderboard"
    | "home-of-a"
    | "battlefield"
    | "chat";
  title: string;
  summary: string;
  priority: number;
  occurredAt: Date | null;
};

export type GodSnapshot = {
  ok: true;
  generatedAt: Date;
  identity: {
    name: typeof GOD_EMPEROR_CHAT_AUTHOR_NAME;
    mode: "VISION_ONLY";
  };
  cycle: null | {
    id: string;
    status: string;
    phaseLabel: string | null;
    phaseOpen: boolean;
    deadline: Date | null;
    registrationEndsAt: Date | null;
    testingEndsAt: Date | null;
    activeEndsAt: Date | null;
    joinedCount: number;
    remainingSlots: number;
    lastProcessedTickAt: Date | null;
    tickHealth: string | null;
    tickDelayMinutes: number | null;
  };
  leaderboard: Array<{
    rank: number;
    fortressId: string;
    commanderName: string;
    fortressName: string;
    points: number;
    isSlayerOfA: boolean;
  }>;
  leaderboardTitles: Array<{
    category: string;
    label: string;
    title: string;
    holderName: string | null;
    holderMetric: number | null;
  }>;
  homeOfA: null | {
    status: string;
    statusLabel: string;
    bossHealth: number;
    bossMaxHealth: number;
    bossReward: number;
    respawnsAt: Date | null;
  };
  battlefields: Array<{
    id: string;
    targetTileId: string | null;
    targetName: string;
    progress: number;
    attackerArmyRemaining: number;
    defenderArmyRemaining: number;
    attackerSharePercent: number;
    incomingAttackerArmy: number;
    incomingDefenderArmy: number;
    momentumTier: string;
    participantCount: number;
    battleAgeMinutes: number;
    nextIncomingEtaMinutes: number | null;
    startedAt: Date;
    attackerBannerName: string;
    defenderBannerName: string | null;
  }>;
  recentChat: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: Date;
    isSystem: boolean;
  }>;
  scoreHighlights: Array<{
    key: string;
    summary: string;
  }>;
  battleHighlights: Array<{
    key: string;
    summary: string;
  }>;
  events: GodSnapshotEvent[];
};

type SnapshotState = HomePageState;

export async function getGodSnapshot({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}): Promise<GodSnapshot> {
  const state = await getHomePageState({ now, db });
  const cycle = state.cycle
    ? {
        id: state.cycle.id,
        status: state.cycle.status,
        phaseLabel: state.phase?.label ?? null,
        phaseOpen: state.phase?.isOpen ?? false,
        deadline: state.cycle.deadline,
        registrationEndsAt: state.cycle.registrationEndsAt,
        testingEndsAt: state.cycle.testingEndsAt,
        activeEndsAt: state.cycle.activeEndsAt,
        joinedCount: state.cycle.joinedCount,
        remainingSlots: state.cycle.remainingSlots,
        lastProcessedTickAt: state.cycle.lastProcessedTickAt,
        tickHealth: state.cycle.tickHealth,
        tickDelayMinutes: state.cycle.tickDelayMinutes,
      }
    : null;
  const cycleKey = cycle?.id ?? "no-cycle";
  const leaderboard = state.leaderboard.map((entry) => ({
    rank: entry.rank,
    fortressId: entry.id,
    commanderName: entry.commanderName,
    fortressName: entry.name,
    points: entry.points,
    isSlayerOfA: entry.isSlayerOfA,
  }));
  const leaderboardTitles = state.leaderboardTitles.map((entry) => ({
    category: String(entry.category),
    label: entry.label,
    title: entry.title,
    holderName: entry.holderName,
    holderMetric: entry.holderMetric,
  }));
  const battlefields = state.battlefields.slice(0, 8).map((battlefield) => ({
    id: battlefield.id,
    targetTileId: battlefield.targetTileId,
    targetName: battlefield.targetName,
    progress: battlefield.progress,
    attackerArmyRemaining: battlefield.attackerArmyRemaining,
    defenderArmyRemaining: battlefield.defenderArmyRemaining,
    attackerSharePercent: battlefield.attackerSharePercent,
    incomingAttackerArmy: battlefield.incomingAttackerArmy,
    incomingDefenderArmy: battlefield.incomingDefenderArmy,
    momentumTier: battlefield.momentumTier,
    participantCount: battlefield.participantCount,
    battleAgeMinutes: battlefield.battleAgeMinutes,
    nextIncomingEtaMinutes: battlefield.nextIncomingEtaMinutes,
    startedAt: battlefield.startedAt,
    attackerBannerName: battlefield.attackerBanner.name,
    defenderBannerName: battlefield.defenderBanner?.name ?? null,
  }));
  const recentChat = state.chat.messages
    .slice(-10)
    .filter((message) => message.type === "TEXT")
    .map((message) => ({
      id: message.id,
      authorName: message.authorName,
      body: message.body,
      createdAt: message.createdAt,
      isSystem: message.isSystem,
    }));
  const scoreHighlights = buildScoreHighlights(cycleKey, leaderboard);
  const battleHighlights = buildBattleHighlights(cycleKey, battlefields);
  const events = buildGodSnapshotEvents({
    state,
    cycleKey,
    leaderboard,
    battlefields,
    recentChat,
  });

  return {
    ok: true,
    generatedAt: now,
    identity: {
      name: GOD_EMPEROR_CHAT_AUTHOR_NAME,
      mode: "VISION_ONLY",
    },
    cycle,
    leaderboard,
    leaderboardTitles,
    homeOfA: state.homeOfA
      ? {
          status: state.homeOfA.status,
          statusLabel: state.homeOfA.statusLabel,
          bossHealth: state.homeOfA.bossHealth,
          bossMaxHealth: state.homeOfA.bossMaxHealth,
          bossReward: state.homeOfA.bossReward,
          respawnsAt: state.homeOfA.respawnsAt,
        }
      : null,
    battlefields,
    recentChat,
    scoreHighlights,
    battleHighlights,
    events,
  };
}

function buildGodSnapshotEvents({
  state,
  cycleKey,
  leaderboard,
  battlefields,
  recentChat,
}: {
  state: SnapshotState;
  cycleKey: string;
  leaderboard: GodSnapshot["leaderboard"];
  battlefields: GodSnapshot["battlefields"];
  recentChat: GodSnapshot["recentChat"];
}) {
  const events: GodSnapshotEvent[] = [];

  if (state.cycle && state.phase) {
    events.push({
      key: `cycle:${cycleKey}:phase:${state.cycle.status}:${state.phase.isOpen}`,
      kind: "cycle-phase",
      title: "Cycle phase",
      summary: `${state.phase.label}: ${state.cycle.status}`,
      priority: 60,
      occurredAt: state.cycle.lastProcessedTickAt,
    });
  }

  const leader = leaderboard[0];
  if (leader) {
    events.push({
      key: `cycle:${cycleKey}:leader:${leader.fortressId}:${leader.points}`,
      kind: "leaderboard",
      title: "Leaderboard lead",
      summary: `${leader.commanderName} leads with ${leader.points} points.`,
      priority: 80,
      occurredAt: null,
    });
  }

  if (state.homeOfA) {
    events.push({
      key: [
        "cycle",
        cycleKey,
        "home-of-a",
        state.homeOfA.status,
        state.homeOfA.bossHealth,
        state.homeOfA.respawnsAt?.toISOString() ?? "no-respawn",
      ].join(":"),
      kind: "home-of-a",
      title: "Home of A",
      summary: state.homeOfA.statusLabel,
      priority: state.homeOfA.status === "ALIVE" ? 90 : 70,
      occurredAt: state.homeOfA.respawnsAt,
    });
  }

  for (const battlefield of battlefields.slice(0, 5)) {
    events.push({
      key: [
        "cycle",
        cycleKey,
        "battlefield",
        battlefield.id,
        battlefield.progress,
        battlefield.attackerArmyRemaining,
        battlefield.defenderArmyRemaining,
        battlefield.incomingAttackerArmy,
        battlefield.incomingDefenderArmy,
        battlefield.momentumTier,
      ].join(":"),
      kind: "battlefield",
      title: battlefield.targetName,
      summary: `${battlefield.targetName}: ${battlefield.momentumTier} at ${battlefield.progress}% progress.`,
      priority: 100,
      occurredAt: battlefield.startedAt,
    });
  }

  for (const message of recentChat.filter(
    (chat) =>
      chat.authorName !== GOD_EMPEROR_CHAT_AUTHOR_NAME &&
      !chat.isSystem &&
      chat.body.length > 0
  )) {
    events.push({
      key: `cycle:${cycleKey}:chat:${message.id}`,
      kind: "chat",
      title: `${message.authorName} spoke`,
      summary: `${message.authorName}: ${message.body}`,
      priority: 40,
      occurredAt: message.createdAt,
    });
  }

  return events.sort((left, right) => right.priority - left.priority);
}

function buildScoreHighlights(
  cycleKey: string,
  leaderboard: GodSnapshot["leaderboard"]
) {
  return leaderboard.slice(0, 3).map((entry) => ({
    key: `cycle:${cycleKey}:score:${entry.rank}:${entry.fortressId}:${entry.points}`,
    summary: `#${entry.rank} ${entry.commanderName} has ${entry.points} points.`,
  }));
}

function buildBattleHighlights(
  cycleKey: string,
  battlefields: GodSnapshot["battlefields"]
) {
  return battlefields.slice(0, 5).map((battlefield) => ({
    key: `cycle:${cycleKey}:battle:${battlefield.id}:${battlefield.progress}:${battlefield.momentumTier}`,
    summary: `${battlefield.targetName} is ${battlefield.momentumTier} with ${battlefield.participantCount} participants.`,
  }));
}
