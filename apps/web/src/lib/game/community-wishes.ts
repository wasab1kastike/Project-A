import { prisma } from "@/lib/prisma";
import {
  CommunityWishStatus,
  CycleStatus,
  Prisma,
  PrismaClient,
  WinnerRequestStatus,
} from "@/lib/prisma-client";
import { GameError } from "./errors";
import { classifyWinnerRequest } from "./winner-requests";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
export type CommunityWishRankedFortress = {
  ownerId: string;
};

export const COMMUNITY_WISH_VOTING_WINDOW_HOURS = 24;

function normalizeRequestText(input: string) {
  const normalized = input.trim().replace(/\r\n/g, "\n");

  if (!normalized) {
    throw new GameError("Community wish proposal cannot be empty.");
  }

  return normalized;
}

export function getCommunityWishVoteWeight(rank: number) {
  if (rank === 1) {
    return 1;
  }

  if (rank >= 2 && rank <= 5) {
    return 7 - rank;
  }

  return 1;
}

async function getPlayerFortress({
  cycleId,
  userId,
  db,
}: {
  cycleId: string;
  userId: string;
  db: DatabaseClient;
}) {
  return db.fortress.findFirst({
    where: {
      cycleId,
      ownerId: userId,
      isNpc: false,
    },
    select: {
      id: true,
    },
  });
}

async function getCommunityWishAuthorLabels({
  cycleId,
  authorIds,
  db,
}: {
  cycleId: string;
  authorIds: string[];
  db: DatabaseClient;
}) {
  const fortresses = await db.fortress.findMany({
    where: {
      cycleId,
      ownerId: {
        in: authorIds,
      },
      isNpc: false,
    },
    select: {
      ownerId: true,
      commanderName: true,
      name: true,
    },
  });

  return new Map(
    fortresses.map((fortress) => [
      fortress.ownerId,
      fortress.commanderName ?? fortress.name,
    ])
  );
}

function formatCommunityWishSnapshot({
  authorLabel,
  requestText,
}: {
  authorLabel: string | undefined;
  requestText: string;
}) {
  return `${authorLabel ?? "Unknown player"}: ${requestText}`;
}

export async function createCommunityWishVoteEntitlements({
  cycleId,
  rankedFortresses,
  db = prisma,
}: {
  cycleId: string;
  rankedFortresses: CommunityWishRankedFortress[];
  db?: DatabaseClient;
}) {
  await db.communityWishVoteEntitlement.deleteMany({
    where: {
      cycleId,
    },
  });

  if (rankedFortresses.length === 0) {
    return {
      created: 0,
    };
  }

  await db.communityWishVoteEntitlement.createMany({
    data: rankedFortresses.map((fortress, index) => {
      const rank = index + 1;

      return {
        cycleId,
        userId: fortress.ownerId,
        rank,
        voteBudget: getCommunityWishVoteWeight(rank),
      };
    }),
  });

  return {
    created: rankedFortresses.length,
  };
}

export async function getCommunityWishEligibility({
  cycleId,
  userId,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  now?: Date;
  db?: DatabaseClient;
}) {
  const cycle = await db.cycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      status: true,
      activeEndsAt: true,
    },
  });

  if (!cycle || cycle.status !== CycleStatus.ACTIVE || !cycle.activeEndsAt) {
    return {
      canSubmit: false,
      reason: "Community wish proposals open only during an active cycle.",
    };
  }

  if (now >= cycle.activeEndsAt) {
    return {
      canSubmit: false,
      reason: "Community wish proposals close when the cycle ends.",
    };
  }

  const playerFortress = await getPlayerFortress({ cycleId, userId, db });

  if (!playerFortress) {
    return {
      canSubmit: false,
      reason: "Only players in this active cycle can submit a community wish.",
    };
  }

  return {
    canSubmit: true,
    reason: null,
  };
}

export async function submitCommunityWishProposal({
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
        const eligibility = await getCommunityWishEligibility({
          cycleId,
          userId,
          now,
          db: tx,
        });

        if (!eligibility.canSubmit) {
          throw new GameError(
            eligibility.reason ?? "Community wish cannot be submitted."
          );
        }

        return tx.communityWishProposal.upsert({
          where: {
            cycleId_authorId: {
              cycleId,
              authorId: userId,
            },
          },
          create: {
            cycleId,
            authorId: userId,
            requestText: normalizedRequestText,
            status: validation.status,
            reviewNotes: validation.reviewNotes,
          },
          update: {
            requestText: normalizedRequestText,
            status: validation.status,
            reviewNotes: validation.reviewNotes,
          },
        });
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
      throw new GameError("Community wish could not be saved. Try again.");
    }

    throw error;
  }
}

