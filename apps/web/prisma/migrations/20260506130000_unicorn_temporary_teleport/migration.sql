CREATE TABLE "UnicornTemporaryTeleport" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "decoyFortressId" TEXT,
  "originMapX" INTEGER NOT NULL,
  "originMapY" INTEGER NOT NULL,
  "temporaryMapX" INTEGER NOT NULL,
  "temporaryMapY" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "returnAt" TIMESTAMP(3) NOT NULL,
  "returnedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UnicornTemporaryTeleport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnicornTemporaryTeleport_decoyFortressId_key"
  ON "UnicornTemporaryTeleport"("decoyFortressId");

CREATE INDEX "UnicornTemporaryTeleport_cycleId_returnAt_returnedAt_idx"
  ON "UnicornTemporaryTeleport"("cycleId", "returnAt", "returnedAt");

CREATE INDEX "UnicornTemporaryTeleport_fortressId_returnedAt_idx"
  ON "UnicornTemporaryTeleport"("fortressId", "returnedAt");

ALTER TABLE "UnicornTemporaryTeleport"
  ADD CONSTRAINT "UnicornTemporaryTeleport_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnicornTemporaryTeleport"
  ADD CONSTRAINT "UnicornTemporaryTeleport_fortressId_fkey"
  FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnicornTemporaryTeleport"
  ADD CONSTRAINT "UnicornTemporaryTeleport_decoyFortressId_fkey"
  FOREIGN KEY ("decoyFortressId") REFERENCES "Fortress"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
