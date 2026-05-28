-- CreateTable
CREATE TABLE "RaceSkillPurchase" (
    "id" TEXT NOT NULL,
    "fortressId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceSkillPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaceSkillPurchase_fortressId_path_key" ON "RaceSkillPurchase"("fortressId", "path");

-- CreateIndex
CREATE INDEX "RaceSkillPurchase_fortressId_idx" ON "RaceSkillPurchase"("fortressId");

-- AddForeignKey
ALTER TABLE "RaceSkillPurchase" ADD CONSTRAINT "RaceSkillPurchase_fortressId_fkey" FOREIGN KEY ("fortressId") REFERENCES "Fortress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
