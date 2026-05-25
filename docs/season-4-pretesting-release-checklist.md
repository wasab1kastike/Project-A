# Season 4 Pretesting Release Checklist

This checklist gates deployment of the `SEASON_4` ruleset work to `main`.
Pretesting may be deployed only after the operational and migration safeguards
below are complete. Activation remains separately blocked by
`SEASON_4_ACTIVATION_ENABLED`.

## Before Pull Request Merge

- Rotate the production PostgreSQL credential that was exposed during migration recovery.
- Update Render/database environment secrets to the rotated credential and verify application connectivity.
- Confirm `SEASON_4_ACTIVATION_ENABLED` is unset or `false`.
- Rehearse all pending Prisma migrations against a current production snapshot.
- Verify the ruleset migration marks only the unresolved registration/testing pretesting cycle as `SEASON_4`; resolved historical cycles remain `LEGACY`.
- Review that Season 4 does not spawn or expose Home of A, loot camps, or active legacy race abilities.

## Verification

```bash
npm run db:generate --workspace web
npm run test:game --workspace web
npm run typecheck --workspace web
npm run build --workspace web
```

- Record whether PostgreSQL-backed tests executed or skipped.
- Verify `/wiki`, `/politics`, Castle, and battlefield state on desktop and mobile after deployment to pretesting.
- Exercise pressure priorities, alliance proposal/cancellation/rejection/acceptance, trust upgrade, betrayal, war, peace, guard recall, campaign buildup, siege warning, and automated tile siege resolution with test fortresses.

## Activation Hold

- Do not set `SEASON_4_ACTIVATION_ENABLED=true` until the complete trade, standing-order/campaign, covert-raid, doctrine, scoring, and acceptance test scope has passed.
- After final approval, enable the flag deliberately and monitor the first active ticks and migration logs.
