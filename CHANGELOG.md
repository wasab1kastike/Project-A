# Changelog

## 2026-04-22

- Change: Updated join-cycle eligibility to allow joining during both open REGISTRATION and open ACTIVE windows.
- Change: Kept admin join lock behavior scoped to REGISTRATION only, preserving existing product behavior outside the registration window.
- Change: Updated join error messaging to phase-neutral wording (for example, "Joining is closed for this cycle.").
- User impact: Players can join a cycle while it is active (until `activeEndsAt`), and error messages now accurately reflect the expanded join window.

## 2026-04-21

- Change: Added traveling attack units with distance-based arrival timing, launch-time attacker cost, impact-time target damage, and one active outbound unit per attacker.
- Change: Added random retro pixel-art unit sprite variants for fortresses and renders active attacks as moving units on the battlefield.
- User impact: Attacks are now visible and easier to reason about, with far targets taking longer to hit.
- Change: Refined homepage state copy for REGISTRATION, ACTIVE, and fallback phases with concise headline, one-sentence description, and explicit next action guidance.
- Change: Shortened and de-duplicated copy in Season control, Battlefield, Session, and chat helper panels.
- Change: Reworked fortress map battlefield decor into semantic vector layers (lakes, forests, segmented roads) with explicit z-index stacking, stronger marker contrast, and mobile detail fallback.
- User impact: Players can scan phase status faster and identify map targets more reliably during active play, especially on smaller screens.