export async function getCommunityWishVoteBudget({
  cycleId,
  userId,
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  db?: DatabaseClient;
}) {
  const entitlement = await db.communityWishVoteEntitlement.findUnique({
    where: {
      cycleId_userId: {
        cycleId,
        userId,
      },
    },
    select: {
      voteBudget: true,
    },
  });

  if (!entitlement) {
    return {
      canVote: false,
      voteBudget: 0,
      usedVotes: 0,
      remainingVotes: 0,
      reason: "Only players from this resolved cycle can vote.",
    };
  }

  const voteBudget = entitlement.voteBudget;
  const usedVotes = await db.communityWishVote
    .aggregate({
      where: {
        voterId: userId,
        proposal: {
          cycleId,
        },
      },
      _sum: {
        votes: true,
      },
    })
    .then((result) => result._sum.votes ?? 0);

  return {
    canVote: true,
    voteBudget,
    usedVotes,
    remainingVotes: Math.max(0, voteBudget - usedVotes),
    reason: null,
  };
}

async function getVotingHistory({
  cycleId,
  now,
  db,
}: {
  cycleId: string;
  now: Date;
  db: DatabaseClient;
}) {
  const history = await db.cycleHistory.findUnique({
    where: {
      cycleId,
    },
    select: {
      communityWishStatus: true,
      communityWishVotingEndsAt: true,
    },
  });

  if (!history) {
    throw new GameError("Community wish voting opens after cycle resolution.");
  }

  if (history.communityWishStatus !== CommunityWishStatus.OPEN) {
    throw new GameError("Community wish voting is no longer open.");
  }

  if (!history.communityWishVotingEndsAt || history.communityWishVotingEndsAt <= now) {
    throw new GameError("Community wish voting has ended.");
  }

  return history;
}

