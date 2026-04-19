-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('REGISTRATION', 'ACTIVE', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "FortressAction" AS ENUM ('GROW', 'ATTACK');

-- CreateEnum
CREATE TYPE "ScoreEventType" AS ENUM ('GROW_TICK', 'ATTACK_SELF', 'ATTACK_TARGET', 'RENAME_COST', 'MANUAL_ADJUST');

-- CreateEnum
CREATE TYPE "WinnerRequestStatus" AS ENUM ('SUBMITTED', 'NEEDS_SIMPLIFICATION', 'ACCEPTED', 'REJECTED', 'UNDER_ADMIN_REVIEW');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'REGISTRATION',
    "registrationStartedAt" TIMESTAMP(3) NOT NULL,
    "registrationEndsAt" TIMESTAMP(3) NOT NULL,
    "activeStartedAt" TIMESTAMP(3),
    "activeEndsAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fortress" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "currentAction" "FortressAction" NOT NULL DEFAULT 'GROW',
    "targetFortressId" TEXT,
    "mapX" INTEGER NOT NULL,
    "mapY" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fortress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "actorId" TEXT,
    "targetFortressId" TEXT,
    "eventType" "ScoreEventType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinnerRequest" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "requestText" TEXT NOT NULL,
    "status" "WinnerRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "WinnerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleHistory" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "winnerRequestId" TEXT,
    "winningScore" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "winnerRequestSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Cycle_status_idx" ON "Cycle"("status");

-- CreateIndex
CREATE INDEX "Cycle_winnerId_idx" ON "Cycle"("winnerId");

-- CreateIndex
CREATE INDEX "Fortress_cycleId_idx" ON "Fortress"("cycleId");

-- CreateIndex
CREATE INDEX "Fortress_ownerId_idx" ON "Fortress"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Fortress_cycleId_ownerId_key" ON "Fortress"("cycleId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Fortress_cycleId_name_key" ON "Fortress"("cycleId", "name");

-- CreateIndex
CREATE INDEX "ChatMessage_cycleId_createdAt_idx" ON "ChatMessage"("cycleId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_authorId_createdAt_idx" ON "ChatMessage"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreEvent_cycleId_createdAt_idx" ON "ScoreEvent"("cycleId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreEvent_fortressId_createdAt_idx" ON "ScoreEvent"("fortressId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreEvent_actorId_idx" ON "ScoreEvent"("actorId");

-- CreateIndex
CREATE INDEX "WinnerRequest_cycleId_status_idx" ON "WinnerRequest"("cycleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WinnerRequest_cycleId_authorId_key" ON "WinnerRequest"("cycleId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleHistory_cycleId_key" ON "CycleHistory"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleHistory_winnerRequestId_key" ON "CycleHistory"("winnerRequestId");

-- CreateIndex
CREATE INDEX "CycleHistory_winnerId_idx" ON "CycleHistory"("winnerId");

-- CreateIndex
CREATE INDEX "CycleHistory_endedAt_idx" ON "CycleHistory"("endedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fortress" ADD CONSTRAINT "Fortress_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fortress" ADD CONSTRAINT "Fortress_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fortress" ADD CONSTRAINT "Fortress_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_targetFortressId_fkey" FOREIGN KEY ("targetFortressId") REFERENCES "Fortress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerRequest" ADD CONSTRAINT "WinnerRequest_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerRequest" ADD CONSTRAINT "WinnerRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinnerRequest" ADD CONSTRAINT "WinnerRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleHistory" ADD CONSTRAINT "CycleHistory_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleHistory" ADD CONSTRAINT "CycleHistory_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleHistory" ADD CONSTRAINT "CycleHistory_winnerRequestId_fkey" FOREIGN KEY ("winnerRequestId") REFERENCES "WinnerRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

