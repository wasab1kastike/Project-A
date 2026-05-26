import { prisma } from "@/lib/prisma";
import {
  CycleStatus,
  FortressKind,
  ConvoyLegStatus,
  TradeOfferStatus,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  findDiplomacyRelationForPair,
  getEffectiveDiplomacyStatus,
  getPoliticsRelationPresentation,
} from "./politics";
import { isSeasonFourRuleset } from "./rulesets";
import { getTradeBlockedReason } from "./trading";

function getMinutesUntil(from: Date, to: Date | null | undefined) {
  if (!to || to <= from) {
    return 0;
  }

  return Math.ceil((to.getTime() - from.getTime()) / 60000);
}

function isGameplayWindowOpen(
  cycle: {
    status: CycleStatus;
    testingEndsAt?: Date | null;
    activeEndsAt: Date | null;
  },
  now: Date
) {
  return (
    (cycle.status === CycleStatus.TESTING &&
      cycle.testingEndsAt !== null &&
      cycle.testingEndsAt !== undefined &&
      cycle.testingEndsAt > now) ||
    (cycle.status === CycleStatus.ACTIVE &&
      cycle.activeEndsAt !== null &&
      cycle.activeEndsAt > now)
  );
}

export async function getPoliticsPageState({
  userId,
  now = new Date(),
  db = prisma,
}: {
  userId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const cycle = await db.cycle.findFirst({
    where: {
      resolvedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      ruleset: true,
      status: true,
      testingEndsAt: true,
      activeEndsAt: true,
      crownedFortressId: true,
      fortresses: {
        where: {
          fortressKind: FortressKind.PLAYER,
          isNpc: false,
        },
        select: {
          id: true,
          ownerId: true,
          commanderName: true,
          name: true,
          points: true,
          joinedAt: true,
          race: true,
          gold: true,
          food: true,
          army: true,
        },
      },
      diplomacyRelations: {
        select: {
          fortressAId: true,
          fortressBId: true,
          status: true,
          allianceProposedById: true,
          allianceProposedAt: true,
          allianceTrustTier: true,
          allianceEscrowGoldEach: true,
          allianceEscrowFoodEach: true,
          trustUpgradeProposedById: true,
          trustUpgradeProposedAt: true,
          trustUpgradeTier: true,
          warDeclaredById: true,
          warDeclaredAt: true,
          warStartsAt: true,
          peaceProposedById: true,
          peaceProposedAt: true,
          casusBelliFortressId: true,
          casusBelliExpiresAt: true,
        },
      },
    },
  });

  if (!cycle || !isGameplayWindowOpen(cycle, now)) {
    return {
      canUsePolitics: false,
      disabledReason: "Politics opens during active gameplay.",
      playerFortress: null,
      rows: [],
      incomingTradeOffers: [],
      outgoingTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
    };
  }

  if (!isSeasonFourRuleset(cycle.ruleset)) {
    return {
      canUsePolitics: false,
      disabledReason: "Politics & Trade opens with the Season 4 ruleset.",
      playerFortress: null,
      rows: [],
      incomingTradeOffers: [],
      outgoingTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
    };
  }

  const playerFortress =
    cycle.fortresses.find((fortress) => fortress.ownerId === userId) ?? null;

  if (!playerFortress) {
    return {
      canUsePolitics: false,
      disabledReason: "Join the active cycle before using politics.",
      playerFortress: null,
      rows: [],
      incomingTradeOffers: [],
      outgoingTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
    };
  }

  const [tradeOffers, convoyLegs] = await Promise.all([
    db.tradeOffer.findMany({
      where: {
        cycleId: cycle.id,
        status: TradeOfferStatus.PENDING,
        expiresAt: { gt: now },
        OR: [
          { senderFortressId: playerFortress.id },
          { receiverFortressId: playerFortress.id },
        ],
      },
      include: { lineItems: true },
      orderBy: { createdAt: "desc" },
    }),
    db.convoyLeg.findMany({
      where: {
        cycleId: cycle.id,
        status: {
          in: [
            ConvoyLegStatus.IN_TRANSIT,
            ConvoyLegStatus.DELIVERED,
            ConvoyLegStatus.SEIZED,
          ],
        },
        OR: [
          { fromFortressId: playerFortress.id },
          { toFortressId: playerFortress.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const rows = cycle.fortresses
    .filter((fortress) => fortress.id !== playerFortress.id)
    .sort((left, right) => {
      if (left.points !== right.points) {
        return right.points - left.points;
      }

      const joinedDelta = left.joinedAt.getTime() - right.joinedAt.getTime();

      if (joinedDelta !== 0) {
        return joinedDelta;
      }

      return left.name.localeCompare(right.name);
    })
    .map((fortress) => {
      const relation = findDiplomacyRelationForPair({
        relations: cycle.diplomacyRelations,
        fortressOneId: playerFortress.id,
        fortressTwoId: fortress.id,
      });
      const presentation = getPoliticsRelationPresentation({
        relation,
        now,
        currentFortressId: playerFortress.id,
      });
      const warStartsAt = relation?.warStartsAt ?? null;
      const peaceProposedById = relation?.peaceProposedById ?? null;
      const allianceProposedById = relation?.allianceProposedById ?? null;
      const trustUpgradeProposedById =
        relation?.trustUpgradeProposedById ?? null;
      const casusBelliFortressId = relation?.casusBelliFortressId ?? null;
      const casusBelliExpiresAt = relation?.casusBelliExpiresAt ?? null;
      const tradeDisabledReason = getTradeBlockedReason(
        getEffectiveDiplomacyStatus({ relation, now })
      );

      return {
        fortressId: fortress.id,
        name: fortress.name,
        commanderName: fortress.commanderName,
        race: fortress.race,
        relationStatus: presentation.relationStatus,
        effectiveStatus: presentation.effectiveStatus,
        allianceProposedById,
        allianceProposedAt: relation?.allianceProposedAt ?? null,
        allianceProposedByCurrentPlayer:
          allianceProposedById !== null &&
          allianceProposedById === playerFortress.id,
        allianceTrustTier: relation?.allianceTrustTier ?? 0,
        allianceEscrowGoldEach: relation?.allianceEscrowGoldEach ?? 0,
        allianceEscrowFoodEach: relation?.allianceEscrowFoodEach ?? 0,
        trustUpgradeTier: relation?.trustUpgradeTier ?? null,
        trustUpgradeProposedByCurrentPlayer:
          trustUpgradeProposedById !== null &&
          trustUpgradeProposedById === playerFortress.id,
        warDeclaredById: relation?.warDeclaredById ?? null,
        warDeclaredAt: relation?.warDeclaredAt ?? null,
        warStartsAt,
        minutesUntilWar:
          presentation.effectiveStatus === "WAR_PENDING" && warStartsAt
            ? getMinutesUntil(now, warStartsAt)
            : null,
        peaceProposedById,
        peaceProposedAt: relation?.peaceProposedAt ?? null,
        peaceProposedByCurrentPlayer:
          peaceProposedById !== null && peaceProposedById === playerFortress.id,
        casusBelliFortressId,
        casusBelliExpiresAt,
        casusBelliBelongsToCurrentPlayer:
          casusBelliFortressId !== null &&
          casusBelliFortressId === playerFortress.id &&
          casusBelliExpiresAt !== null &&
          casusBelliExpiresAt > now,
        availableAction: presentation.availableAction,
        availableActions: presentation.availableActions,
        disabledReason: presentation.disabledReason,
        canTrade: tradeDisabledReason === null,
        tradeDisabledReason,
      };
    });
  const fortressNames = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress.name])
  );
  const normalizeOffer = (offer: (typeof tradeOffers)[number]) => ({
    id: offer.id,
    senderFortressId: offer.senderFortressId,
    receiverFortressId: offer.receiverFortressId,
    counterpartName:
      fortressNames.get(
        offer.senderFortressId === playerFortress.id
          ? offer.receiverFortressId
          : offer.senderFortressId
      ) ?? "Unknown fortress",
    expiresAt: offer.expiresAt,
    lineItems: offer.lineItems,
  });
  const normalizeLeg = (leg: (typeof convoyLegs)[number]) => ({
    id: leg.id,
    status: leg.status,
    outgoing: leg.fromFortressId === playerFortress.id,
    counterpartName:
      fortressNames.get(
        leg.fromFortressId === playerFortress.id
          ? leg.toFortressId
          : leg.fromFortressId
      ) ?? "Unknown fortress",
    gold: leg.gold,
    food: leg.food,
    army: leg.army,
    baseCargoValue: leg.baseCargoValue,
    bonusGold: leg.bonusGold,
    bonusFood: leg.bonusFood,
    pointsAwarded: leg.pointsAwarded,
    arrivesAt: leg.arrivesAt,
    settledAt: leg.settledAt,
  });

  return {
    canUsePolitics: true,
    disabledReason: null,
    playerFortress: {
      id: playerFortress.id,
      name: playerFortress.name,
      commanderName: playerFortress.commanderName,
      gold: playerFortress.gold,
      food: playerFortress.food,
      army: playerFortress.army,
    },
    rows,
    incomingTradeOffers: tradeOffers
      .filter((offer) => offer.receiverFortressId === playerFortress.id)
      .map(normalizeOffer),
    outgoingTradeOffers: tradeOffers
      .filter((offer) => offer.senderFortressId === playerFortress.id)
      .map(normalizeOffer),
    activeConvoyLegs: convoyLegs
      .filter(
        (leg) =>
          leg.status === ConvoyLegStatus.IN_TRANSIT &&
          (leg.fromFortressId === playerFortress.id ||
            leg.toFortressId === playerFortress.id)
      )
      .map(normalizeLeg),
    recentConvoyLegs: convoyLegs
      .filter(
        (leg) =>
          leg.status !== ConvoyLegStatus.IN_TRANSIT &&
          (leg.fromFortressId === playerFortress.id ||
            leg.toFortressId === playerFortress.id)
      )
      .slice(0, 10)
      .map(normalizeLeg),
  };
}

export type PoliticsPageState = Awaited<ReturnType<typeof getPoliticsPageState>>;
