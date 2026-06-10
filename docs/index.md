# Project-A

> Browser-based multiplayer strategy game. Build a fortress, claim territory, forge alliances, and conquer the map.

## Quick Links

| Doc | What's In It |
|-----|-------------|
| [Game Systems Plan](game-systems-plan.md) | Product loop, player verbs, map/control contract, system boundaries |
| [Game Design](game-design.md) | Core rules: economy, combat, diplomacy, map |
| [Season 4](season-4.md) | Doctrines, pressure system, race abilities, trade redesign |
| [Data Model](data-model.md) | Database schema: models, enums, relationships |
| [Development Workflow](development-workflow.md) | How to contribute: commands, patterns, gotchas |

## Project Status

Season 4 is the current active ruleset (`CycleRuleset.SEASON_4`). The legacy ruleset exists for historical season replays only.

## Stack

Next.js 16, React 19, TypeScript 5, Prisma 7, PostgreSQL, Auth.js v5, Socket.IO.

## Getting Started

```bash
npm install
npm run dev          # localhost:3000
npm run test:game    # game logic tests
npm run typecheck    # TypeScript check
```
