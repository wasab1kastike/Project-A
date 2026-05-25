import { prisma } from "@/lib/prisma";
import {
  CycleStatus,
  FortressKind,
  type PrismaClient,
} from "@/lib/prisma-client";
import {
  findDiplomacyRelationForPair,
  getPoliticsRelationPresentation,
} from "./politics";
import { isSeasonFourRuleset } from "./rulesets";

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
    };
  }

  if (!isSeasonFourRuleset(cycle.ruleset)) {
    return {
      canUsePolitics: false,
      disabledReason: "Politics & Trade opens with the Season 4 ruleset.",
      playerFortress: null,
      rows: [],
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
    };
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
      };
    });

  return {
    canUsePolitics: true,
    disabledReason: null,
    playerFortress: {
      id: playerFortress.id,
      name: playerFortress.name,
      commanderName: playerFortress.commanderName,
    },
    rows,
  };
}

export type PoliticsPageState = Awaited<ReturnType<typeof getPoliticsPageState>>;
