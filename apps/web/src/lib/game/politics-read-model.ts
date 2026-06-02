import { prisma } from "@/lib/prisma";
import {
  ArmyOrderStatus,
  ArmyOrderType,
  CastleUpgradeSpecialization,
  CycleStatus,
  FortressKind,
  ConvoyLegStatus,
  NukeComponentKind,
  TradeLineItemKind,
  TradeOfferStatus,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  findDiplomacyRelationForPair,
  getEffectiveDiplomacyStatus,
  getAllianceTrustTerms,
  getPoliticsRelationPresentation,
  isAllianceTrustTier,
} from "./politics";
import { isSeasonFourRuleset } from "./rulesets";
import { isHomeOfATile } from "./territory";
import {
  getActiveTradeWagonLimit,
  getConvoyArrivalAt,
  getTradeBlockedReason,
  getTradeNukeComponents,
  getTradeWagonResourceLimit,
  splitTradeCargoIntoWagonRuns,
  type TradeCargo,
} from "./trading";
import { isConvoyRaidEligible } from "./convoy-conflict";
import { countCastleSpecializations } from "./specializations";
import { getSkillModifiers } from "./race-skill-effects";
import { isFortressRace } from "./races";

function getMinutesUntil(from: Date, to: Date | null | undefined) {
  if (!to || to <= from) {
    return 0;
  }

  return Math.ceil((to.getTime() - from.getTime()) / 60000);
}

function emptyCargo(): TradeCargo {
  return {
    gold: 0,
    food: 0,
    army: 0,
    points: 0,
    nukeComponents: {
      [NukeComponentKind.FUEL]: 0,
      [NukeComponentKind.ROCKET]: 0,
      [NukeComponentKind.WRATH_OF_A]: 0,
    },
  };
}

function addCargo(
  left: TradeCargo,
  right: TradeCargo
): TradeCargo {
  const leftNukes = getTradeNukeComponents(left);
  const rightNukes = getTradeNukeComponents(right);

  return {
    gold: left.gold + right.gold,
    food: left.food + right.food,
    army: left.army + right.army,
    points: left.points + right.points,
    nukeComponents: {
      [NukeComponentKind.FUEL]:
        leftNukes[NukeComponentKind.FUEL] + rightNukes[NukeComponentKind.FUEL],
      [NukeComponentKind.ROCKET]:
        leftNukes[NukeComponentKind.ROCKET] +
        rightNukes[NukeComponentKind.ROCKET],
      [NukeComponentKind.WRATH_OF_A]:
        leftNukes[NukeComponentKind.WRATH_OF_A] +
        rightNukes[NukeComponentKind.WRATH_OF_A],
    },
  };
}

function subtractCargo(
  original: TradeCargo,
  launched: TradeCargo
): TradeCargo {
  const originalNukes = getTradeNukeComponents(original);
  const launchedNukes = getTradeNukeComponents(launched);

  return {
    gold: Math.max(0, original.gold - launched.gold),
    food: Math.max(0, original.food - launched.food),
    army: Math.max(0, original.army - launched.army),
    points: Math.max(0, original.points - launched.points),
    nukeComponents: {
      [NukeComponentKind.FUEL]: Math.max(
        0,
        originalNukes[NukeComponentKind.FUEL] -
          launchedNukes[NukeComponentKind.FUEL]
      ),
      [NukeComponentKind.ROCKET]: Math.max(
        0,
        originalNukes[NukeComponentKind.ROCKET] -
          launchedNukes[NukeComponentKind.ROCKET]
      ),
      [NukeComponentKind.WRATH_OF_A]: Math.max(
        0,
        originalNukes[NukeComponentKind.WRATH_OF_A] -
          launchedNukes[NukeComponentKind.WRATH_OF_A]
      ),
    },
  };
}

function convoyLegCargo(leg: {
  gold: number;
  food: number;
  army: number;
  points: number;
  nukeFuel: number;
  nukeRocket: number;
  nukeWrathOfA: number;
}) {
  return {
    gold: leg.gold,
    food: leg.food,
    army: leg.army,
    points: leg.points,
    nukeComponents: {
      [NukeComponentKind.FUEL]: leg.nukeFuel,
      [NukeComponentKind.ROCKET]: leg.nukeRocket,
      [NukeComponentKind.WRATH_OF_A]: leg.nukeWrathOfA,
    },
  };
}

