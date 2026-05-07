-- Synchronize mapLayoutVersion to CURRENT_MAP_LAYOUT_VERSION (5)
-- This prevents unnecessary fortress shuffles on deployment
-- Only updates cycles that have outdated versions (< 5)
UPDATE "Cycle"
SET "mapLayoutVersion" = 5
WHERE "mapLayoutVersion" < 5;
