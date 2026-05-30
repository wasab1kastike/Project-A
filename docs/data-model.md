# Data Model

> Condensed schema reference. The single source of truth is `apps/web/prisma/schema.prisma`.

---

## Core Enums

### Cycle & Season

| Enum | Values |
|------|--------|
| `CycleStatus` | `REGISTRATION`, `TESTING`, `ACTIVE`, `RESOLUTION` |
| `CycleRuleset` | `LEGACY`, `SEASON_4` |

### Combat

| Enum | Values |
|------|--------|
| `BattlefieldStatus` | `ACTIVE`, `RESOLVED` |
| `BattlefieldSide` | `ATTACKER`, `DEFENDER` |
| `ArmyOrderType` | `GUARD`, `ESCORT`, `RAID`, `CAMPAIGN` |
| `ArmyOrderStatus` | `ACTIVE`, `TRANSFERRED`, `RETURNED`, `CANCELED` |
| `TerritoryCampaignStatus` | `BUILDING`, `SIEGE_WARNING`, `ENGAGED`, `RESOLVED`, `CANCELED` |

### Race System

| Enum | Values |
|------|--------|
| `FortressRace` | `DWARFS`, `UNSTABLE_UNICORNS`, `SPACE_MURINES`, `ORKS` |
| `FortressDoctrine` | `DWARF_HOLDFAST`, `DWARF_WATCHKEEPERS`, `ORK_MARAUDERS`, `ORK_SIEGEBREAKERS`, `MURINE_CONVOY_COMMAND`, `MURINE_RAPID_RESPONSE`, `UNICORN_GLITTER_FRONTIER`, `UNICORN_VEILED_NETWORK` |
| `RaceAbilityKind` | `DWARF_DEEP_MINING`, `DWARF_RUNE_OF_GRUDGES`, `ORK_BOSS_ORDER`, `ORK_WAAAGH_INVESTMENT`, `MURINE_RAPID_RESPONSE`, `UNICORN_SHATTERED_REALITY` |
| `DwarfDeepMiningOutcome` | `RICH_VEIN`, `ORE_SURGE`, `BATTLE_RUNES`, `FACTION_SEAL`, `BURIED_WARBAND`, `CAVE_IN`, `UNSTABLE_TUNNELS`, `SHAFT_COLLAPSE` |
| `OrkBossOrderKind` | `MORE_DAKKA`, `LOOT_WAGONS`, `PATCH_DA_FORT` |
| `OrkWaaaghInvestmentKind` | `KEEP_IT_LOUD`, `BIGGER_SHOUTIN`, `DA_GREEN_TIDE` |
| `UnicornShatteredRealityOutcome` | `MIRROR_HOST`, `PRISMATIC_SURGE`, `LUCKY_GALLOP` |

### Diplomacy & Trade

| Enum | Values |
|------|--------|
| `DiplomacyRelationStatus` | `NEUTRAL`, `ALLIANCE_PENDING`, `ALLIED`, `ENEMY`, `WAR_PENDING`, `WAR`, `PEACE_PENDING` |
| `TradeOfferStatus` | `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELED`, `EXPIRED`, `COMPLETED` |
| `TradeLineItemKind` | `GOLD`, `FOOD`, `ARMY` |
| `ConvoyLegStatus` | `IN_TRANSIT`, `DELIVERED`, `SEIZED`, `INTERCEPTED`, `CANCELED` |

### Fortress Types

| Enum | Values |
|------|--------|
| `FortressKind` | `PLAYER`, `MEGA`, `UNICORN_DECOY`, `LOOT_CAMP`, `DWARF_RUNE` |
| `FortressAction` | `GROW`, `ATTACK` |
| `CastleUpgradeSpecialization` | `POINTS`, `FOOD`, `MILITARY`, `DEFENSE` |

### Misc

| Enum | Values |
|------|--------|
| `UserRole` | `PLAYER`, `ADMIN` |
| `ScoreEventType` | 21 values — all sources of score changes |
| `ChatMessageType` | `TEXT`, `GIF` |

---

## Key Models

### Core

```
User ──→ Fortress[] (one per cycle)
     ──→ ChatMessage[], ScoreEvent[], ArcadeWallet
     ──→ wonCycles (Cycle winner)

Cycle ──→ Fortress[], GameTick[], ScoreEvent[], AttackUnit[]
      ──→ Battlefield[], DiplomacyRelation[], TradeOffer[]
      ──→ MapHexOwnership[], ArmyOrder[], TerritoryCampaign[]
```

### Fortress

Key fields: `gold`, `food`, `army`, `points`, `level`, `health`, `maxHealth`, `mapX`, `mapY`, `race`, `doctrine`

Worker assignment: `minersAssigned`, `farmersAssigned`, `recruitersAssigned`, `pressureWorkersAssigned`

Unique: `(cycleId, ownerId)`, `(cycleId, commanderName)`, `(cycleId, name)`

### Combat Chain

```
AttackUnit → travels → arrives → damage applied
                               → if multi-attacker → Battlefield forms
                               → BattlefieldParticipant[] join sides
                               → casualties tick → resolve when one side empty
```

### Diplomacy Chain

```
DiplomacyRelation (fortressAId, fortressBId, status, timestamps)
  Unique: (cycleId, fortressAId, fortressBId) where A < B
```

### Trade Chain

```
TradeOffer → TradeLineItem[] (GOLD/FOOD/ARMY)
           → ConvoyLeg[] (IN_TRANSIT → DELIVERED/SEIZED/INTERCEPTED)
           → ArmyOrder (ESCORT/RAID) → CovertIncident
```

### Race Abilities

```
RaceAbilityActivation (fortressId, abilityKind, activatedAt, cooldownEndsAt)
OrkScrapBank (fortressId, scrap)
OrkBossOrder (fortressId, kind, expiresAt)
DwarfGrudge (ownerId, targetId, tier, bountyPoints)
DwarfDeepMiningRoll (ownerId, outcome, goldDelta)
UnicornShatteredRealityRoll (fortressId, outcome, deltas)
UnicornTemporaryTeleport (fortressId, originTileId, targetTileId, expiresAt)
```

### Map

```
MapHexOwnership (cycleId, tileId, ownerFortressId) — unique per cycle+tile
TilePressurePriority (cycleId, fortressId, tileId, weight)
TilePressureState (cycleId, tileId, fortressId, pressure)
```

---

## Key Design Decisions

1. **Canonical pair ordering** — DiplomacyRelation stores `fortressAId < fortressBId`
2. **No cascade delete on winners** — Cycle sets `winnerId` to `SetNull` on User delete
3. **JSON metadata** — ScoreEvent, GameTick, CycleHistory use JSON for flexible audit data
4. **Single recruitment queue** — `Fortress.recruitmentQueue` is an Int, not a separate table
5. **Unique per cycle** — gameplay uniqueness is always scoped to `cycleId`, never global