function cargoFromLineItems({
  lineItems,
  fromFortressId,
}: {
  lineItems: {
    fromFortressId: string;
    kind: TradeLineItemKind;
    amount: number | null;
    nukeComponentKind?: NukeComponentKind | null;
  }[];
  fromFortressId: string;
}) {
  let cargo = emptyCargo();

  for (const lineItem of lineItems) {
    if (lineItem.fromFortressId !== fromFortressId || !lineItem.amount) {
      continue;
    }

    const nukes = getTradeNukeComponents(cargo);

    if (lineItem.kind === TradeLineItemKind.GOLD) {
      cargo = { ...cargo, gold: cargo.gold + lineItem.amount };
    } else if (lineItem.kind === TradeLineItemKind.FOOD) {
      cargo = { ...cargo, food: cargo.food + lineItem.amount };
    } else if (lineItem.kind === TradeLineItemKind.ARMY) {
      cargo = { ...cargo, army: cargo.army + lineItem.amount };
    } else if (lineItem.kind === TradeLineItemKind.POINTS) {
      cargo = { ...cargo, points: cargo.points + lineItem.amount };
    } else if (
      lineItem.kind === TradeLineItemKind.NUKE_COMPONENT &&
      lineItem.nukeComponentKind
    ) {
      cargo = {
        ...cargo,
        nukeComponents: {
          ...nukes,
          [lineItem.nukeComponentKind]:
            nukes[lineItem.nukeComponentKind] + lineItem.amount,
        },
      };
    }
  }

  return cargo;
}

function serializeCargo(cargo: TradeCargo) {
  const nukes = getTradeNukeComponents(cargo);

  return {
    gold: cargo.gold,
    food: cargo.food,
    army: cargo.army,
    points: cargo.points,
    nukeFuel: nukes[NukeComponentKind.FUEL],
    nukeRocket: nukes[NukeComponentKind.ROCKET],
    nukeWrathOfA: nukes[NukeComponentKind.WRATH_OF_A],
  };
}

