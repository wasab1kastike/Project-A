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
- Character avatars use one no-coat body per class plus fitted outfit base variants for waders, raincoat, and greatcoat.
- Pants do not visually swap the body; they map to the no-coat body until pants-specific visuals are intentionally added.
- Hats and rods layer over the selected base without map-frame clipping or class-specific drift.
- Gear icons use neutral reference assets and do not fall back to initials or missing-image boxes.
- The inventory panel makes full-inventory state visible.
- The two ranking panels remain readable: Most Fish and Biggest Fish.

## Character Avatar Pipeline

Season 5 avatars use a hybrid fitted-base model on a shared 256 x 320 transparent canvas:

- No-coat class bodies live under `/assets/season-5/avatar/body/{family}.png`.
- Outfit bases live under `/assets/season-5/avatar/base/{family}/{outfit}.png`.
- Hats and rods use fitted family overlays under `/assets/season-5/avatar/{hat|rod}/{visualKey}.{family}.png`.
- Neutral item references live under `/assets/season-5/avatar/reference/{slot}/{visualKey}.png`.
- Active body families: `monk`, `warrior`, `wizard`, and `rogue`.
- Active outfit bases: `pants`, `waders`, `raincoat`, and `greatcoat`; `pants` resolves to the no-coat class body.
- Active hat overlays: `cap`, `bucket`, and `pointy`.
- Active rod overlays: `splintered`, `cane`, `bamboo`, and `obsidian`.

Do not reintroduce body-part rendering for the active Season 5 avatar path. If a fitted base image has clipping, magenta fringe, wrong class identity, or bad coat fit, regenerate or renormalize that base asset. If a hat or rod is consistently shifted for one family, fix it with `SEASON_FIVE_AVATAR_LAYER_FITS` offsets and scales.

The old Retired Warrior modular body-part scripts and sheets are legacy-only experiments. Keep them out of active QA unless the body-part system is explicitly restarted.

Regenerate current review sheets with:

```powershell
node scripts/render-season-5-avatar-qa.mjs
```

Review sheets:

- `docs/season-5-avatar-hybrid-bases.png`
- `docs/season-5-avatar-hybrid-samples.png`
- `docs/season-5-avatar-hybrid-matrix.png`

## Class Visual Language

Season 5 class tokens are bundled PNG assets:

| Class           | Asset                                          |
| --------------- | ---------------------------------------------- |
| Drunken Monk    | `/assets/season-5/classes/drunken-monk.png`    |
| Retired Warrior | `/assets/season-5/classes/retired-warrior.png` |
| Demented Wizard | `/assets/season-5/classes/demented-wizard.png` |
| Burnt-Out Rogue | `/assets/season-5/classes/burnt-out-rogue.png` |

The same class token appears in class cards, character badges, and map player markers. Marker state is shown by the marker shell and small status dot: brown for home, amber for traveling, teal for fishing, and a red warning ring/dot when inventory is full.

## June 8, 2026 Avatar QA Result

Checked against `codex/season-5` with the hybrid avatar path active.

| Check                   | Result                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Base review sheet       | Passed: all four classes render no-coat, waders, raincoat, and greatcoat bases on the shared 256 x 320 grid. |
| Sample combination grid | Passed: representative hat and rod overlays render over all class/outfit bases without missing assets.       |
| Exhaustive matrix       | Passed: all active class, outfit, hat, and rod visual combinations render into the compact QA sheet.         |

Browser viewport verification should still be repeated after UI changes to the map marker, character management page, or inventory panels.
The in-app browser connector was unavailable for this June 8 artifact-only QA pass, so desktop/mobile viewport screenshots were not repeated.

## June 5, 2026 Smoke Result

Checked against `codex/season-5` with the Season 5 preview flag enabled.

| Viewport   | Result                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 1440 x 900 | Passed: map asset loaded, pre-character map span was full width, no horizontal overflow.       |
| 390 x 844  | Passed: class cards and map stacked without horizontal overflow; map rendered at mobile width. |

DB-backed character actions were not exercised in this visual pass because local PostgreSQL was not reachable.
