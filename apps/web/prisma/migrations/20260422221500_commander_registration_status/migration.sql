-- Track whether existing season participants have explicitly registered a nick.
-- IF NOT EXISTS keeps deploy safe if the previous migration version already added it.
ALTER TABLE "Fortress" ADD COLUMN IF NOT EXISTS "commanderNameRegisteredAt" TIMESTAMP(3);

UPDATE "Fortress"
SET "commanderNameRegisteredAt" = CURRENT_TIMESTAMP
WHERE "isNpc" = true
  AND "commanderNameRegisteredAt" IS NULL;
