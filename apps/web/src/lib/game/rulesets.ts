import { CycleRuleset } from "@/lib/prisma-client";

export const DEFAULT_NEW_CYCLE_RULESET = CycleRuleset.SEASON_4;

export function isSeasonFourRuleset(
  ruleset: CycleRuleset | null | undefined
) {
  return ruleset === CycleRuleset.SEASON_4;
}
