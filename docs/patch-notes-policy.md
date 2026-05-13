# Patch Notes Policy

## Purpose
This project keeps player-facing patch notes separate from the developer
changelog so players get a readable summary of what changed without internal
implementation detail.

## Required entry shape
Each release entry must include:

1. `date` in `YYYY-MM-DD`
2. optional `title`
3. `newFeatures` array
4. `bugFixes` array

The two category labels exposed in the UI must remain exactly:

- `New features`
- `Bug fixes`

## Authoring rules
- Add every player-visible gameplay, UX, readability, or accessibility change
  to one of the two categories.
- Use concise player-facing language, not implementation detail.
- Keep releases ordered newest-first in the typed patch-notes source.
- Keep the developer `CHANGELOG.md` intact as the audit/dev log; do not make
  the app depend on it at runtime.

## 2026-05-13
- Change: Mega Fortress (Home of A) now drains defending units at an escalating rate: 1 + 1 per tick held. The longer a fortress holds the Mega Fortress, the more units are drained from all defenders each tick.
- Polish: Battlefield UI now shows persistent Mega Fortress control, defenders, and point rewards at the top of the screen.
- User impact: Defending the Mega Fortress becomes riskier over time, requiring active reinforcement and coordination. Players can always see who controls the Mega Fortress and how points and drain are applied.

