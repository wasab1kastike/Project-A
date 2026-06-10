export type MapTileTone =
  | "selected"
  | "battle"
  | "attackable"
  | "priority"
  | "owned"
  | "own"
  | "neutral";

export type MapTilePresentationInput = {
  tileId: string;
  biomeLabel: string;
  bonusLabel: string;
  isSelected?: boolean;
  isHomeOfA?: boolean;
  isOwned?: boolean;
  ownerName?: string | null;
  isCurrentUser?: boolean;
  hasActiveBattle?: boolean;
  canAttack?: boolean;
  pressurePriority?: boolean;
  pressurePriorityRank?: number | null;
  pressureProgress?: number | null;
  pressurePlayerProgress?: number | null;
  pressureThreshold?: number | null;
  pressureLeaderLabel?: string | null;
  canPrioritizePressure?: boolean;
  ownershipPressure?: number | null;
  occupyingGarrisonName?: string | null;
};

export type MapTilePresentation = {
  tone: MapTileTone;
  stateLabel: string;
  ownerLabel: string;
  pressureLabel: string | null;
  actionLabel: string;
  accessibleLabel: string;
};

export function getMapTilePresentation(
  input: MapTilePresentationInput,
): MapTilePresentation {
  const ownerLabel = getOwnerLabel(input);
  const pressureLabel = getPressureLabel(input);
  const actionLabel = getActionLabel(input);
  const stateLabel = getStateLabel(input);

  return {
    tone: getTileTone(input),
    stateLabel,
    ownerLabel,
    pressureLabel,
    actionLabel,
    accessibleLabel: [
      input.isHomeOfA ? "Home of A" : input.biomeLabel,
      ownerLabel,
      stateLabel,
      pressureLabel,
      input.bonusLabel,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

function getTileTone(input: MapTilePresentationInput): MapTileTone {
  if (input.isSelected) return "selected";
  if (input.hasActiveBattle) return "battle";
  if (input.canAttack) return "attackable";
  if (input.pressurePriority || input.pressurePriorityRank) return "priority";
  if (input.isOwned && input.isCurrentUser) return "own";
  if (input.isOwned) return "owned";
  return "neutral";
}

function getOwnerLabel(input: MapTilePresentationInput) {
  if (input.isHomeOfA && !input.isOwned) return "Center control point";
  if (!input.isOwned) return "Neutral";
  if (input.isCurrentUser) return "Owned by you";
  return input.ownerName ? `Owned by ${input.ownerName}` : "Owned";
}

function getStateLabel(input: MapTilePresentationInput) {
  if (input.hasActiveBattle) return "Battle active";
  if (input.occupyingGarrisonName) {
    return `Occupied by ${input.occupyingGarrisonName}`;
  }
  if (input.canAttack) return "Attackable";
  if (input.pressurePriorityRank) {
    return `Priority #${input.pressurePriorityRank}`;
  }
  if (input.pressurePriority) return "Priority target";
  if (input.canPrioritizePressure) return "Can prioritize";
  if (input.isOwned) return "Controlled";
  if (input.isHomeOfA) return "Center objective";
  return "Unclaimed";
}

function getActionLabel(input: MapTilePresentationInput) {
  if (input.hasActiveBattle) return "Open battle details";
  if (input.canAttack) return "Attack from tile panel";
  if (input.pressurePriorityRank) return "Reorder or clear priority";
  if (input.pressurePriority) return "Clear priority";
  if (input.canPrioritizePressure) return "Set pressure priority";
  if (input.isOwned && input.isCurrentUser) return "Fortify or manage from War Room";
  if (input.isOwned) return "Inspect owner and diplomacy state";
  return "Inspect tile";
}

function getPressureLabel(input: MapTilePresentationInput) {
  if (input.ownershipPressure != null) {
    return `Ownership ${input.ownershipPressure}/600`;
  }

  if (input.pressureThreshold == null) return null;

  const playerProgress = input.pressurePlayerProgress ?? 0;
  const base = `You ${playerProgress}/${input.pressureThreshold}`;

  if (
    input.pressureLeaderLabel &&
    input.pressureProgress != null &&
    input.pressureProgress !== playerProgress
  ) {
    return `${base}; leader ${input.pressureLeaderLabel} ${input.pressureProgress}/${input.pressureThreshold}`;
  }

  return base;
}
