-- One-time repair for the Season 4 cycle delayed by the activation feature
-- flag before the Render environment was updated.
--
-- Targets only the latest unresolved SEASON_4 cycle still in TESTING.
-- If the season is already ACTIVE, this migration is a no-op.

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "AttackUnit"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "Battlefield"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "HomeOfAHolder"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "TilePressurePriority"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "TilePressureState"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "MapHexOwnership"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "CastleUpgradeSpecializationChoice"
WHERE "fortressId" IN (
  SELECT "id"
  FROM "Fortress"
  WHERE "cycleId" IN (SELECT "id" FROM target_cycle)
);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "CastleUpgradeProject"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "RaceAbilityActivation"
WHERE "fortressId" IN (
  SELECT "id"
  FROM "Fortress"
  WHERE "cycleId" IN (SELECT "id" FROM target_cycle)
);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "OrkScrapEvent"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "OrkWaaaghInvestment"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "OrkBossOrder"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "OrkScrapBank"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "UnicornTemporaryTeleport"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "DwarfGrudge"
WHERE "fortressId" IN (
  SELECT "id"
  FROM "Fortress"
  WHERE "cycleId" IN (SELECT "id" FROM target_cycle)
);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "ScoreEvent"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "GameTick"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle);

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
DELETE FROM "Fortress"
WHERE "cycleId" IN (SELECT "id" FROM target_cycle)
  AND "isNpc" = true;

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
UPDATE "Fortress"
SET
  "points" = 0,
  "gold" = 0,
  "unitsKilled" = 0,
  "goblinsKilled" = 0,
  "resourcesStolen" = 0,
  "level" = 0,
  "food" = 0,
  "army" = 0,
  "minersAssigned" = 10,
  "farmersAssigned" = 10,
  "recruitersAssigned" = 5,
  "pressureWorkersAssigned" = 0,
  "race" = NULL,
  "fortressKind" = 'PLAYER',
  "currentAction" = 'GROW',
  "targetFortressId" = NULL,
  "health" = 0,
  "maxHealth" = 0,
  "sizeTiles" = 1,
  "iconLabel" = NULL,
  "unicornDecoySourceFortressId" = NULL,
  "unicornDecoyLevel" = NULL,
  "locationShuffleCount" = 0
WHERE "cycleId" IN (SELECT "id" FROM target_cycle)
  AND "isNpc" = false;

WITH target_cycle AS (
  SELECT "id"
  FROM "Cycle"
  WHERE "resolvedAt" IS NULL
    AND "ruleset" = 'SEASON_4'
    AND "status" = 'TESTING'
  ORDER BY "createdAt" DESC
  LIMIT 1
)
UPDATE "Cycle"
SET
  "status" = 'ACTIVE',
  "registrationEndsAt" = TIMESTAMP '2026-06-01 09:00:00.000',
  "testingEndsAt" = TIMESTAMP '2026-06-01 09:00:00.000',
  "activeStartedAt" = TIMESTAMP '2026-06-01 09:00:00.000',
  "activeEndsAt" = TIMESTAMP '2026-06-15 09:00:00.000',
  "joiningLockedAt" = NULL,
  "winnerId" = NULL,
  "crownedFortressId" = NULL,
  "upgradesUnlockedAt" = NULL,
  "homeOfABossRespawnsAt" = NULL,
  "megaFortressDestroyCount" = 0
WHERE "id" IN (SELECT "id" FROM target_cycle);
