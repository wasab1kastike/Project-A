# Changelog

## 2026-05-07
- Change: Reduced `ARMY_UPKEEP_PER_UNIT` from 0.25 to 0.01 food per unit per tick.
- User impact: 1 food now sustains 100 active army units per tick; players can maintain much larger standing armies without heavy food investment.

## 2026-05-06

- Change: Wired order-based army recruitment into live gameplay with `Fortress.recruitmentQueue`, a `recruitArmy` server action, Castle-page queue controls, upfront gold payment, tick-based recruiter processing, and active-army food upkeep.
- Change: Updated tick persistence so battlefield loot, casualties, rewards, and tile transfers are applied after economy writes and are not overwritten by stale tick accumulators.
- Change: Enforced simultaneous outbound attack limits for battlefield reinforcements, matching direct attack behavior.
- Change: Fixed desktop hex-tile click/tap selection so PC players can inspect and buy tiles from the battlefield map.
- Change: Battle-log badges now show unread/new report counts instead of total historical entry counts.
- Change: Updated README, game design docs, and the in-app wiki to describe queued recruitment, upkeep, tile interactions, unread battle-log behavior, and current combat limits.
- User impact: Army growth is now an explicit spending and timing decision, combat accounting is more reliable, map tiles are usable on desktop, and player-facing docs match the live rules.

## 2026-04-29

- Change: Restored Unstable Unicorn teleport decoy creation after teleport actions, preserving decoy ownership, combat visibility, and cleanup behavior.
- Change: Improved Castle Yeet relocation safeguards and warning copy, including rendered-map no-move edge cases and more varied valid destination selection.
- Change: Added attack recall and return-reporting refinements so recalled units and returning armies are handled consistently in battle logs.
- Change: Raised raid loot caps to 70% for points and food.
- Change: Added wiki navigation/content coverage and a special God Emperor A gift notice for Tero.
- Change: Continued shop and cosmetic polish with default-skin handling, equipped-skin rendering, and dedicated fortress sprite support.
- User impact: Unicorn teleports once again leave convincing decoys, Castle Yeet outcomes are clearer and less repetitive, raid rewards are larger, players have easier access to rules/context, and cosmetic choices display more reliably.

## 2026-04-28

- Change: Added simultaneous attack cap tied to castle level: default max is `2 + level`, raised to `2 + 2×level` for Space Murines.
- Change: Enforced attack cap server-side in `setFortressAction` before launching a new attack unit.
- Change: Added `outboundAttackUnitCount` and `maxSimultaneousAttacks` fields to the player summary read model.
- Change: "Send attack" button now shows current/max slot count (e.g. `1/3`) and displays a blocking validation message when cap is reached.
- Change: Unstable Unicorns race buff: enemies see `?` instead of army size for units in transit.
- Change: Castle upgrade costs raised approximately 5×: 500 / 1500 / 3000 / 5000 / 7500 / 10500 / 14000 / 18000 / 22500 pts.
- Change: Updated Space Murines and Unstable Unicorns `passiveSummary` to reflect new buffs.
- User impact: Players can no longer spam unlimited simultaneous attacks; the cap grows as you upgrade your castle (Space Murines scale faster). Unicorn army sizes are hidden from enemies on the map. Upgrading a castle now requires significantly more points.

- Change: Portaled the Season Update dialog overlay to a top-level modal root (`#modal-root` fallback to `document.body`) while keeping the trigger button in the existing top navigation flow.
- Change: Tightened modal viewport constraints with safe-area-aware height bounds, explicit viewport-safe width caps, and vertical-only scroll containment on small screens.
- Change: Updated Space Murines season-update copy to reflect the current race fantasy description.
- Change: Expanded ORKS season-update copy with lore context about following the legendary Khraal.
- User impact: On mobile devices, the Season Update card now stays fully anchored within the visible viewport so close and primary actions remain reachable without horizontal overflow.

## 2026-04-23

- Change: Extended homepage read-model cycle metadata with ACTIVE-only `lastProcessedTickAt` and computed `tickDelayMinutes` from the latest processed game tick.
- Change: Added ACTIVE HUD status text showing last update time and current tick delay, with an elevated warning style when delay reaches 2+ minutes.
- Change: Added read-model integration tests covering healthy ACTIVE delay, delayed ACTIVE delay, and null tick metadata during REGISTRATION.
- User impact: Players now get subtle but immediate visibility into live-tick freshness during active seasons, while non-active phases stay uncluttered.
- Change: Added ACTIVE cycle tick-lag diagnostics (`tickHealth`, `minutesBehind`, `lastProcessedTickAt`) to the admin dashboard read model using cycle start time, latest processed tick, and current minute.
- User impact: Admins can now quickly see whether the tick runner is healthy, lagging, or stalled and how far behind processing is.
- Change: Added a manual admin catch-up tick operation and wired it to a new admin action that revalidates `/`, `/admin`, and `/history`.
- User impact: When tick processing falls behind, admins can manually unfreeze scoreboard progression without waiting for the next automatic runner pass.
- Change: Added a prominent admin warning banner when tick lag reaches two or more minutes, plus integration coverage for stalled detection and manual catch-up recovery.
- User impact: Stalled tick states are now surfaced clearly in the UI and protected by regression tests to prevent frozen-score incidents.
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
