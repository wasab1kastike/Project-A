-- CreateTable FortressGarrison
CREATE TABLE "FortressGarrison" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "fortressId" TEXT NOT NULL,
  "battlefieldId" TEXT NOT NULL,
  "tileId" TEXT NOT NULL,
  "army" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FortressGarrison_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FortressGarrison_battlefieldId_fortressId_key"
  ON "FortressGarrison"("battlefieldId", "fortressId");

CREATE INDEX "FortressGarrison_cycleId_tileId_idx"
  ON "FortressGarrison"("cycleId", "tileId");

CREATE INDEX "FortressGarrison_fortressId_cycleId_idx"
  ON "FortressGarrison"("fortressId", "cycleId");

ALTER TABLE "FortressGarrison"
  ADD CONSTRAINT "FortressGarrison_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FortressGarrison"
  ADD CONSTRAINT "FortressGarrison_fortressId_fkey"
  FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FortressGarrison"
  ADD CONSTRAINT "FortressGarrison_battlefieldId_fkey"
  FOREIGN KEY ("battlefieldId") REFERENCES "Battlefield"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
