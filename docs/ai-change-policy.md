# AI Change Policy

## Goal
Let the recorded winner of a resolved cycle submit one bounded request for a future update without breaking fairness, operations, or the MVP scope.

## Allowed Scope
- One clear gameplay-facing change per winning cycle
- Small UI or rules adjustments that are easy to explain and easy to review
- Requests that fit comfortably inside a short paragraph
- Changes that can be reviewed by an admin before any implementation work begins

## Needs Simplification
- Requests that bundle multiple features together
- Requests that read like a roadmap instead of one bounded change
- Requests that are too long, too vague, or too broad to estimate safely
- Requests that might become acceptable after being rewritten more narrowly

## Rejected Requests
- Direct self-buffs, score grants, or economy advantages for one player
- Requests that target, punish, or nerf named players or groups
- Auth, admin, secrets, billing, database, or infrastructure changes
- Requests for automatic code generation, pull requests, merges, or deployments
- Anything that would make the game unwinnable, opaque, or operationally unsafe

## Review Flow
1. The recorded winner submits one request for a resolved cycle.
2. The server validates it against this policy and stores an initial status.
3. Admin reviews the stored request, status, and notes.
4. Admin may move it to `UNDER_ADMIN_REVIEW`, `NEEDS_SIMPLIFICATION`, `ACCEPTED`, or `REJECTED`.
5. No code generation, PR creation, or deploy happens automatically from this flow.

## After Approval
- `ACCEPTED` means the request is eligible for future implementation work.
- A separate human-reviewed development step is still required.
- Any later deploy and season reset must happen through the normal repo and admin workflow, not automatically from the winner request itself.