function hasCargo(cargo: TradeCargo) {
  const nukes = getTradeNukeComponents(cargo);

  return (
    cargo.gold > 0 ||
    cargo.food > 0 ||
    cargo.army > 0 ||
    cargo.points > 0 ||
    nukes[NukeComponentKind.FUEL] > 0 ||
    nukes[NukeComponentKind.ROCKET] > 0 ||
    nukes[NukeComponentKind.WRATH_OF_A] > 0
  );
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
  const cycleSummary = await db.cycle.findFirst({
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
    },
  });

  if (!cycleSummary || !isGameplayWindowOpen(cycleSummary, now)) {
    return {
      canUsePolitics: false,
      disabledReason: "Politics opens during active gameplay.",
      playerFortress: null,
      rows: [],
      incomingTradeOffers: [],
      outgoingTradeOffers: [],
      activeTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
      tradeLog: [],
      activeArmyOrders: [],
      recentCovertIncidents: [],
    };
  }

  if (!isSeasonFourRuleset(cycleSummary.ruleset)) {
    return {
      canUsePolitics: false,
      disabledReason: "Politics & Trade opens with the Season 4 ruleset.",
      playerFortress: null,
      rows: [],
      incomingTradeOffers: [],
      outgoingTradeOffers: [],
      activeTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
      tradeLog: [],
      activeArmyOrders: [],
      recentCovertIncidents: [],
    };
  }

  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleSummary.id,
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
          mapX: true,
          mapY: true,
          joinedAt: true,
          race: true,
          skillPurchases: {
            select: { nodeKey: true },
          },
          gold: true,
          food: true,
          army: true,
          castleUpgradeSpecializations: {
            select: {
              specialization: true,
              level: true,
            },
          },
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
          peaceLockedUntil: true,
          collateralGold: true,
          collateralFood: true,
          collateralArmy: true,
          collateralDebtFortressId: true,
          collateralDebtGold: true,
          collateralDebtFood: true,
          collateralDebtArmy: true,
          collateralDebtRecordedAt: true,
          allianceOfferGold: true,
          allianceOfferFood: true,
          allianceOfferArmy: true,
          allianceOfferTileId: true,
          allianceOfferDirection: true,
          peaceReparationGold: true,
          peaceReparationFood: true,
          peaceReparationArmy: true,
          peaceReparationTileId: true,
          peaceReparationFromId: true,
        },
      },
    },
  });

  if (!cycle) {
    return {
      canUsePolitics: false,
      disabledReason: "Politics opens during active gameplay.",
      playerFortress: null,
      rows: [],
      incomingTradeOffers: [],
      outgoingTradeOffers: [],
      activeTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
      tradeLog: [],
      activeArmyOrders: [],
      recentCovertIncidents: [],
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
      activeTradeOffers: [],
      activeConvoyLegs: [],
      recentConvoyLegs: [],
      tradeLog: [],
      activeArmyOrders: [],
      recentCovertIncidents: [],
    };
  }
  const ownedTileIdsByFortressId = new Map(
    (await db.mapHexOwnership.findMany({
      where: { cycleId: cycle.id },
      select: { ownerFortressId: true, tileId: true },
    })).reduce<[string, string[]][]>((acc, o) => {
      const existing = acc.find(([id]) => id === o.ownerFortressId);
      if (existing) existing[1].push(o.tileId);
      else acc.push([o.ownerFortressId, [o.tileId]]);
      return acc;
    }, [])
  );

  const [
    tradeOffers,
    activeTradeOffers,
    convoyLegs,
    activeOutboundWagonLegs,
    activeArmyOrders,
    recentCovertIncidents,
  ] = await Promise.all([
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
    db.tradeOffer.findMany({
      where: {
        cycleId: cycle.id,
        status: TradeOfferStatus.ACCEPTED,
        OR: [
          { senderFortressId: playerFortress.id },
          { receiverFortressId: playerFortress.id },
        ],
      },
      include: {
        lineItems: true,
        convoyLegs: {
          select: {
            id: true,
            fromFortressId: true,
            toFortressId: true,
            status: true,
            gold: true,
            food: true,
            army: true,
            points: true,
            nukeFuel: true,
            nukeRocket: true,
            nukeWrathOfA: true,
            deedTileId: true,
            arrivesAt: true,
            settledAt: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [
        { acceptedAt: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    }),
    db.convoyLeg.findMany({
      where: {
        cycleId: cycle.id,
        status: {
          in: [
            ConvoyLegStatus.IN_TRANSIT,
            ConvoyLegStatus.DELIVERED,
            ConvoyLegStatus.SEIZED,
            ConvoyLegStatus.INTERCEPTED,
          ],
        },
        OR: [
          { fromFortressId: playerFortress.id },
          { toFortressId: playerFortress.id },
          { interceptedByOrder: { fortressId: playerFortress.id } },
        ],
      },
      include: {
        escortOrder: true,
        interceptedByOrder: { select: { fortressId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.convoyLeg.findMany({
      where: {
        cycleId: cycle.id,
        status: ConvoyLegStatus.IN_TRANSIT,
      },
      select: {
        fromFortressId: true,
        arrivesAt: true,
      },
      orderBy: [{ arrivesAt: "asc" }, { id: "asc" }],
    }),
    db.armyOrder.findMany({
      where: {
        cycleId: cycle.id,
        fortressId: playerFortress.id,
        status: ArmyOrderStatus.ACTIVE,
        type: ArmyOrderType.ESCORT,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.covertIncident.findMany({
      where: {
        cycleId: cycle.id,
        OR: [
          { detectingFortressId: playerFortress.id },
          { raiderFortressId: playerFortress.id },
        ],
      },
      orderBy: { detectedAt: "desc" },
      take: 12,
    }),
  ]);

  const activeOutboundWagonsByFortressId = new Map<string, number>();
  const activeOutboundArrivalsByFortressId = new Map<string, Date[]>();
  for (const row of activeOutboundWagonLegs) {
    activeOutboundWagonsByFortressId.set(
      row.fromFortressId,
      (activeOutboundWagonsByFortressId.get(row.fromFortressId) ?? 0) + 1
    );
    const arrivals = activeOutboundArrivalsByFortressId.get(row.fromFortressId);

    if (arrivals) {
      arrivals.push(row.arrivesAt);
    } else {
      activeOutboundArrivalsByFortressId.set(row.fromFortressId, [
        row.arrivesAt,
      ]);
    }
  }

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
      const castleSpecializations = countCastleSpecializations(
        fortress.castleUpgradeSpecializations
      );
      const skillModifiers =
        fortress.race && isFortressRace(fortress.race)
          ? getSkillModifiers({
              race: fortress.race,
              purchases: fortress.skillPurchases,
            })
          : null;
      const activeOutboundWagons =
        activeOutboundWagonsByFortressId.get(fortress.id) ?? 0;
      const activeTradeWagonLimit = getActiveTradeWagonLimit(
        skillModifiers?.tradeWagonSlotBonus ?? 0
      );
      const trustUpgradeTerms =
        relation?.trustUpgradeTier && isAllianceTrustTier(relation.trustUpgradeTier)
          ? getAllianceTrustTerms(relation.trustUpgradeTier)
          : null;
      return {
        fortressId: fortress.id,
        name: fortress.name,
        commanderName: fortress.commanderName,
        race: fortress.race,
        tradeWagonResourceLimit: getTradeWagonResourceLimit(
          castleSpecializations[CastleUpgradeSpecialization.TRADE],
          skillModifiers?.tradeWagonCapacityPercent ?? 0
        ),
        activeOutboundWagons,
        activeTradeWagonLimit,
        ownedTileIds: (ownedTileIdsByFortressId.get(fortress.id) ?? []).filter(
          (tileId: string) => !isHomeOfATile(tileId)
        ),
        eligibleDeedTiles:
          presentation.effectiveStatus === 'ALLIED'
            ? (ownedTileIdsByFortressId.get(fortress.id) ?? []).filter(
                (tileId: string) => !isHomeOfATile(tileId)
              )
            : [],
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
        trustUpgradeEscrowGoldEach: trustUpgradeTerms?.escrowGold ?? null,
        trustUpgradeEscrowFoodEach: trustUpgradeTerms?.escrowFood ?? null,
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
        peaceLockedUntil: relation?.peaceLockedUntil ?? null,
        collateralGold: relation?.collateralGold ?? 0,
        collateralFood: relation?.collateralFood ?? 0,
        collateralArmy: relation?.collateralArmy ?? 0,
        collateralDebtFortressId: relation?.collateralDebtFortressId ?? null,
        collateralDebtGold: relation?.collateralDebtGold ?? 0,
        collateralDebtFood: relation?.collateralDebtFood ?? 0,
        collateralDebtArmy: relation?.collateralDebtArmy ?? 0,
        collateralDebtRecordedAt: relation?.collateralDebtRecordedAt ?? null,
        collateralDebtOwedByCurrentPlayer:
          relation?.collateralDebtFortressId === playerFortress.id,
        collateralDebtOwedToCurrentPlayer:
          relation?.collateralDebtFortressId !== null &&
          relation?.collateralDebtFortressId !== undefined &&
          relation.collateralDebtFortressId !== playerFortress.id,
        allianceOfferGold: relation?.allianceOfferGold ?? 0,
        allianceOfferFood: relation?.allianceOfferFood ?? 0,
        allianceOfferArmy: relation?.allianceOfferArmy ?? 0,
        allianceOfferTileId: relation?.allianceOfferTileId ?? null,
        allianceOfferDirection: relation?.allianceOfferDirection ?? null,
        peaceReparationGold: relation?.peaceReparationGold ?? 0,
        peaceReparationFood: relation?.peaceReparationFood ?? 0,
        peaceReparationArmy: relation?.peaceReparationArmy ?? 0,
        peaceReparationTileId: relation?.peaceReparationTileId ?? null,
        peaceReparationFromId: relation?.peaceReparationFromId ?? null,
        peaceReparationFromCurrentPlayer:
          relation?.peaceReparationFromId === playerFortress.id,
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
  const fortressById = new Map(
    cycle.fortresses.map((fortress) => [fortress.id, fortress])
  );
  const playerCastleSpecializations = countCastleSpecializations(
    playerFortress.castleUpgradeSpecializations
  );
  const playerSkillModifiers =
    playerFortress.race && isFortressRace(playerFortress.race)
      ? getSkillModifiers({
          race: playerFortress.race,
          purchases: playerFortress.skillPurchases,
        })
      : null;
  const playerActiveOutboundWagons =
    activeOutboundWagonsByFortressId.get(playerFortress.id) ?? 0;
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
    points: leg.points,
    nukeFuel: leg.nukeFuel,
    nukeRocket: leg.nukeRocket,
    nukeWrathOfA: leg.nukeWrathOfA,
    arrivesAt: leg.arrivesAt,
    settledAt: leg.settledAt,
    arrivedAwaitingTick:
      leg.status === ConvoyLegStatus.IN_TRANSIT && leg.arrivesAt <= now,
    canEscort:
      leg.fromFortressId === playerFortress.id &&
      isConvoyRaidEligible({ ...leg, hasDeed: Boolean(leg.deedTileId) }) &&
      leg.escortOrder?.status !== ArmyOrderStatus.ACTIVE,
    escortDisabledReason:
      leg.fromFortressId !== playerFortress.id
        ? "Only the sender may assign an escort."
        : leg.escortOrder?.status === ArmyOrderStatus.ACTIVE
          ? "An escort is already assigned."
          : !isConvoyRaidEligible({ ...leg, hasDeed: Boolean(leg.deedTileId) })
            ? "Only scored, unchallenged convoys can be escorted."
            : null,
    activeEscortOrderId:
      leg.escortOrder?.status === ArmyOrderStatus.ACTIVE
        ? leg.escortOrder.id
        : null,
    activeEscortArmy:
      leg.escortOrder?.status === ArmyOrderStatus.ACTIVE
        ? leg.escortOrder.committedArmy
        : null,
    encounterSucceeded: leg.encounterSucceeded,
    raidDetected: leg.raidDetected,
    stolenGold: leg.stolenGold,
    stolenFood: leg.stolenFood,
    stolenArmy: leg.stolenArmy,
    stolenPoints: leg.stolenPoints,
    stolenNukeFuel: leg.stolenNukeFuel,
    stolenNukeRocket: leg.stolenNukeRocket,
    stolenNukeWrathOfA: leg.stolenNukeWrathOfA,
    stolenCargoValue: leg.stolenCargoValue,
    raidedByCurrentPlayer:
      leg.interceptedByOrder?.fortressId === playerFortress.id,
    deedTileId: leg.deedTileId,
    deedSettledAt: leg.deedSettledAt,
    deedFailureReason: leg.deedFailureReason,
  });
  const normalizeTradeLogEntry = (leg: (typeof convoyLegs)[number]) => {
    const raidedByCurrentPlayer =
      leg.interceptedByOrder?.fortressId === playerFortress.id;
    const outgoing = leg.fromFortressId === playerFortress.id;
    const counterpartName =
      fortressNames.get(
        leg.fromFortressId === playerFortress.id
          ? leg.toFortressId
          : leg.fromFortressId
      ) ?? "Unknown fortress";
    const cargoParts = [
      leg.deedTileId ? `tile ${leg.deedTileId}` : null,
      leg.gold > 0 ? `${leg.gold.toLocaleString("en-US")} gold` : null,
      leg.food > 0 ? `${leg.food.toLocaleString("en-US")} food` : null,
      leg.army > 0 ? `${leg.army.toLocaleString("en-US")} army` : null,
      leg.points > 0 ? `${leg.points.toLocaleString("en-US")} points` : null,
      leg.nukeFuel > 0 ? `${leg.nukeFuel.toLocaleString("en-US")} fuel` : null,
      leg.nukeRocket > 0 ? `${leg.nukeRocket.toLocaleString("en-US")} rocket` : null,
      leg.nukeWrathOfA > 0 ? `${leg.nukeWrathOfA.toLocaleString("en-US")} wrath` : null,
    ].filter(Boolean);
    const cargo = cargoParts.join(", ") || "no cargo";

    if (leg.status === ConvoyLegStatus.INTERCEPTED && raidedByCurrentPlayer) {
      const stolenParts = [
        leg.stolenGold > 0 ? `${leg.stolenGold.toLocaleString("en-US")} gold` : null,
        leg.stolenFood > 0 ? `${leg.stolenFood.toLocaleString("en-US")} food` : null,
        leg.stolenArmy > 0 ? `${leg.stolenArmy.toLocaleString("en-US")} army` : null,
        leg.stolenPoints > 0 ? `${leg.stolenPoints.toLocaleString("en-US")} points` : null,
      ].filter(Boolean);

      return {
        id: leg.id,
        timestamp: leg.settledAt ?? leg.arrivesAt,
        outcome: "gain" as const,
        title: `Privateer raid from ${counterpartName}`,
        detail: stolenParts.join(", ") || "Cargo intercepted",
        profitLabel: `+${leg.stolenCargoValue.toLocaleString("en-US")} cargo value`,
      };
    }

    if (leg.status === ConvoyLegStatus.DELIVERED) {
      const bonusValue = leg.bonusGold + leg.bonusFood;
      const gains = [
        `cargo value ${leg.baseCargoValue.toLocaleString("en-US")}`,
        bonusValue > 0
          ? `bonus ${leg.bonusGold.toLocaleString("en-US")} gold / ${leg.bonusFood.toLocaleString("en-US")} food`
          : null,
        leg.pointsAwarded > 0
          ? `${leg.pointsAwarded.toLocaleString("en-US")} trade points`
          : null,
      ].filter(Boolean);

      return {
        id: leg.id,
        timestamp: leg.settledAt ?? leg.arrivesAt,
        outcome: "gain" as const,
        title: `${outgoing ? "Delivered to" : "Received from"} ${counterpartName}`,
        detail: `${cargo}; ${gains.join(", ")}`,
        profitLabel: `+${(leg.baseCargoValue + bonusValue + leg.pointsAwarded).toLocaleString("en-US")} value`,
      };
    }

    return {
      id: leg.id,
      timestamp: leg.settledAt ?? leg.arrivesAt,
      outcome: "loss" as const,
      title:
        leg.status === ConvoyLegStatus.INTERCEPTED
          ? `Lost to raid near ${counterpartName}`
          : `Seized on route with ${counterpartName}`,
      detail: leg.deedFailureReason
        ? `${cargo}; ${leg.deedFailureReason}`
        : cargo,
      profitLabel: `-${leg.baseCargoValue.toLocaleString("en-US")} cargo value`,
    };
  };
  const estimateQueuedFulfillmentAt = ({
    fromFortressId,
    toFortressId,
    queuedRunCount,
  }: {
    fromFortressId: string;
    toFortressId: string;
    queuedRunCount: number;
  }) => {
    if (queuedRunCount <= 0) {
      return null;
    }

    const fromFortress = fortressById.get(fromFortressId);
    const toFortress = fortressById.get(toFortressId);

    if (!fromFortress || !toFortress) {
      return null;
    }

    const skillModifiers =
      fromFortress.race && isFortressRace(fromFortress.race)
        ? getSkillModifiers({
            race: fromFortress.race,
            purchases: fromFortress.skillPurchases ?? [],
          })
        : null;
    const wagonLimit = getActiveTradeWagonLimit(
      skillModifiers?.tradeWagonSlotBonus ?? 0
    );
    const routeDurationMs =
      getConvoyArrivalAt({
        acceptedAt: now,
        from: fromFortress,
        to: toFortress,
      }).getTime() - now.getTime();
    const slotTimes = [
      ...(activeOutboundArrivalsByFortressId.get(fromFortressId) ?? []),
    ].map((date) => (date > now ? date.getTime() : now.getTime()));

    while (slotTimes.length < wagonLimit) {
      slotTimes.push(now.getTime());
    }

    if (slotTimes.length === 0) {
      return null;
    }

    slotTimes.sort((left, right) => left - right);
    let latestArrival = now.getTime();

    for (let index = 0; index < queuedRunCount; index += 1) {
      const departAt = slotTimes.shift() ?? now.getTime();
      const arrivesAt = departAt + routeDurationMs;
      latestArrival = Math.max(latestArrival, arrivesAt);
      slotTimes.push(arrivesAt);
      slotTimes.sort((left, right) => left - right);
    }

    return new Date(latestArrival);
  };
  const normalizeActiveTradeOffer = (
    offer: (typeof activeTradeOffers)[number]
  ) => {
    const directions = Array.from(
      new Set(
        offer.lineItems.map(
          (lineItem) => `${lineItem.fromFortressId}:${lineItem.toFortressId}`
        )
      )
    );
    const normalizedDirections = directions
      .map((direction) => {
        const [fromFortressId, toFortressId] = direction.split(":");

        if (!fromFortressId || !toFortressId) {
          return null;
        }

        const fromFortress = fortressById.get(fromFortressId);
        const lineItemsForDirection = offer.lineItems.filter(
          (lineItem) =>
            lineItem.fromFortressId === fromFortressId &&
            lineItem.toFortressId === toFortressId
        );
        const totalCargo = cargoFromLineItems({
          lineItems: lineItemsForDirection,
          fromFortressId,
        });
        const totalDeedTileIds = lineItemsForDirection
          .filter(
            (lineItem) =>
              lineItem.kind === TradeLineItemKind.TILE && lineItem.tileId
          )
          .map((lineItem) => lineItem.tileId!)
          .sort();
        let launchedCargo = emptyCargo();
        let deliveredCargo = emptyCargo();
        let inTransitCargo = emptyCargo();
        let lostCargo = emptyCargo();
        const directionLegs = offer.convoyLegs.filter(
          (leg) =>
            leg.fromFortressId === fromFortressId &&
            leg.toFortressId === toFortressId
        );

        for (const leg of directionLegs) {
          const cargo = convoyLegCargo(leg);
          launchedCargo = addCargo(launchedCargo, cargo);

          if (leg.status === ConvoyLegStatus.DELIVERED) {
            deliveredCargo = addCargo(deliveredCargo, cargo);
          } else if (leg.status === ConvoyLegStatus.IN_TRANSIT) {
            inTransitCargo = addCargo(inTransitCargo, cargo);
          } else if (
            leg.status === ConvoyLegStatus.SEIZED ||
            leg.status === ConvoyLegStatus.INTERCEPTED
          ) {
            lostCargo = addCargo(lostCargo, cargo);
          }
        }

        const launchedDeedTileIds = directionLegs
          .map((leg) => leg.deedTileId)
          .filter((tileId): tileId is string => Boolean(tileId))
          .sort();
        const deliveredDeedTileIds = directionLegs
          .filter((leg) => leg.status === ConvoyLegStatus.DELIVERED)
          .map((leg) => leg.deedTileId)
          .filter((tileId): tileId is string => Boolean(tileId))
          .sort();
        const lostDeedTileIds = directionLegs
          .filter(
            (leg) =>
              leg.status === ConvoyLegStatus.SEIZED ||
              leg.status === ConvoyLegStatus.INTERCEPTED
          )
          .map((leg) => leg.deedTileId)
          .filter((tileId): tileId is string => Boolean(tileId))
          .sort();
        const queuedCargo = subtractCargo(totalCargo, launchedCargo);
        const deedStillQueued = totalDeedTileIds.some(
          (tileId) => !launchedDeedTileIds.includes(tileId)
        );
        const skillModifiers =
          fromFortress?.race && isFortressRace(fromFortress.race)
            ? getSkillModifiers({
                race: fromFortress.race,
                purchases: fromFortress.skillPurchases ?? [],
              })
            : null;
        const tradeLevel = countCastleSpecializations(
          fromFortress?.castleUpgradeSpecializations ?? []
        )[CastleUpgradeSpecialization.TRADE];
        const queuedRunCount =
          splitTradeCargoIntoWagonRuns(
            queuedCargo,
            tradeLevel,
            skillModifiers?.tradeWagonCapacityPercent ?? 0
          ).length + (deedStillQueued && !hasCargo(queuedCargo) ? 1 : 0);
        const activeLegs = directionLegs.filter(
          (leg) => leg.status === ConvoyLegStatus.IN_TRANSIT
        );
        const latestActiveArrival = activeLegs.reduce<Date | null>(
          (latest, leg) =>
            latest === null || leg.arrivesAt > latest ? leg.arrivesAt : latest,
          null
        );
        const queuedFulfillmentAt = estimateQueuedFulfillmentAt({
          fromFortressId,
          toFortressId,
          queuedRunCount,
        });
        const estimatedFulfillmentAt =
          latestActiveArrival && queuedFulfillmentAt
            ? latestActiveArrival > queuedFulfillmentAt
              ? latestActiveArrival
              : queuedFulfillmentAt
            : latestActiveArrival ?? queuedFulfillmentAt;

        return {
          fromFortressId,
          toFortressId,
          outgoing: fromFortressId === playerFortress.id,
          counterpartName:
            fortressNames.get(
              fromFortressId === playerFortress.id
                ? toFortressId
                : fromFortressId
            ) ?? "Unknown fortress",
          total: serializeCargo(totalCargo),
          delivered: serializeCargo(deliveredCargo),
          inTransit: serializeCargo(inTransitCargo),
          queued: serializeCargo(queuedCargo),
          lost: serializeCargo(lostCargo),
          totalDeedTileIds,
          deliveredDeedTileIds,
          lostDeedTileIds,
          queuedDeedTileIds: totalDeedTileIds.filter(
            (tileId) => !launchedDeedTileIds.includes(tileId)
          ),
          activeRunCount: activeLegs.length,
          settledRunCount: directionLegs.filter(
            (leg) => leg.status !== ConvoyLegStatus.IN_TRANSIT
          ).length,
          queuedRunCount,
          totalRunCount: directionLegs.length + queuedRunCount,
          nextArrivalAt:
            activeLegs.reduce<Date | null>(
              (earliest, leg) =>
                earliest === null || leg.arrivesAt < earliest
                  ? leg.arrivesAt
                  : earliest,
              null
            ) ?? null,
          estimatedFulfillmentAt,
        };
      })
      .filter(
        (direction): direction is NonNullable<typeof direction> =>
          direction !== null
      );
    const estimatedFulfillmentAt = normalizedDirections.reduce<Date | null>(
      (latest, direction) =>
        direction.estimatedFulfillmentAt &&
        (latest === null || direction.estimatedFulfillmentAt > latest)
          ? direction.estimatedFulfillmentAt
          : latest,
      null
    );

    return {
      id: offer.id,
      counterpartName:
        fortressNames.get(
          offer.senderFortressId === playerFortress.id
            ? offer.receiverFortressId
            : offer.senderFortressId
        ) ?? "Unknown fortress",
      acceptedAt: offer.acceptedAt,
      directions: normalizedDirections,
      estimatedFulfillmentAt,
    };
  };

  return {
    canUsePolitics: true,
    disabledReason: null,
    playerEligibleDeedTiles:
      (ownedTileIdsByFortressId.get(playerFortress.id) ?? []).filter(
        (tileId: string) => !isHomeOfATile(tileId)
      ),
    playerFortress: {
      id: playerFortress.id,
      name: playerFortress.name,
      commanderName: playerFortress.commanderName,
      gold: playerFortress.gold,
      food: playerFortress.food,
      army: playerFortress.army,
      tradeWagonResourceLimit: getTradeWagonResourceLimit(
        playerCastleSpecializations[CastleUpgradeSpecialization.TRADE],
        playerSkillModifiers?.tradeWagonCapacityPercent ?? 0
      ),
      activeOutboundWagons: playerActiveOutboundWagons,
      activeTradeWagonLimit: getActiveTradeWagonLimit(
        playerSkillModifiers?.tradeWagonSlotBonus ?? 0
      ),
    },
    rows,
    incomingTradeOffers: tradeOffers
      .filter((offer) => offer.receiverFortressId === playerFortress.id)
      .map(normalizeOffer),
    outgoingTradeOffers: tradeOffers
      .filter((offer) => offer.senderFortressId === playerFortress.id)
      .map(normalizeOffer),
    activeTradeOffers: activeTradeOffers.map(normalizeActiveTradeOffer),
    activeConvoyLegs: convoyLegs
      .filter(
        (leg) =>
          leg.status === ConvoyLegStatus.IN_TRANSIT &&
          (leg.fromFortressId === playerFortress.id ||
            leg.toFortressId === playerFortress.id ||
            leg.interceptedByOrder?.fortressId === playerFortress.id)
      )
      .map(normalizeLeg),
    recentConvoyLegs: convoyLegs
      .filter(
        (leg) =>
          leg.status !== ConvoyLegStatus.IN_TRANSIT &&
          (leg.fromFortressId === playerFortress.id ||
            leg.toFortressId === playerFortress.id ||
            leg.interceptedByOrder?.fortressId === playerFortress.id)
      )
      .slice(0, 10)
      .map(normalizeLeg),
    tradeLog: convoyLegs
      .filter(
        (leg) =>
          leg.status !== ConvoyLegStatus.IN_TRANSIT &&
          (leg.fromFortressId === playerFortress.id ||
            leg.toFortressId === playerFortress.id ||
            leg.interceptedByOrder?.fortressId === playerFortress.id)
      )
      .slice(0, 8)
      .map(normalizeTradeLogEntry),
    activeArmyOrders: activeArmyOrders.map((order) => ({
      id: order.id,
      type: order.type,
      committedArmy: order.committedArmy,
      targetName: null,
    })),
    recentCovertIncidents: recentCovertIncidents.map((incident) => ({
      id: incident.id,
      detectedAt: incident.detectedAt,
      detectedByCurrentPlayer:
        incident.detectingFortressId === playerFortress.id,
      raiderName:
        incident.detectingFortressId === playerFortress.id
          ? fortressNames.get(incident.raiderFortressId) ?? "Unknown fortress"
          : null,
      detectorName:
        incident.raiderFortressId === playerFortress.id
          ? fortressNames.get(incident.detectingFortressId) ?? "Unknown fortress"
          : null,
      casusBelliExpiresAt: incident.casusBelliExpiresAt,
    })),
  };
}

export type PoliticsPageState = Awaited<ReturnType<typeof getPoliticsPageState>>;
