# Changelog Policy

## Purpose
This project maintains a text-first changelog so gameplay and UX changes are easy to audit, communicate, and review before deployment.

## Required entry format
Every notable change (especially map/gameplay changes) must include:

1. **Date** in `YYYY-MM-DD`
2. **Change summary** (what was changed)
3. **User impact** (what players immediately notice or gain)

Recommended structure:

```md
## YYYY-MM-DD
- Change: ...
- Change: ...
- User impact: ...
```

## Scope guidance
Add entries for:
- gameplay rules, timers, scoring, or combat behavior
- battlefield map controls, readability, accessibility, or rendering behavior
- deploy/hosting constraints that affect user-visible functionality

Skip entries for:
- typo-only edits with no product impact
- purely internal refactors that do not alter player/admin behavior

## Map overhaul log

## 2026-04-21
- Change: Reworked battlefield map decoration into layered vector zones (lakes, forests, segmented roads) with clearer stacking order.
- Change: Improved marker contrast and mobile detail fallback for dense map states.
- User impact: The battlefield is easier to read at a glance, panning/zooming context is preserved better on smaller screens, and targets are faster to identify during active play.
