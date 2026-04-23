type AttackPresentationInput = {
  launchedAt: Date;
  arrivesAt: Date;
};

const ATTACK_IMPACT_WINDOW_MS = 1_200;
const ATTACK_IMPACT_PROGRESS = 0.94;

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getAttackProgress(unit: AttackPresentationInput, nowMs: number) {
  const launchedAt = new Date(unit.launchedAt).getTime();
  const arrivesAt = new Date(unit.arrivesAt).getTime();
  const duration = arrivesAt - launchedAt;

  if (duration <= 0) {
    return 1;
  }

  return clampProgress((nowMs - launchedAt) / duration);
}

export function getAttackPresentation(
  unit: AttackPresentationInput,
  nowMs: number
) {
  const arrivesAt = new Date(unit.arrivesAt).getTime();
  const rawProgress = getAttackProgress(unit, nowMs);
  const isImpacting = nowMs >= arrivesAt - ATTACK_IMPACT_WINDOW_MS;

  if (!isImpacting) {
    return {
      isImpacting: false,
      showSprite: true,
      progress: rawProgress,
    };
  }

  return {
    isImpacting: true,
    showSprite: false,
    progress: Math.min(rawProgress, ATTACK_IMPACT_PROGRESS),
  };
}
