import { BattlefieldSide, type FortressRace } from "@/lib/prisma-client";
import { formatApproximateForce } from "./battle-report";
import { getBattlefieldCasualtyBudget } from "./battlefield-rules";
import {
  getHomeOfABonus,
  getTileBonus,
  getTileById,
  isHomeOfATile,
} from "./territory";

type BattlefieldFortress = {
  id: string;
  name: string;
  commanderName: string;
  race?: FortressRace | null;
  ownerId?: string | null;
  army?: number;
  maxHealth?: number;
};

type BattlefieldParticipant = {
  fortressId: string;
  side: BattlefieldSide;
  armyCommitted: number;
  armyRemaining: number;
};

type BattlefieldIncomingReinforcement = {
  id: string;
  reinforcementSide: BattlefieldSide | null;
  armyAmount: number | null;
  arrivesAt: Date;
  attackerFortress: {
    name: string;
    ownerId: string | null;
  };
};

type ActiveBattlefieldInput = {
  id: string;
  targetTileId: string | null;
  targetFortressId: string | null;
  targetFortress: BattlefieldFortress | null;
  progress: number;
  attackerArmyRemaining: number;
  defenderArmyRemaining: number;
  startedAt: Date;
  attackerBannerFortress: BattlefieldFortress;
  defenderBannerFortress: BattlefieldFortress | null;
  participants: BattlefieldParticipant[];
  incomingReinforcements: BattlefieldIncomingReinforcement[];
};

type PlayerFortressInput = {
  id: string;
  army: number;
} | null;

type MapActiveBattlefieldsOptions = {
  battlefields: ActiveBattlefieldInput[];
  cycleId: string;
  gameplayOpen: boolean;
  now: Date;
  playerFortress: PlayerFortressInput;
  userId?: string;
};

