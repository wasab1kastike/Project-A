# Privacy and retention policy

This document describes the current data-handling policy for Project-A. It is intended to set operator expectations for what is stored, why it is stored, and when it should be deleted.

## Scope

Project-A currently uses Google sign-in with database-backed sessions. The game presents players publicly by commander name, but the service operator can still identify accounts through stored authentication records.

This is pseudonymous gameplay, not fully anonymous operation.

## Data collected

### Authentication and account data

Stored in the authentication tables and user profile:

- Google account email address
- Google profile name, if provided
- Google profile image URL, if provided
- Provider account identifier
- OAuth tokens stored by the auth adapter when returned by the provider
- User role such as PLAYER or ADMIN
- Session records and session expiry timestamps

Purpose:

- authenticate the player
- keep players signed in across requests
- determine admin access
- associate game progress with a stable account

## Gameplay data

Stored in game tables:

- commander name
- fortress name and game progress
- chat messages and GIF metadata submitted in game
- battle history, score history, cycle history, votes, wishes, and other gameplay events
- cosmetic unlocks and arcade progress

Purpose:

- run the multiplayer season
- show player-visible history and rankings
- support moderation and season resolution

## Session policy

Project-A uses database-backed sessions.

- Session max lifetime: 7 days
- Session rotation window: 12 hours of activity

Policy intent:

- reduce the window for stolen session reuse
- keep active players signed in without rotating the session record on every request

## Retention policy

### Active user accounts

Retain account and gameplay data while the account remains active in the service.

### Inactive user accounts

Review for deletion or anonymization after 12 months of inactivity, unless the data must be retained for:

- security investigation
- abuse prevention
- financial or legal obligations
- preserving season history in a form that no longer identifies the player directly

### Sessions

Expired sessions should be treated as disposable authentication data and may be deleted during routine maintenance.

Recommended operational policy:

- remove expired sessions at least every 30 days

### OAuth account tokens

Tokens stored in account records should be retained only as long as required for the current sign-in integration.

Recommended operational policy:

- periodically review whether refresh tokens and access tokens are still needed
- delete token fields for accounts that are removed or anonymized

### Chat and season history

Gameplay history may be retained longer than account records to preserve season outcomes, balance analysis, and moderation evidence.

If an account is deleted, historical records should be anonymized where feasible by removing or replacing direct user identifiers while keeping aggregate game history intact.

## Deletion and anonymization policy

Project-A does not currently expose a self-service account deletion flow in the product.

Current policy:

- account deletion requests must be handled manually by an administrator or operator
- when deleting an account, remove active sessions and linked OAuth account records first
- if full deletion would break historical integrity, anonymize remaining historical records where feasible
- preserve only the minimum data required to maintain season history, moderation evidence, or legal compliance

## Operational rules

- Do not use production data for local development unless it has been anonymized first.
- Do not store secrets or private exports in the repository.
- Restrict access to production databases and admin tools to authorized operators only.
- Review this policy whenever authentication providers, retention needs, or legal requirements change.

## Future improvements

Recommended follow-up work:

- add an admin-safe expired-session cleanup job
- add a documented account deletion runbook
- add a self-service export and deletion workflow if privacy requirements grow
- reduce stored OAuth token fields if the sign-in flow does not require them long term
- add a public-facing privacy notice if the game opens beyond private testing
