import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { addHours } from "./time";

export const WAR_DECLARATION_DELAY_HOURS = 24;
export type AllianceTrustTier = 1 | 2 | 3;

export const ALLIANCE_TRUST_TERMS: Record<
  AllianceTrustTier,
  { escrowGold: number; escrowFood: number; deliveryBonusPercent: number }
> = {
  1: { escrowGold: 2_000, escrowFood: 2_000, deliveryBonusPercent: 10 },
  2: { escrowGold: 10_000, escrowFood: 10_000, deliveryBonusPercent: 15 },
  3: { escrowGold: 30_000, escrowFood: 30_000, deliveryBonusPercent: 25 },
};

export type DiplomacyRelationLike = {
  status: DiplomacyRelationStatus;
  allianceProposedById?: string | null;
  allianceProposedAt?: Date | null;
  allianceTrustTier?: number;
  allianceEscrowGoldEach?: number;
  allianceEscrowFoodEach?: number;
  trustUpgradeProposedById?: string | null;
  trustUpgradeProposedAt?: Date | null;
  trustUpgradeTier?: number | null;
  warStartsAt?: Date | null;
  warDeclaredById?: string | null;
  warDeclaredAt?: Date | null;
  peaceProposedById?: string | null;
  peaceProposedAt?: Date | null;
};

export type DiplomacyRelationPairLike = DiplomacyRelationLike & {
  fortressAId: string;
  fortressBId: string;
};

export function getCanonicalDiplomacyPair(
  fortressOneId: string,
  fortressTwoId: string
) {
  if (fortressOneId === fortressTwoId) {
    throw new Error("Diplomacy relation requires two different fortresses.");
  }

  return fortressOneId < fortressTwoId
    ? { fortressAId: fortressOneId, fortressBId: fortressTwoId }
    : { fortressAId: fortressTwoId, fortressBId: fortressOneId };
}

export function getWarStartsAt(now: Date) {
  return addHours(now, WAR_DECLARATION_DELAY_HOURS);
}

export function getAllianceTrustTerms(tier: AllianceTrustTier) {
  return ALLIANCE_TRUST_TERMS[tier];
}

export function isAllianceTrustTier(value: number): value is AllianceTrustTier {
  return value === 1 || value === 2 || value === 3;
}

export function getAllianceTrustUpgradeDeposit({
  currentTier,
  requestedTier,
}: {
  currentTier: number;
  requestedTier: AllianceTrustTier;
}) {
  if (currentTier >= requestedTier) {
    throw new Error("Alliance trust upgrade must increase the trust tier.");
  }

  const current =
    currentTier === 0
      ? { escrowGold: 0, escrowFood: 0 }
      : getAllianceTrustTerms(currentTier as AllianceTrustTier);
  const requested = getAllianceTrustTerms(requestedTier);

  return {
    gold: requested.escrowGold - current.escrowGold,
    food: requested.escrowFood - current.escrowFood,
  };
}

export function findDiplomacyRelationForPair({
  relations,
  fortressOneId,
  fortressTwoId,
}: {
  relations: Iterable<DiplomacyRelationPairLike>;
  fortressOneId: string;
  fortressTwoId: string;
}) {
  const pair = getCanonicalDiplomacyPair(fortressOneId, fortressTwoId);

  for (const relation of relations) {
    if (
      relation.fortressAId === pair.fortressAId &&
      relation.fortressBId === pair.fortressBId
    ) {
      return relation;
    }
  }

  return null;
}

export function getEffectiveDiplomacyStatus({
  relation,
  now,
}: {
  relation: DiplomacyRelationLike | null | undefined;
  now: Date;
}) {
  if (!relation) {
    return DiplomacyRelationStatus.NEUTRAL;
  }

  if (
    relation.status === DiplomacyRelationStatus.WAR_PENDING &&
    relation.warStartsAt !== null &&
    relation.warStartsAt !== undefined &&
    relation.warStartsAt <= now
  ) {
    return DiplomacyRelationStatus.WAR;
  }

  return relation.status;
}