export function mapActiveBattlefields({
  battlefields,
  cycleId,
  gameplayOpen,
  now,
  playerFortress,
  userId,
}: MapActiveBattlefieldsOptions) {
  return battlefields.map((battlefield) => {
    const currentParticipant = playerFortress
      ? battlefield.participants.find(
          (participant) => participant.fortressId === playerFortress.id
        )
      : null;
    const ownIncomingArmy = playerFortress
      ? battlefield.incomingReinforcements
          .filter((unit) => unit.attackerFortress.ownerId === userId)
          .reduce((sum, unit) => sum + (unit.armyAmount ?? 0), 0)
      : 0;
    const attackerCasualties = battlefield.participants
      .filter((participant) => participant.side === BattlefieldSide.ATTACKER)
      .reduce(
        (sum, participant) =>
          sum +
          Math.max(0, participant.armyCommitted - participant.armyRemaining),
        0
      );
    const defenderParticipantCasualties = battlefield.participants
      .filter((participant) => participant.side === BattlefieldSide.DEFENDER)
      .reduce(
        (sum, participant) =>
          sum +
          Math.max(0, participant.armyCommitted - participant.armyRemaining),
        0
      );
    const isHomeBossBattle =
      battlefield.targetTileId !== null &&
      isHomeOfATile(battlefield.targetTileId);
    const nativeDefenderCasualties = battlefield.targetFortress
      ? isHomeBossBattle
        ? Math.max(
            0,
            (battlefield.targetFortress.maxHealth ?? 0) -
              battlefield.defenderArmyRemaining
          )
        : Math.max(
            0,
            (battlefield.targetFortress.army ?? 0) -
              battlefield.defenderArmyRemaining
          )
      : 0;
    const canJoinAttacker =
      gameplayOpen &&
      playerFortress !== null &&
      playerFortress.army > 0 &&
      currentParticipant?.side !== BattlefieldSide.DEFENDER &&
      !isHomeBossBattle;
    const canJoinDefender =
      gameplayOpen &&
      playerFortress !== null &&
      playerFortress.army > 0 &&
      currentParticipant?.side !== BattlefieldSide.ATTACKER &&
      !isHomeBossBattle;
    const getJoinDisabledReason = (side: BattlefieldSide) => {
      if (side === BattlefieldSide.ATTACKER && canJoinAttacker) {
        return null;
      }

      if (side === BattlefieldSide.DEFENDER && canJoinDefender) {
        return null;
      }

      if (!gameplayOpen) {
        return "Battles can only be joined during gameplay.";
      }

      if (!playerFortress) {
        return "Join the cycle to reinforce battles.";
      }

      if (playerFortress.army <= 0) {
        return "No idle army available.";
      }

      if (isHomeBossBattle) {
        return side === BattlefieldSide.ATTACKER
          ? "Use the center tile action to send more army."
          : "Home of A has no defender side.";
      }

      return currentParticipant?.side === BattlefieldSide.ATTACKER
        ? "Already committed to attack."
        : "Already committed to defense.";
    };
    const targetTile =
      battlefield.targetTileId !== null
        ? getTileById(battlefield.targetTileId)
        : null;
    const targetTileBonus =
      battlefield.targetTileId !== null
        ? isHomeBossBattle
          ? getHomeOfABonus()
          : getTileBonus(targetTile, {
              tileId: battlefield.targetTileId,
              cycleId,
              at: now,
            })
        : null;
    const defenseBuffPercent = targetTileBonus?.defensePercent ?? 0;
    const canRecallOwnArmy =
      Boolean(currentParticipant) &&
      (currentParticipant?.armyRemaining ?? 0) > 0;
    const incomingAttackerArmy = battlefield.incomingReinforcements
      .filter(
        (unit) =>
          (unit.reinforcementSide ?? BattlefieldSide.ATTACKER) ===
          BattlefieldSide.ATTACKER
      )
      .reduce((sum, unit) => sum + Math.max(0, unit.armyAmount ?? 0), 0);
    const incomingDefenderArmy = battlefield.incomingReinforcements
      .filter(
        (unit) =>
          (unit.reinforcementSide ?? BattlefieldSide.ATTACKER) ===
          BattlefieldSide.DEFENDER
      )
      .reduce((sum, unit) => sum + Math.max(0, unit.armyAmount ?? 0), 0);
    const attackerArmyRemaining = Math.max(
      0,
      battlefield.attackerArmyRemaining
    );
    const defenderArmyRemaining = Math.max(
      0,
      battlefield.defenderArmyRemaining
    );
    const totalArmyRemaining = attackerArmyRemaining + defenderArmyRemaining;
    const armyDelta = attackerArmyRemaining - defenderArmyRemaining;
    const attackerSharePercent =
      totalArmyRemaining > 0
        ? Math.round((attackerArmyRemaining / totalArmyRemaining) * 100)
        : 50;
    const incomingArmyDelta = incomingAttackerArmy - incomingDefenderArmy;
    const battleStartsInMinutes = Math.max(
      0,
      Math.ceil((battlefield.startedAt.getTime() - now.getTime()) / 60_000)
    );
    const battleAgeMinutes =
      battleStartsInMinutes > 0
        ? 0
        : Math.max(
            0,
            Math.floor(
              (now.getTime() - battlefield.startedAt.getTime()) / 60_000
            )
          );
    const casualtiesPerTick =
      battleStartsInMinutes > 0
        ? 0
        : getBattlefieldCasualtyBudget(battleAgeMinutes);
    const battleIntensityPercent = Math.round(
      ((casualtiesPerTick - 100) / 900) * 100
    );
    const nextIncomingReinforcement =
      battlefield.incomingReinforcements.length > 0
        ? battlefield.incomingReinforcements[0]
        : null;
    const nextIncomingEtaMinutes = nextIncomingReinforcement
      ? Math.max(
          0,
          Math.ceil(
            (nextIncomingReinforcement.arrivesAt.getTime() - now.getTime()) /
              60_000
          )
        )
      : null;
    const attackerLosses = Math.max(0, attackerCasualties);
    const defenderLosses = Math.max(
      0,
      defenderParticipantCasualties + nativeDefenderCasualties
    );
    const attackerToDefenderLossRatio =
      defenderLosses > 0 ? attackerLosses / defenderLosses : null;
    const armyEdge =
      totalArmyRemaining > 0 ? armyDelta / totalArmyRemaining : 0;
    const incomingTotal = incomingAttackerArmy + incomingDefenderArmy;
    const incomingEdge =
      incomingTotal > 0 ? incomingArmyDelta / incomingTotal : 0;
    const momentumScore = Number(
      (armyEdge * 0.75 + incomingEdge * 0.25).toFixed(2)
    );
    const momentumTier:
      | "ATTACKER_STRONG"
      | "ATTACKER_EDGE"
      | "EVEN"
      | "DEFENDER_EDGE"
      | "DEFENDER_STRONG" =
      momentumScore >= 0.42
        ? "ATTACKER_STRONG"
        : momentumScore >= 0.14
          ? "ATTACKER_EDGE"
          : momentumScore <= -0.42
            ? "DEFENDER_STRONG"
            : momentumScore <= -0.14
              ? "DEFENDER_EDGE"
              : "EVEN";

    return {
      id: battlefield.id,
      targetTileId: battlefield.targetTileId,
      targetFortressId: battlefield.targetFortressId,
      targetTileBiome: targetTile?.biome ?? null,
      targetTileBonusLabel: targetTileBonus?.label ?? null,
      targetName:
        battlefield.targetTileId !== null
          ? isHomeBossBattle
            ? "Home of A"
            : `Tile ${battlefield.targetTileId}`
          : (battlefield.targetFortress?.name ?? "Battlefield"),
      progress: battlefield.progress,
      attackerArmyRemaining,
      defenderArmyRemaining,
      attackerArmyLabel:
        currentParticipant?.side === BattlefieldSide.ATTACKER
          ? `${attackerArmyRemaining}`
          : formatApproximateForce(attackerArmyRemaining),
      defenderArmyLabel:
        currentParticipant?.side === BattlefieldSide.DEFENDER
          ? `${defenderArmyRemaining}`
          : formatApproximateForce(defenderArmyRemaining),
      attackerCasualties: attackerLosses,
      defenderCasualties: defenderLosses,
      armyDelta,
      attackerSharePercent,
      incomingAttackerArmy,
      incomingDefenderArmy,
      incomingArmyDelta,
      battleAgeMinutes,
      battleStartsInMinutes,
      casualtiesPerTick,
      battleIntensityPercent:
        battleStartsInMinutes > 0 ? 0 : battleIntensityPercent,
      nextIncomingEtaMinutes,
      nextIncomingSide:
        nextIncomingReinforcement?.reinforcementSide ??
        BattlefieldSide.ATTACKER,
      attackerToDefenderLossRatio,
      momentumScore,
      momentumTier,
      attackBuffPercent: 0,
      defenseBuffPercent,
      ownArmyCommitted: currentParticipant?.armyCommitted ?? 0,
      ownArmyRemaining: currentParticipant?.armyRemaining ?? 0,
      ownIncomingArmy,
      startedAt: battlefield.startedAt,
      attackerBanner: {
        id: battlefield.attackerBannerFortress.id,
        name: battlefield.attackerBannerFortress.name,
        commanderName: battlefield.attackerBannerFortress.commanderName,
        race: battlefield.attackerBannerFortress.race ?? null,
      },
      defenderBanner: battlefield.defenderBannerFortress
        ? {
            id: battlefield.defenderBannerFortress.id,
            name: battlefield.defenderBannerFortress.name,
            commanderName: battlefield.defenderBannerFortress.commanderName,
            race: battlefield.defenderBannerFortress.race ?? null,
          }
        : null,
      participantCount: battlefield.participants.length,
      currentUserSide: currentParticipant?.side ?? null,
      canRecall: canRecallOwnArmy,
      recallDisabledReason: canRecallOwnArmy
        ? null
        : currentParticipant
          ? "No committed army remains to recall."
          : "Join this battlefield before recalling army.",
      incomingReinforcements: battlefield.incomingReinforcements.map(
        (unit) => ({
          id: unit.id,
          side: unit.reinforcementSide ?? BattlefieldSide.ATTACKER,
          armyAmount: unit.armyAmount,
          arrivesAt: unit.arrivesAt,
          fortressName: unit.attackerFortress.name,
          isCurrentUser: unit.attackerFortress.ownerId === userId,
        })
      ),
      canJoinAttacker,
      canJoinDefender,
      joinAttackerDisabledReason: getJoinDisabledReason(
        BattlefieldSide.ATTACKER
      ),
      joinDefenderDisabledReason: getJoinDisabledReason(
        BattlefieldSide.DEFENDER
      ),
    };
  });
}
