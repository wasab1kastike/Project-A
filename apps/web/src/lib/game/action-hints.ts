import { HOME_OF_A_TILE_ID } from "./constants";

type PhaseStatus = string | null;
type TickHealth = "ok" | "lagging" | "stalled" | null;

type ActionHintInput = {
  phaseStatus: PhaseStatus;
  tickHealth: TickHealth;
  canJoinCycle: boolean;
  playerSummary: {
    army: number;
    food?: number;
    recruitmentQueue?: number;
    race?: string | null;
  } | null;
  battlefields: Array<{
    targetTileId: string | null;
    currentUserSide: "ATTACKER" | "DEFENDER" | null;
    canRecall: boolean;
    ownArmyRemaining: number;
    canJoinAttacker: boolean;
    canJoinDefender: boolean;
  }>;
  mapHexes: Array<{
    tileId: string;
    canClaim?: boolean;
    ownGarrison?: {
      canRecall: boolean;
      army: number;
    } | null;
  }>;
  homeOfA: {
    canAttack: boolean;
    activeBattlefieldId: string | null;
  } | null;
  fallback: string;
};

export type ActionHint = {
  label: string;
  message: string;
  tone: "neutral" | "warning" | "battle" | "opportunity";
};

export function getContextualActionHint(input: ActionHintInput): ActionHint {
  if (input.tickHealth === "stalled") {
    return {
      label: "Tick status",
      message: "Game ticks are stalled. Wait for recovery before making timing-sensitive moves.",
      tone: "warning",
    };
  }

  if (!input.playerSummary) {
    return {
      label: input.canJoinCycle ? "Join" : "Watch",
      message: input.canJoinCycle
        ? "Join the cycle to claim a fortress and start making moves."
        : input.fallback,
      tone: input.canJoinCycle ? "opportunity" : "neutral",
    };
  }

  const joinedHomeBattle = input.battlefields.find(
    (battlefield) =>
      battlefield.targetTileId === HOME_OF_A_TILE_ID &&
      battlefield.currentUserSide !== null
  );

  if (joinedHomeBattle?.canRecall && joinedHomeBattle.ownArmyRemaining > 0) {
    return {
      label: "Home of A",
      message: `You have ${joinedHomeBattle.ownArmyRemaining} army at Home of A. Hold, reinforce, or recall from the battle card.`,
      tone: "battle",
    };
  }

  const homeGarrison = input.mapHexes.find(
    (hex) =>
      hex.tileId === HOME_OF_A_TILE_ID &&
      hex.ownGarrison?.canRecall &&
      hex.ownGarrison.army > 0
  )?.ownGarrison;

  if (homeGarrison) {
    return {
      label: "Home of A",
      message: `You can recall ${homeGarrison.army} holding army from Home of A when you need it home.`,
      tone: "battle",
    };
  }

  const joinedBattle = input.battlefields.find(
    (battlefield) =>
      battlefield.currentUserSide !== null &&
      battlefield.canRecall &&
      battlefield.ownArmyRemaining > 0
  );

  if (joinedBattle) {
    return {
      label: "Battle",
      message: `You have ${joinedBattle.ownArmyRemaining} army committed. Check pressure, reinforce, or recall if the fight turns.`,
      tone: "battle",
    };
  }

  const recallableGarrison = input.mapHexes.find(
    (hex) => hex.ownGarrison?.canRecall && hex.ownGarrison.army > 0
  )?.ownGarrison;

  if (recallableGarrison) {
    return {
      label: "Holding force",
      message: `You can recall ${recallableGarrison.army} garrison army from a held tile when you need it home.`,
      tone: "battle",
    };
  }

  const joinedBattleWithoutRecall = input.battlefields.find(
    (battlefield) => battlefield.currentUserSide !== null
  );

  if (joinedBattleWithoutRecall) {
    return {
      label: "Battle",
      message: "You have forces in an active battle. Check the pressure and reinforce if the line needs help.",
      tone: "battle",
    };
  }

  const joinableBattle = input.battlefields.find(
    (battlefield) =>
      input.playerSummary?.army &&
      (battlefield.canJoinAttacker || battlefield.canJoinDefender)
  );

  if (joinableBattle) {
    return {
      label: "Reinforce",
      message: "An active battle can use reinforcements. Choose a side from the battle card.",
      tone: "opportunity",
    };
  }

  if ((input.playerSummary.food ?? 1) <= 0) {
    return {
      label: "Food",
      message:
        "Food is empty. Assign farmers, claim food tiles, or slow army growth before starvation costs army.",
      tone: "warning",
    };
  }

  if ((input.playerSummary.recruitmentQueue ?? 0) <= 0) {
    return {
      label: "Recruit",
      message: "Your recruitment queue is empty. Open Castle and buy army if you can spare the gold.",
      tone: "opportunity",
    };
  }

  if (input.mapHexes.some((hex) => hex.canClaim)) {
    return {
      label: "Expand",
      message: "A connected neutral tile is claimable. Pick a nearby hex to grow your economy.",
      tone: "opportunity",
    };
  }

  if (
    input.phaseStatus === "ACTIVE" &&
    input.homeOfA?.canAttack &&
    !input.homeOfA.activeBattlefieldId
  ) {
    return {
      label: "Home of A",
      message: "Home of A is open. Send army to contest the center objective.",
      tone: "opportunity",
    };
  }

  return {
    label: "Next",
    message: input.fallback,
    tone: "neutral",
  };
}
