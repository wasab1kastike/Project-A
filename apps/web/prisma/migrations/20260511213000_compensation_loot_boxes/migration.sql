-- Grant one free unit loot box and one free fortress loot box to every user as
-- compensation for the May 11 service instability.
--
-- The NOT EXISTS guards make this migration idempotent if it is re-applied in a
-- copied environment.

INSERT INTO "ArcadeLootBoxPurchase" (
  id,
  "userId",
  "crateType",
  price,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  u.id,
  'UNIT'::"ArcadeLootBoxType",
  0,
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "ArcadeLootBoxPurchase" p
  WHERE p."userId" = u.id
    AND p."crateType" = 'UNIT'
    AND p.price = 0
    AND p."createdAt" >= TIMESTAMP '2026-05-11 00:00:00 UTC'
);

INSERT INTO "ArcadeLootBoxPurchase" (
  id,
  "userId",
  "crateType",
  price,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  u.id,
  'FORTRESS'::"ArcadeLootBoxType",
  0,
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "ArcadeLootBoxPurchase" p
  WHERE p."userId" = u.id
    AND p."crateType" = 'FORTRESS'
    AND p.price = 0
    AND p."createdAt" >= TIMESTAMP '2026-05-11 00:00:00 UTC'
);
