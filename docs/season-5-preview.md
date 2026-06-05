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
- Players start at Home Base, pick gear, unlock starter skills, and travel to lake or sea locations.
- Travel takes time. On arrival, the character fishes passively until a new action is submitted.
- Inventory capacity limits fishing output. Returning home unloads the current haul.
- Main rankings are Most Fish and Biggest Fish.
- Previous Project-A history and cosmetics are prestige-only.

## Visual QA

Use [Season 5 Visual QA](season-5-visual-qa.md) before closing map, character window, inventory, marker, or responsive layout work.

## History Import

Use the import script only against separate databases:

```bash
PRODUCTION_DATABASE_URL=postgresql://... \
DATABASE_URL=postgresql://...project-a-s5-db... \
npm run db:import-season-five-history --workspace web
```

The script refuses to run if the source and target database URLs are identical. It copies users, OAuth accounts, resolved cycle history, winner requests, community wishes/votes, arcade wallets, loot-box purchases, cosmetic unlocks, and resolved-cycle arcade transactions. It does not copy active Season 4 gameplay state.

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