export function getDiplomacyAttackBlockedReason({
  relation,
  now,
  isHomeOfA = false,
  isBorderTarget,
}: {
  relation?: DiplomacyRelationLike | null;
  now: Date;
  isHomeOfA?: boolean;
  isBorderTarget: boolean;
}) {
  if (isHomeOfA) {
    return null;
  }

  const status = getEffectiveDiplomacyStatus({ relation, now });

  if (status === DiplomacyRelationStatus.ALLIED) {
    return "Allies cannot attack each other.";
  }

  if (status === DiplomacyRelationStatus.WAR_PENDING) {
    return "War has been declared, but the 24-hour warning has not finished.";
  }

  if (!isBorderTarget) {
    return "Only active border targets can be attacked.";
  }

  return null;
}

export function canAttackByDiplomacy(
  input: Parameters<typeof getDiplomacyAttackBlockedReason>[0]
) {
  return getDiplomacyAttackBlockedReason(input) === null;
}

export function getDiplomacyPressureBlockedReason({
  relation,
  now,
}: {
  relation?: DiplomacyRelationLike | null;
  now: Date;
}) {
  const status = getEffectiveDiplomacyStatus({ relation, now });

  if (status === DiplomacyRelationStatus.ALLIED) {
    return "Allies cannot pressure each other's territory.";
  }

  return null;
}

export function canPressureByDiplomacy(
  input: Parameters<typeof getDiplomacyPressureBlockedReason>[0]
) {
  return getDiplomacyPressureBlockedReason(input) === null;
}

export function canProposePeace(status: DiplomacyRelationStatus) {
  return (
    status === DiplomacyRelationStatus.WAR ||
    status === DiplomacyRelationStatus.WAR_PENDING ||
    status === DiplomacyRelationStatus.ENEMY
  );
}

export type PoliticsRelationAction =
  | "DECLARE_WAR"
  | "PROPOSE_ALLIANCE"
  | "ACCEPT_ALLIANCE"
  | "PROPOSE_TRUST_UPGRADE"
  | "ACCEPT_TRUST_UPGRADE"
  | "BETRAY_ALLIANCE"
  | "PROPOSE_PEACE"
  | "ACCEPT_PEACE";

export function getPoliticsRelationPresentation({
  relation,
  now,
  currentFortressId,
}: {
  relation?: DiplomacyRelationLike | null;
  now: Date;
  currentFortressId: string;
}) {
  const relationStatus =
    relation?.status ?? DiplomacyRelationStatus.NEUTRAL;
  const effectiveStatus = getEffectiveDiplomacyStatus({ relation, now });
  const actions: PoliticsRelationAction[] = [];
  let disabledReason: string | null = null;

  if (relationStatus === DiplomacyRelationStatus.ALLIANCE_PENDING) {
    if (relation?.allianceProposedById === currentFortressId) {
      disabledReason = "Alliance proposal is waiting for the other fortress.";
    } else {
      actions.push("ACCEPT_ALLIANCE");
    }
  } else if (effectiveStatus === DiplomacyRelationStatus.ALLIED) {
    if (relation?.trustUpgradeTier) {
      if (relation.trustUpgradeProposedById === currentFortressId) {
        disabledReason = "Trust upgrade is waiting for the other fortress.";
      } else {
        actions.push("ACCEPT_TRUST_UPGRADE");
      }
    } else if ((relation?.allianceTrustTier ?? 0) < 3) {
      actions.push("PROPOSE_TRUST_UPGRADE");
    }

    actions.push("BETRAY_ALLIANCE");
  } else if (relationStatus === DiplomacyRelationStatus.PEACE_PENDING) {
    if (relation?.peaceProposedById === currentFortressId) {
      disabledReason = "Peace proposal is waiting for the other fortress.";
    } else {
      actions.push("ACCEPT_PEACE");
    }
  } else {
    if (
      effectiveStatus === DiplomacyRelationStatus.NEUTRAL ||
      effectiveStatus === DiplomacyRelationStatus.ENEMY
    ) {
      actions.push("DECLARE_WAR");
    }

    if (effectiveStatus === DiplomacyRelationStatus.NEUTRAL) {
      actions.push("PROPOSE_ALLIANCE");
    }

    if (canProposePeace(effectiveStatus)) {
      actions.push("PROPOSE_PEACE");
    }

    if (actions.length === 0) {
      disabledReason = "No politics action is available.";
    }
  }

  return {
    relationStatus,
    effectiveStatus,
    availableAction: actions[0] ?? null,
    availableActions: actions,
    disabledReason,
  };
}
