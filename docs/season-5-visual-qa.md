# Season 5 Visual QA

Use this checklist for Season 5 map, character, inventory, and marker visual changes.

## Local Setup

Run the preview locally with the Season 5 flag enabled:

```powershell
$env:SEASON_5_PREVIEW_ENABLED="true"
$env:NEXT_PUBLIC_REALTIME_ENABLED="false"
npm run dev --workspace web -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/`.

## Viewport Matrix

Check these viewport sizes before closing visual work:

| Viewport | Purpose |
| --- | --- |
| 1440 x 900 | Desktop map-first layout |
| 1024 x 768 | Tablet/compact desktop layout |
| 390 x 844 | Mobile portrait layout |

## Acceptance Checks

- The Season 5 map image loads from `/assets/season-5/world-map.png`.
- Before character creation, the map spans the full playfield width on desktop instead of collapsing into a sidebar column.
- The page has no horizontal overflow at desktop, tablet, or mobile sizes.
- Destination pins remain readable and clickable when enabled.
- Player markers stay bounded near their destination and do not cover pin labels.
- Class cards show all five stats without text overflow.
- The character link and inventory link remain reachable on desktop and mobile.
- The inventory panel makes full-inventory state visible.
- The two ranking panels remain readable: Most Fish and Biggest Fish.

## June 5, 2026 Smoke Result

Checked against `codex/season-5` with the Season 5 preview flag enabled.

| Viewport | Result |
| --- | --- |
| 1440 x 900 | Passed: map asset loaded, pre-character map span was full width, no horizontal overflow. |
| 390 x 844 | Passed: class cards and map stacked without horizontal overflow; map rendered at mobile width. |

DB-backed character actions were not exercised in this visual pass because local PostgreSQL was not reachable.
