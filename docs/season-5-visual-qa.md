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

| Viewport   | Purpose                       |
| ---------- | ----------------------------- |
| 1440 x 900 | Desktop map-first layout      |
| 1024 x 768 | Tablet/compact desktop layout |
| 390 x 844  | Mobile portrait layout        |

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
- Character avatars use one default body per class; retired warrior, monk, wizard, and rogue body variants are not active equipment bodies.
- Retired Warrior base body parts are generated as separate full-canvas assets before item-worn variants are added.
- The inventory panel makes full-inventory state visible.
- The two ranking panels remain readable: Most Fish and Biggest Fish.

## Character Avatar Pipeline

Season 5 avatars keep a shared 256 x 320 transparent canvas for every bitmap layer. The first modular character pass is Retired Warrior only:

- Base parts live under `/assets/season-5/avatar/characters/warrior/idle/front/0/`.
- Item-worn parts live under `/assets/season-5/avatar/items/{slot}/{visualKey}/warrior/idle/front/0/`; the current item-worn set is deferred until the base body is approved.
- Neutral item references live under `/assets/season-5/avatar/reference/{slot}/{visualKey}.png`.
- Supported warrior base-body set: `head`, `torso`, `legs`, `leftHand`, and `rightHand`.
- Planned warrior item-part set: outfits `pants`, `waders`, `raincoat`; hats `cap`, `bucket`, `pointy`; rods `splintered`, `cane`, `obsidian`.
- Bamboo rod and non-warrior classes intentionally use the existing fitted full-layer renderer until they get matching part art.

Review sheets:

- `docs/season-5-warrior-body-parts.png`
- `docs/season-5-warrior-item-references.png` (previous item reference sheet)
- `docs/season-5-warrior-item-combinations.png` (previous item combination sheet; regenerate after item-specific parts are rebuilt)

## Class Visual Language

Season 5 class tokens are bundled PNG assets:

| Class           | Asset                                          |
| --------------- | ---------------------------------------------- |
| Drunken Monk    | `/assets/season-5/classes/drunken-monk.png`    |
| Retired Warrior | `/assets/season-5/classes/retired-warrior.png` |
| Demented Wizard | `/assets/season-5/classes/demented-wizard.png` |
| Burnt-Out Rogue | `/assets/season-5/classes/burnt-out-rogue.png` |

The same class token appears in class cards, character badges, and map player markers. Marker state is shown by the marker shell and small status dot: brown for home, amber for traveling, teal for fishing, and a red warning ring/dot when inventory is full.

## June 5, 2026 Smoke Result

Checked against `codex/season-5` with the Season 5 preview flag enabled.

| Viewport   | Result                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 1440 x 900 | Passed: map asset loaded, pre-character map span was full width, no horizontal overflow.       |
| 390 x 844  | Passed: class cards and map stacked without horizontal overflow; map rendered at mobile width. |

DB-backed character actions were not exercised in this visual pass because local PostgreSQL was not reachable.
