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