export async function saveCommunityWishVotes({
  cycleId,
  userId,
  allocations,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  userId: string;
  allocations: Array<{ proposalId: string; votes: number }>;
  now?: Date;
  db?: PrismaClient;
}) {
  const normalizedAllocations = allocations
    .map((allocation) => ({
      proposalId: allocation.proposalId,
      votes: Math.trunc(allocation.votes),
    }))
    .filter((allocation) => allocation.proposalId && allocation.votes > 0);
  const duplicateProposalIds = new Set<string>();

  for (const allocation of normalizedAllocations) {
    if (duplicateProposalIds.has(allocation.proposalId)) {
      throw new GameError("Each community wish can appear only once per vote.");
    }

    duplicateProposalIds.add(allocation.proposalId);
  }

  return db.$transaction(
    async (tx) => {
      await getVotingHistory({ cycleId, now, db: tx });

      const budget = await getCommunityWishVoteBudget({
        cycleId,
        userId,
        db: tx,
      });

      if (!budget.canVote) {
        throw new GameError(budget.reason ?? "Community wish vote is not allowed.");
      }

      const totalVotes = normalizedAllocations.reduce(
        (sum, allocation) => sum + allocation.votes,
        0
      );

      if (totalVotes > budget.voteBudget) {
        throw new GameError(
          `You can allocate at most ${budget.voteBudget} community wish votes.`
        );
      }

      const proposalCount = await tx.communityWishProposal.count({
        where: {
          cycleId,
          status: {
            not: WinnerRequestStatus.REJECTED,
          },
          id: {
            in: normalizedAllocations.map((allocation) => allocation.proposalId),
          },
        },
      });

      if (proposalCount !== normalizedAllocations.length) {
        throw new GameError("Choose valid community wish proposals for this cycle.");
      }

      await tx.communityWishVote.deleteMany({
        where: {
          voterId: userId,
          proposal: {
            cycleId,
          },
        },
      });

      if (normalizedAllocations.length > 0) {
        await tx.communityWishVote.createMany({
          data: normalizedAllocations.map((allocation) => ({
            proposalId: allocation.proposalId,
            voterId: userId,
            votes: allocation.votes,
          })),
        });
      }

      return {
        voteBudget: budget.voteBudget,
        usedVotes: totalVotes,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

async function resolveCommunityWishHistory({
  cycleId,
  now,
  db,
}: {
  cycleId: string;
  now: Date;
  db: DatabaseClient;
}) {
  const proposals = await db.communityWishProposal.findMany({
    where: {
      cycleId,
      status: {
        not: WinnerRequestStatus.REJECTED,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      authorId: true,
      requestText: true,
      status: true,
      createdAt: true,
      votes: {
        select: {
          votes: true,
        },
      },
    },
  });

  if (proposals.length === 0) {
    return db.cycleHistory.update({
      where: {
        cycleId,
      },
      data: {
        communityWishStatus: CommunityWishStatus.NO_PROPOSALS,
        communityWishResolvedAt: now,
        communityWishVoteCount: 0,
      },
    });
  }

  const ranked = proposals
    .map((proposal) => ({
      ...proposal,
      voteCount: proposal.votes.reduce((sum, vote) => sum + vote.votes, 0),
    }))
    .sort((left, right) => {
      if (left.voteCount !== right.voteCount) {
        return right.voteCount - left.voteCount;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  const winner = ranked[0];
  const tied = ranked.filter((proposal) => proposal.voteCount === winner?.voteCount);

  if (!winner) {
    return null;
  }

  const authorLabels = await getCommunityWishAuthorLabels({
    cycleId,
    authorIds: proposals.map((proposal) => proposal.authorId),
    db,
  });

  if (tied.length > 1) {
    return db.cycleHistory.update({
      where: {
        cycleId,
      },
      data: {
        communityWishStatus: CommunityWishStatus.TIE_REQUIRES_ADMIN,
        communityWishVoteCount: winner.voteCount,
      },
    });
  }

  return db.cycleHistory.update({
    where: {
      cycleId,
    },
      data: {
        communityWishProposalId: winner.id,
        communityWishSnapshot: formatCommunityWishSnapshot({
          authorLabel: authorLabels.get(winner.authorId),
          requestText: winner.requestText,
        }),
        communityWishVoteCount: winner.voteCount,
        communityWishStatus: CommunityWishStatus.RESOLVED,
        communityWishResolvedAt: now,
    },
  });
}

export async function getCommunityWishTieBreakOptions({
  cycleId,
  db = prisma,
}: {
  cycleId: string;
  db?: DatabaseClient;
}) {
  const proposals = await db.communityWishProposal.findMany({
    where: {
      cycleId,
      status: {
        not: WinnerRequestStatus.REJECTED,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      votes: {
        select: {
          votes: true,
        },
      },
    },
  });
  const ranked = proposals
    .map((proposal) => ({
      id: proposal.id,
      voteCount: proposal.votes.reduce((sum, vote) => sum + vote.votes, 0),
    }))
    .sort((left, right) => right.voteCount - left.voteCount);
  const top = ranked[0];

  if (!top) {
    return [];
  }

  const tied = ranked.filter((proposal) => proposal.voteCount === top.voteCount);

  return tied.length > 1 ? tied : [];
}

export async function resolveExpiredCommunityWishVotes({
  now = new Date(),
  db = prisma,
}: {
  now?: Date;
  db?: PrismaClient;
} = {}) {
  const histories = await db.cycleHistory.findMany({
    where: {
      communityWishStatus: CommunityWishStatus.OPEN,
      communityWishVotingEndsAt: {
        lte: now,
      },
    },
    select: {
      cycleId: true,
    },
  });

  let resolved = 0;

  for (const history of histories) {
    await db.$transaction(async (tx) => {
      await resolveCommunityWishHistory({
        cycleId: history.cycleId,
        now,
        db: tx,
      });
    });
    resolved += 1;
  }

  return {
    resolved,
  };
}

export async function adminResolveCommunityWishTie({
  cycleId,
  proposalId,
  adminId,
  now = new Date(),
  db = prisma,
}: {
  cycleId: string;
  proposalId: string;
  adminId: string;
  now?: Date;
  db?: PrismaClient;
}) {
  return db.$transaction(async (tx) => {
    const history = await tx.cycleHistory.findUnique({
      where: {
        cycleId,
      },
      select: {
        communityWishStatus: true,
      },
    });

    if (!history || history.communityWishStatus !== CommunityWishStatus.TIE_REQUIRES_ADMIN) {
      throw new GameError("This community wish vote does not need admin resolution.");
    }

    const tieBreakOptions = await getCommunityWishTieBreakOptions({
      cycleId,
      db: tx,
    });

    if (!tieBreakOptions.some((option) => option.id === proposalId)) {
      throw new GameError("Choose one of the tied top community wish proposals.");
    }

    const proposal = await tx.communityWishProposal.findFirst({
      where: {
        id: proposalId,
        cycleId,
        status: {
          not: WinnerRequestStatus.REJECTED,
        },
      },
      select: {
        id: true,
        authorId: true,
        requestText: true,
        status: true,
        votes: {
          select: {
            votes: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new GameError("Choose a valid tied community wish proposal.");
    }

    const voteCount = proposal.votes.reduce((sum, vote) => sum + vote.votes, 0);
    const authorLabels = await getCommunityWishAuthorLabels({
      cycleId,
      authorIds: [proposal.authorId],
      db: tx,
    });

    return tx.cycleHistory.update({
      where: {
        cycleId,
      },
      data: {
        communityWishProposalId: proposal.id,
        communityWishSnapshot: formatCommunityWishSnapshot({
          authorLabel: authorLabels.get(proposal.authorId),
          requestText: proposal.requestText,
        }),
        communityWishVoteCount: voteCount,
        communityWishStatus: CommunityWishStatus.RESOLVED,
        communityWishResolvedAt: now,
        communityWishResolvedById: adminId,
      },
    });
  });
}
