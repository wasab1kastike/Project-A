# Changelog

## 2026-04-23

- Change: Raised immersive battlefield drawer layering with scoped z-index overrides for shared drawer chrome plus ordered chat/orders stack levels.
- User impact: Chat and Orders panels now stay above immersive HUD overlays and map controls while preserving their relative stacking order on desktop and mobile.
- Change: Replaced spawn-point hash ordering with a seeded pseudo-random sampler that shuffles valid spawn hex candidates, enforces unique `mapX:mapY` assignments, and applies distance-aware selection.
- User impact: Fortress and mega-fortress spawns now vary more naturally between cycles and reshuffles while still staying on valid spawn hexes and avoiding clustered placements.
- Change: Kept deterministic replay by requiring explicit seeds, and upgraded seed composition to deterministic SHA-256 derived values that incorporate cycle and tick context for higher per-cycle/per-event entropy.
- User impact: Same seed + cycle state reproduces the same spawn layout for server reconciliation; different seeds now produce meaningfully different layouts more consistently.

## 2026-04-22

- Change: Removed the decorative action flag overlay from player fortress sprites on the battlefield map.
- User impact: Fortress markers now render without the pole-and-flag icon above the castle art.
- Change: Decoupled homepage realtime bridge activation from authenticated sessions and now enable live refreshes whenever a cycle exists.
- Change: Added a graceful realtime fallback that switches to periodic `router.refresh()` polling when socket auth/connection fails (for example in spectator mode).
- User impact: Spectators now see score/HP changes update automatically during active cycles without manually refreshing the page.
- Change: Added a regression test to verify ATTACK mode launches exactly one unit per minute while earlier units are still in transit, with long-distance travel timing and per-launch ATTACK_SELF score deductions.
- User impact: Prevents silent regressions where queued attack launches or launch-cost accounting could stop working before the first unit arrives.
- Change: Updated join-cycle eligibility to allow joining during both open REGISTRATION and open ACTIVE windows.
- User impact: Mid-season join enabled when slots remain.
- Change: Kept admin join lock behavior scoped to REGISTRATION only, preserving existing product behavior outside the registration window.
- Change: Updated join error messaging to phase-neutral wording (for example, "Joining is closed for this cycle.").
- User impact: Players can join a cycle while it is active (until `activeEndsAt`), and error messages now accurately reflect the expanded join window.
- Change: Renamed homepage read-model join flag from `canJoinRegistration` to `canJoinCycle` to reflect registration and active-season joins.
- Change: Refined season phase and status helper copy to clearly explain when joins are open during ACTIVE and why joining is blocked when locks, deadlines, or capacity limits apply.
- Change: Updated home CTA copy to clarify that users can join an already-running season when eligible.
- User impact: Players get clearer guidance about joining behavior across cycle phases and can understand lockout reasons without guessing.

## 2026-04-21

- Change: Added traveling attack units with distance-based arrival timing, launch-time attacker cost, impact-time target damage, and one active outbound unit per attacker.
- Change: Added random retro pixel-art unit sprite variants for fortresses and renders active attacks as moving units on the battlefield.
- User impact: Attacks are now visible and easier to reason about, with far targets taking longer to hit.
- Change: Refined homepage state copy for REGISTRATION, ACTIVE, and fallback phases with concise headline, one-sentence description, and explicit next action guidance.
- Change: Shortened and de-duplicated copy in Season control, Battlefield, Session, and chat helper panels.
- Change: Reworked fortress map battlefield decor into semantic vector layers (lakes, forests, segmented roads) with explicit z-index stacking, stronger marker contrast, and mobile detail fallback.
- User impact: Players can scan phase status faster and identify map targets more reliably during active play, especially on smaller screens.
