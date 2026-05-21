import { DiplomacyRelationStatus } from "@/lib/prisma-client";
import { addHours } from "./time";

export const WAR_DECLARATION_DELAY_HOURS = 24;

export type DiplomacyRelationLike = {
  status: DiplomacyRelationStatus;
  warStartsAt?: Date | null;
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

export function canProposePeace(status: DiplomacyRelationStatus) {
  return (
    status === DiplomacyRelationStatus.WAR ||
    status === DiplomacyRelationStatus.WAR_PENDING ||
    status === DiplomacyRelationStatus.ENEMY
  );
}
