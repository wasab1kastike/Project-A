-- Restore the player season if the prod catch-up deploy archived it while
-- applying the May 11 season-start migration.
--
-- Guardrails:
-- - Only runs when there is no unresolved cycle that already has player
--   fortresses.
-- - Reopens the most recently resolved cycle that still has player fortresses.
-- - Archives only empty unresolved replacement cycles.

WITH player_cycle_exists AS (
  SELECT 1
  FROM "Cycle" c
  WHERE c."resolvedAt" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "Fortress" f
      WHERE f."cycleId" = c.id
        AND f."fortressKind" = 'PLAYER'
        AND f."isNpc" = false
    )
  LIMIT 1
),
restore_target AS (
  SELECT c.id
  FROM "Cycle" c
  WHERE c.status = 'RESOLUTION'
    AND c."resolvedAt" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM player_cycle_exists)
    AND EXISTS (
      SELECT 1
      FROM "Fortress" f
      WHERE f."cycleId" = c.id
        AND f."fortressKind" = 'PLAYER'
        AND f."isNpc" = false
    )
  ORDER BY c."resolvedAt" DESC, c."createdAt" DESC
  LIMIT 1
),
archived_empty_replacements AS (
  UPDATE "Cycle" c
  SET
    status = 'RESOLUTION',
    "resolvedAt" = NOW(),
    "winnerId" = NULL,
    "joiningLockedAt" = NULL,
    "updatedAt" = NOW()
  WHERE c."resolvedAt" IS NULL
    AND EXISTS (SELECT 1 FROM restore_target)
    AND NOT EXISTS (
      SELECT 1
      FROM "Fortress" f
      WHERE f."cycleId" = c.id
    )
  RETURNING c.id
)
UPDATE "Cycle" c
SET
  status = CASE
    WHEN c."activeStartedAt" IS NOT NULL
      AND c."activeStartedAt" <= NOW()
      AND (c."activeEndsAt" IS NULL OR c."activeEndsAt" > NOW())
      THEN 'ACTIVE'::"CycleStatus"
    WHEN c."testingStartedAt" IS NOT NULL
      AND c."testingStartedAt" <= NOW()
      AND (c."testingEndsAt" IS NULL OR c."testingEndsAt" > NOW())
      THEN 'TESTING'::"CycleStatus"
    ELSE 'REGISTRATION'::"CycleStatus"
  END,
  "resolvedAt" = NULL,
  "winnerId" = NULL,
  "joiningLockedAt" = NULL,
  "updatedAt" = NOW()
WHERE c.id IN (SELECT id FROM restore_target);
