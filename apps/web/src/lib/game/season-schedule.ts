import { getHelsinkiDateAtHour, getNextHelsinkiWeekdayAtHour } from "./calendar";
import {
  ACTIVE_DURATION_HOURS,
  TESTING_DURATION_HOURS,
  TESTING_ENDS_BEFORE_ACTIVE_HOURS,
} from "./constants";
import { addHours } from "./time";

const SEASON_4_SPECIAL_WINDOW_START = getHelsinkiDateAtHour({
  year: 2026,
  month: 5,
  day: 22,
  hour: 0,
});
export const SEASON_4_WISH_VOTING_ENDS_AT = getHelsinkiDateAtHour({
  year: 2026,
  month: 5,
  day: 25,
  hour: 12,
});
export const SEASON_4_ACTIVE_STARTS_AT = getHelsinkiDateAtHour({
  year: 2026,
  month: 6,
  day: 1,
  hour: 12,
});

export const SEASON_4_ACTIVATION_FLAG = "SEASON_4_ACTIVATION_ENABLED";
export const SEASON_4_DELAY_EXTENSION_HOURS = 24;

export function isSeasonFourPretestingCycle({
  testingStartedAt,
}: {
  testingStartedAt: Date | null;
}) {
  return testingStartedAt?.getTime() === SEASON_4_WISH_VOTING_ENDS_AT.getTime();
}

export function isSeasonFourActivationEnabled(
  value = process.env[SEASON_4_ACTIVATION_FLAG]
) {
  return value === "true";
}

export function getCommunityWishVotingEndsAt(proposalEndsAt: Date) {
  if (
    proposalEndsAt >= SEASON_4_SPECIAL_WINDOW_START &&
    proposalEndsAt <= SEASON_4_WISH_VOTING_ENDS_AT
  ) {
    return SEASON_4_WISH_VOTING_ENDS_AT;
  }

  return addHours(proposalEndsAt, 24);
}

export function getNextCycleSchedule(now: Date) {
  if (
    now >= SEASON_4_SPECIAL_WINDOW_START &&
    now < SEASON_4_ACTIVE_STARTS_AT
  ) {
    return {
      registrationEndsAt: SEASON_4_ACTIVE_STARTS_AT,
      testingStartedAt: SEASON_4_WISH_VOTING_ENDS_AT,
      testingEndsAt: SEASON_4_ACTIVE_STARTS_AT,
      activeEndsAt: addHours(SEASON_4_ACTIVE_STARTS_AT, ACTIVE_DURATION_HOURS),
    };
  }

  const registrationEndsAt = getNextHelsinkiWeekdayAtHour(now, 3, 12);
  const testingStartedAt = addHours(
    registrationEndsAt,
    -TESTING_DURATION_HOURS
  );
  const testingEndsAt = addHours(
    registrationEndsAt,
    -TESTING_ENDS_BEFORE_ACTIVE_HOURS
  );

  return {
    registrationEndsAt,
    testingStartedAt,
    testingEndsAt,
    activeEndsAt: addHours(registrationEndsAt, ACTIVE_DURATION_HOURS),
  };
}
