import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { addHours } from "./time";

export const WAR_DECLARATION_DELAY_HOURS = 24;

export type DiplomacyRelationLike = {
  status: DiplomacyRelationStatus;
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

  if (effectiveStatus === DiplomacyRelationStatus.ALLIED) {
    disabledReason = "Alliances cannot be changed in this politics slice.";
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
