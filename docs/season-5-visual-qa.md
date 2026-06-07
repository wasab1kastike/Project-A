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
- Class portraits load from `/assets/season-5/classes/` and are not reduced to text initials.
- Before character creation, the map spans the full playfield width on desktop instead of collapsing into a sidebar column.
- The page has no horizontal overflow at desktop, tablet, or mobile sizes.
- Destination pins remain readable and clickable when enabled.
- Water and coast tiles show a subtle fishable highlight and can be selected without covering the playfield.
- Locked deep or lava fishing routes show a compact lock reason instead of an enabled travel action.
- Revealed water-body details fit inside the route preview at desktop, tablet, and mobile widths.
- Player markers stay bounded near their destination and do not cover pin labels.
- Player marker status dots distinguish home, traveling, and fishing states.
- Class cards show all five stats without text overflow.
- The character link and inventory link remain reachable on desktop and mobile.
- The inventory panel makes full-inventory state visible.
- The two ranking panels remain readable: Most Fish and Biggest Fish.
- Class avatars compose from the five shared-canvas body parts in this order: legs, torso, head, left hand, right hand.

## Class Visual Language

Season 5 class tokens are bundled SVG assets:

| Class | Asset |
| --- | --- |
| Drunken Monk | `/assets/season-5/classes/drunken-monk.svg` |
| Retired Warrior | `/assets/season-5/classes/retired-warrior.svg` |
| Demented Wizard | `/assets/season-5/classes/demented-wizard.svg` |
| Burnt-Out Rogue | `/assets/season-5/classes/burnt-out-rogue.svg` |

The same class token appears in class cards, character badges, and map player markers. Marker state is shown by the marker shell and small status dot: brown for home, amber for traveling, teal for fishing, and a red warning ring/dot when inventory is full.

## Avatar Body Parts

Base Season 5 class avatars use replaceable body-part PNGs under `/assets/season-5/avatar/characters/{rig}/idle/front/0/`. Each rig has `legs.png`, `torso.png`, `head.png`, `left-hand.png`, and `right-hand.png` on the shared `256 x 320` avatar canvas.

Equipped items use full-canvas replacement parts under `/assets/season-5/avatar/items/{slot}/{visualKey}/{rig}/idle/front/0/`. Body items replace all five parts, outfits replace their covered parts, hats replace `head`, and rods replace `right-hand`.

Use [season-5-avatar-body-parts.png](season-5-avatar-body-parts.png) for base part boundaries and [season-5-avatar-item-combinations.png](season-5-avatar-item-combinations.png) for current equipment combinations.

## June 5, 2026 Smoke Result

Checked against `codex/season-5` with the Season 5 preview flag enabled.

| Viewport | Result |
| --- | --- |
| 1440 x 900 | Passed: map asset loaded, pre-character map span was full width, no horizontal overflow. |
| 390 x 844 | Passed: class cards and map stacked without horizontal overflow; map rendered at mobile width. |

DB-backed character actions were not exercised in this visual pass because local PostgreSQL was not reachable.
