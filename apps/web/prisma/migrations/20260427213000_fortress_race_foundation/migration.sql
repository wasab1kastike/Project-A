CREATE TYPE "FortressRace" AS ENUM (
  'DWARFS',
  'UNSTABLE_UNICORNS',
  'SPACE_MURINES',
  'ORKS'
);

ALTER TABLE "Fortress" ADD COLUMN "race" "FortressRace";
