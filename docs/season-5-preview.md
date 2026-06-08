# Season 5 Preview

Season 5 is a roguelite RPG fishing preview that runs on separate Render resources from live Season 4.

## Runtime Shape

- Branch: `codex/season-5`
- Preview domain: `https://project-a.artobest.com`
- Render resources:
  - `project-a-s5-web`
  - `project-a-s5-game-tick`
  - `project-a-s5-db`
- Preview flag: `SEASON_5_PREVIEW_ENABLED=true`

When the preview flag is enabled, `/` renders the Season 5 fishing interface instead of the Season 4 fortress map. The old game remains available on services that do not set the flag.

## Gameplay MVP

- Players create one Season 5 character per cycle.
- Classes: Drunken Monk, Retired Warrior, Demented Wizard, Burnt-Out Rogue.
- Players start at Home Base, pick gear, unlock class passives, and travel to lake or sea locations.
- Each class has three passive skill paths with formula effects for catch speed, rarity, trophy weight, inventory, pressure, and travel.
- Class passive trees are hard specializations: Drunken Monk owns long-session rhythm tempo, Retired Warrior owns trophy weight and raw pack capacity, Demented Wizard owns rarity and deep-water weirdness, and Burnt-Out Rogue owns travel speed and quiet pack pressure.
- Drunken Monk has a rhythm identity: bought Flow and Stillness passives improve long passive fishing sessions at the same location.
- Retired Warrior has a trophy focus identity: bought Trophy Hunter passives improve weight and rarity in harder waters.
- Characters start with two skill points. Passive fishing grants XP; every 50 XP raises the character level, up to level 11, and grants one more skill point.
- Travel takes time. On arrival, the character fishes passively until a new action is submitted.
- Inventory capacity limits fishing output. Returning home unloads the current haul.
- Fish weight is shown to players in kilograms and stored internally as grams for sorting.
- Every visible lake, river, coast, and sea tile can be chosen as a fishing destination. Old named spots still exist, but the map is no longer limited to only those pins.
- Connected water bodies have hidden fish pools with stock and hourly regeneration. Passive catches consume stock; depleted pools recover over time.
- Some individual water tiles have deterministic traits such as rotten reeds, old planks, deep pockets, warm vents, or void ripples. These adjust route difficulty, fish size, travel, or pack pressure, but they still draw from the connected water body's shared stock.
- Route cards show the water type and lock requirements. Pool stock, regen, and notable fish can be revealed temporarily by character stats, gear, and passives.
- Fish species are fantasy-themed by water profile, from soggy comedy fish to deep-water grotesques, lava trophies, and void mistakes.
- Deep water, lava pools, and void lakes are gated by character level plus fitting gear or matching passives. Normal lake and coastal water are open from level 1.
- Main rankings are Most Fish and Biggest Fish.
- Previous Project-A history and cosmetics are prestige-only.

## Visual QA

Use [Season 5 Visual QA](season-5-visual-qa.md) before closing map, character window, inventory, marker, or responsive layout work.

## History Import

Use the import script only against separate databases. Render external
PostgreSQL URLs should use SSL, for example `?sslmode=require`.

```bash
PRODUCTION_DATABASE_URL=postgresql://... \
DATABASE_URL=postgresql://...project-a-s5-db... \
npm run db:import-season-five-history
```

The script refuses to run if the source and target database URLs identify the
same database. It prints redacted source/target URLs before reading data. It
copies users, OAuth accounts, resolved cycle history, winner requests,
community wishes/votes, arcade wallets, loot-box purchases, cosmetic unlocks,
and resolved-cycle arcade transactions. It does not copy active Season 4
gameplay state.

Use the read-only modes before the real import:

```bash
PRODUCTION_DATABASE_URL=postgresql://... \
DATABASE_URL=postgresql://...project-a-s5-db... \
npm run db:import-season-five-history -- --count-only

PRODUCTION_DATABASE_URL=postgresql://... \
DATABASE_URL=postgresql://...project-a-s5-db... \
npm run db:import-season-five-history -- --dry-run
```

The import is idempotent for the copied data: users and arcade wallets are
upserted, and copied history/prestige rows use duplicate-safe inserts. Failures
are categorized as `database_unreachable`, `database_access_denied`,
`database_constraint_error`, or `import_error` to make Render runbook debugging
less ambiguous.

After the import, remove temporary credentials from the shell and from any
Render environment that received them. Do not leave `PRODUCTION_DATABASE_URL`
configured on the Season 5 web service or cron service.

## Launch Notes

Add this Google OAuth callback before opening the preview:

```text
https://project-a.artobest.com/api/auth/callback/google
```

Render should attach `project-a.artobest.com` to `project-a-s5-web`; configure the DNS record requested by Render after the service is created.

## Smoke Checks

Run this after every Season 5 Render deploy:

```bash
npm run smoke:season-5
```

The smoke command checks `render.yaml`, `https://project-a.artobest.com/api/health`, the Season 5 root page, `/history`, and the Auth.js provider endpoint for Google login. It is read-only and does not write to the app or database.

If `RENDER_API_KEY` is set, the same command also verifies the live Render resources:

- `project-a-s5-web`
- `project-a-s5-game-tick`
- `project-a-s5-db`

The Render API checks confirm the Season 5 services are in Frankfurt, deploy from `codex/season-5`, and use `project-a-s5-db` instead of the Season 4 database according to Blueprint config.

Use a different target only when testing a temporary preview URL:

```bash
SEASON_5_SMOKE_BASE_URL=https://example-preview.onrender.com npm run smoke:season-5
```
