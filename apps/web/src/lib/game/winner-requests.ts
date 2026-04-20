import { prisma } from "@/lib/prisma";
import {
  Prisma,
  PrismaClient,
  WinnerRequestStatus,
} from "@/lib/prisma-client";
import { GameError } from "./errors";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
type SubmissionStatus = Extract<
  WinnerRequestStatus,
  "SUBMITTED" | "NEEDS_SIMPLIFICATION" | "REJECTED"
>;

export const WINNER_REQUEST_POLICY_URL =
  "https://github.com/wasab1kastike/Project-A/blob/main/docs/ai-change-policy.md";

const SOFT_REQUEST_LENGTH_LIMIT = 280;
const HARD_REQUEST_LENGTH_LIMIT = 600;

const FAIRNESS_REJECTION_PATTERNS = [
  /buff my fortress/i,
  /make me stronger/i,
  /nerf/i,
  /weaken .*player/i,
  /target .*player/i,
  /give .*points/i,
  /add .*points/i,
  /extra turns?/i,
  /skip .*cooldown/i,
  /deploy/i,
  /open .*pr/i,
  /pull request/i,
  /generate code/i,
  /write code for me/i,
  /auto(?:matic)? merge/i,
  /change auth/i,
  /secrets?/i,
  /billing/i,
  /payment/i,
  /database migration/i,
];

const SIMPLIFICATION_PATTERNS = [
  /\n\s*[-*]/,
  /\b1\./,
  /\b2\./,
  /\b3\./,
  /\band\b.*\band\b/i,
  /\balso\b.*\balso\b/i,
];

const TRANSITIONS: Record<
  WinnerRequestStatus,
  ReadonlyArray<WinnerRequestStatus>
> = {
  [WinnerRequestStatus.SUBMITTED]: [
    WinnerRequestStatus.UNDER_ADMIN_REVIEW,
    WinnerRequestStatus.NEEDS_SIMPLIFICATION,
    WinnerRequestStatus.ACCEPTED,
    WinnerRequestStatus.REJECTED,
  ],
  [WinnerRequestStatus.UNDER_ADMIN_REVIEW]: [
    WinnerRequestStatus.NEEDS_SIMPLIFICATION,
    WinnerRequestStatus.ACCEPTED,
    WinnerRequestStatus.REJECTED,
  ],
  [WinnerRequestStatus.NEEDS_SIMPLIFICATION]: [
    WinnerRequestStatus.UNDER_ADMIN_REVIEW,
    WinnerRequestStatus.ACCEPTED,
    WinnerRequestStatus.REJECTED,
  ],
  [WinnerRequestStatus.ACCEPTED]: [],
  [WinnerRequestStatus.REJECTED]: [],
};

function normalizeRequestText(input: string) {
  const normalized = input.trim().replace(/\r\n/g, "\n");

  if (!normalized) {
    throw new GameError("Winner request cannot be empty.");
  }

  return normalized;
}

export function classifyWinnerRequest(input: string): {
  status: SubmissionStatus;
  reviewNotes: string;
} {
  const requestText = normalizeRequestText(input);

  if (requestText.length > HARD_REQUEST_LENGTH_LIMIT) {
    return {
      status: WinnerRequestStatus.REJECTED,
      reviewNotes:
        "Rejected automatically: keep the request under 600 characters and limited to one bounded change.",
    };
  }

  if (FAIRNESS_REJECTION_PATTERNS.some((pattern) => pattern.test(requestText))) {
    return {
      status: WinnerRequestStatus.REJECTED,
      reviewNotes:
        "Rejected automatically: the request crosses v1 fairness or automation guardrails.",
    };
  }

  if (
    requestText.length > SOFT_REQUEST_LENGTH_LIMIT ||
    SIMPLIFICATION_PATTERNS.some((pattern) => pattern.test(requestText))
  ) {
    return {
      status: WinnerRequestStatus.NEEDS_SIMPLIFICATION,
      reviewNotes:
        "Needs simplification: reduce this to one bounded gameplay-safe change before admin review.",
    };
  }

  return {
    status: WinnerRequestStatus.SUBMITTED,
    reviewNotes:
      "Within the v1 scope budget. Awaiting admin review before any future implementation work.",
  };
}

export async function getWinnerRequestEligibility({
  cycleId,
  userId,
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  db?: DatabaseClient;
}) {
  const historyEntry = await db.cycleHistory.findUnique({
    where: {
      cycleId,
    },
    include: {
      cycle: {
        select: {
          resolvedAt: true,
        },
      },
      winnerRequest: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!historyEntry || !historyEntry.cycle.resolvedAt) {
    return {
      canSubmit: false,
      reason: "Winner requests open only after a cycle is resolved.",
    };
  }

  if (historyEntry.winnerId !== userId) {
    return {
      canSubmit: false,
      reason: "Only the recorded cycle winner can submit a winner request.",
    };
  }

  if (historyEntry.winnerRequestId || historyEntry.winnerRequest) {
    return {
      canSubmit: false,
      reason: "This cycle already has a stored winner request.",
    };
  }

  return {
    canSubmit: true,
    reason: null,
  };
}

export async function submitWinnerRequest({
  cycleId,
  userId,
  requestText,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  requestText: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedRequestText = normalizeRequestText(requestText);
  const validation = classifyWinnerRequest(normalizedRequestText);

  try {
    return await db.$transaction(
      async (tx) => {
        const eligibility = await getWinnerRequestEligibility({
          cycleId,
          userId,
          db: tx,
        });

        if (!eligibility.canSubmit) {
          throw new GameError(eligibility.reason ?? "Winner request cannot be submitted.");
        }

        const createdRequest = await tx.winnerRequest.create({
          data: {
            cycleId,
            authorId: userId,
            requestText: normalizedRequestText,
            status: validation.status,
            reviewNotes: validation.reviewNotes,
            reviewedAt:
              validation.status === WinnerRequestStatus.SUBMITTED ? null : now,
          },
        });

        await tx.cycleHistory.update({
          where: {
            cycleId,
          },
          data: {
            winnerRequestId: createdRequest.id,
            winnerRequestSnapshot: normalizedRequestText,
          },
        });

        return createdRequest;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GameError("This cycle already has a stored winner request.");
    }

    throw error;
  }
}

export function canTransitionWinnerRequest(
  currentStatus: WinnerRequestStatus,
  nextStatus: WinnerRequestStatus
) {
  if (currentStatus === nextStatus) {
    return true;
  }

  return TRANSITIONS[currentStatus].includes(nextStatus);
}

export async function reviewWinnerRequest({
  requestId,
  reviewedById,
  status,
  reviewNotes,
  now = new Date(),
  db = prisma,
}: {
  requestId: string;
  reviewedById: string;
  status: WinnerRequestStatus;
  reviewNotes: string;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedNotes = reviewNotes.trim();

  if (
    (status === WinnerRequestStatus.NEEDS_SIMPLIFICATION ||
      status === WinnerRequestStatus.REJECTED) &&
    !normalizedNotes
  ) {
    throw new GameError("Review notes are required for simplification and rejection decisions.");
  }

  return db.$transaction(async (tx) => {
    const request = await tx.winnerRequest.findUnique({
      where: {
        id: requestId,
      },
    });

    if (!request) {
      throw new GameError("Winner request not found.");
    }

    if (!canTransitionWinnerRequest(request.status, status)) {
      throw new GameError(
        `Cannot move a winner request from ${request.status} to ${status}.`
      );
    }

    return tx.winnerRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status,
        reviewNotes: normalizedNotes || null,
        reviewedById,
        reviewedAt: now,
      },
    });
  });
}
