import type { Session } from "next-auth";
import { auth, isAuthConfigured } from "@/auth";
import { getHomePageState, type HomePageState } from "@/lib/game/read-model";
import { HomeClient } from "./home-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEFAULT_HOMEPAGE_DATA_TIMEOUT_MS = 8_000;
const configuredHomepageDataTimeoutMs = Number(
  process.env.HOMEPAGE_DATA_TIMEOUT_MS
);
const HOMEPAGE_DATA_TIMEOUT_MS =
  Number.isFinite(configuredHomepageDataTimeoutMs) &&
  configuredHomepageDataTimeoutMs > 0
    ? configuredHomepageDataTimeoutMs
    : DEFAULT_HOMEPAGE_DATA_TIMEOUT_MS;

function getSearchValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  });
}

function getDegradedHomePageState(): HomePageState {
  return {
    isSpectator: true,
    cycle: null,
    phase: null,
    playerFortress: null,
    playerSummary: null,
    leaderboard: [],
    leaderboards: {
      points: [],
      unitsKilled: [],
      tilesOwned: [],
      goblinsKilled: [],
      resourcesStolen: [],
    },
    leaderboardTitles: [],
    mapFortresses: [],
    mapHexes: [],
    homeOfA: null,
    battlefields: [],
    attackUnits: [],
    battleReports: [],
    chat: {
      messages: [],
      canPost: false,
      maxLength: 280,
      postHint:
        "Palvelussa on tilapainen hairio. Yrita hetken kuluttua uudelleen.",
      unreadCount: 0,
      hasUnread: false,
      latestMessageAt: null,
      persistsUnread: false,
    },
    communityWish: {
      cycleId: "",
      isOpen: false,
      opensAt: null,
      closesAt: null,
      canSubmit: false,
      canVote: false,
      voteBudget: 0,
      usedVotes: 0,
      remainingVotes: 0,
      currentUserCommunityWish: "",
      submissionHint:
        "Winner wish is guaranteed. Community wish is vote-based. Wishes can be edited until Monday 12:00, and voting ends Monday 24:00.",
      proposals: [],
    },
    availableTargets: [],
    canJoinCycle: false,
    canEditRegistrationName: false,
    latestSeason: null,
    emptyStateMessage:
      "Palvelussa on tilapainen hairio. Yrita hetken kuluttua uudelleen.",
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const error = getSearchValue(params.error);
  const notice = getSearchValue(params.notice);

  let session: Session | null = null;
  let state: HomePageState = getDegradedHomePageState();
  let runtimeError: string | null = null;

  try {
    session = await withTimeout(auth(), HOMEPAGE_DATA_TIMEOUT_MS, "auth");
  } catch (caughtError) {
    console.error("Failed to load homepage session", caughtError);
  }

  try {
    state = await withTimeout(
      getHomePageState({
        userId: session?.user?.id,
      }),
      HOMEPAGE_DATA_TIMEOUT_MS,
      "homepage state"
    );
  } catch (caughtError) {
    console.error("Failed to load homepage state", caughtError);
    runtimeError =
      "Palvelussa on tilapainen hairio. Yrita hetken kuluttua uudelleen.";
  }

  return (
    <HomeClient
      initialState={state}
      session={session}
      runtimeError={runtimeError}
      actionError={error ?? null}
      notice={notice ?? null}
      authConfigured={isAuthConfigured}
      realtimeEnabled={process.env.NEXT_PUBLIC_REALTIME_ENABLED === "true"}
    />
  );
}
