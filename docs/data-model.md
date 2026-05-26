# Data Model Reference

> Generated from `apps/web/prisma/schema.prisma` — the single source of truth for the Project-A database schema. All models, enums, relationships, and indexing decisions live in that file.

---

## 1. Enums

### User & Auth

| Enum | Values | Purpose |
|------|--------|---------|
| `UserRole` | `PLAYER`, `ADMIN` | Controls access to admin dashboard/actions |

### Cycle / Season

| Enum | Values | Purpose |
|------|--------|---------|
| `CycleStatus` | `REGISTRATION`, `TESTING`, `ACTIVE`, `RESOLUTION` | Phases of a season lifecycle |
| `CycleRuleset` | `LEGACY`, `SEASON_4` | Feature-gating — LEGACY preserves old mechanics; SEASON_4 uses the redesign |

### Combat & Battlefields

| Enum | Values | Purpose |
|------|--------|---------|
| `FortressAction` | `GROW`, `ATTACK` | Current fortress posture |
| `BattlefieldStatus` | `ACTIVE`, `RESOLVED` | Combat lifecycle |
| `BattlefieldSide` | `ATTACKER`, `DEFENDER` | Side assignment in combat |
| `ArmyOrderType` | `GUARD`, `ESCORT`, `RAID`, `CAMPAIGN` | Standing order types |
| `ArmyOrderStatus` | `ACTIVE`, `TRANSFERRED`, `RETURNED`, `CANCELED` | Standing order lifecycle |
| `TerritoryCampaignStatus` | `BUILDING`, `SIEGE_WARNING`, `ENGAGED`, `RESOLVED`, `CANCELED` | Campaign siege phases |

### Economy & Recruitment

| Enum | Values | Purpose |
|------|--------|---------|
| `ScoreEventType` | `GROW_TICK`, `ATTACK_SELF`, `ATTACK_TARGET`, `TILE_CLAIM`, `TILE_BATTLE_REWARD`, `BATTLEFIELD_REWARD`, `MEGA_DAMAGE`, `MEGA_DESTROY_BONUS`, `UNICORN_DECOY_DESTROY`, `LOOT_CAMP_REWARD`, `FORTRESS_UPGRADE_PURCHASE`, `FORTRESS_UPGRADE_SLAYER_BONUS`, `FORTRESS_LOCATION_SHUFFLE_COST`, `DWARF_DEEP_MINING_POINTS`, `DWARF_RUNE_BOUNTY`, `RENAME_COST`, `MANUAL_ADJUST`, `TRADE_DELIVERY`, `CONVOY_INTERCEPTION` | All sources of score changes, audited per fortress |
| `CastleUpgradeSpecialization` | `POINTS`, `FOOD`, `MILITARY`, `DEFENSE` | Upgrade focus paths |

### Race System

| Enum | Values | Purpose |
|------|--------|---------|
| `FortressRace` | `DWARFS`, `UNSTABLE_UNICORNS`, `SPACE_MURINES`, `ORKS` | Playable races |
| `FortressDoctrine` | `DWARF_HOLDFAST`, `DWARF_WATCHKEEPERS`, `ORK_MARAUDERS`, `ORK_SIEGEBREAKERS`, `MURINE_CONVOY_COMMAND`, `MURINE_RAPID_RESPONSE`, `UNICORN_GLITTER_FRONTIER`, `UNICORN_VEILED_NETWORK` | Standing doctrines (SEASON_4) |
| `RaceAbilityKind` | ~17 values | Legacy race ability identifiers |
| `OrkBossOrderKind` | `MORE_DAKKA`, `LOOT_WAGONS`, `PATCH_DA_FORT` | ORK boss orders |
| `OrkWaaaghInvestmentKind` | `KEEP_IT_LOUD`, `BIGGER_SHOUTIN`, `DA_GREEN_TIDE` | ORK Waaagh investments |
| `DwarfDeepMiningOutcome` | `RICH_VEIN`, `ORE_SURGE`, `BATTLE_RUNES`, `FACTION_SEAL`, `BURIED_WARBAND`, `CAVE_IN`, `UNSTABLE_TUNNELS`, `SHAFT_COLLAPSE` | Dwarf mining RNG outcomes |
| `UnicornShatteredRealityOutcome` | `MIRROR_HOST`, `PRISMATIC_SURGE`, `LUCKY_GALLOP` | Unicorn RNG outcomes |
| `OrkScrapEventReason` | Enum of sources for scrap income | Audit trail for ORK scrap |

### Diplomacy & Trade

| Enum | Values | Purpose |
|------|--------|---------|
| `DiplomacyRelationStatus` | `NEUTRAL`, `ALLIANCE_PENDING`, `ALLIED`, `ENEMY`, `WAR_PENDING`, `WAR`, `PEACE_PENDING` | Bilateral fortress relations |
| `TradeOfferStatus` | `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELED`, `EXPIRED`, `COMPLETED` | Trade lifecycle |
| `TradeLineItemKind` | `GOLD`, `FOOD`, `ARMY` | What a trade line item moves *(TILE planned but not yet live)* |
| `ConvoyLegStatus` | `IN_TRANSIT`, `DELIVERED`, `SEIZED`, `INTERCEPTED`, `CANCELED` | Convoy leg lifecycle |

### Fortress Types & Map

| Enum | Values | Purpose |
|------|--------|---------|
| `FortressKind` | `PLAYER`, `MEGA`, `UNICORN_DECOY`, `LOOT_CAMP`, `DWARF_RUNE` | Distinguishes NPC/special from player fortresses |
| `LootCampVariant` | `CLASSIC`, `RICH`, `CHAOS` | Legacy loot camp difficulty tiers |

### Misc

| Enum | Values | Purpose |
|------|--------|---------|
| `ChatMessageType` | `TEXT`, `GIF` | Chat message format |
| `ArcadeGameType` | `SLOTS`, `DICE`, `WHEEL` | Arcade mini-games |
| `ArcadeTransactionKind` | `SEASON_PAYOUT`, `GAME_RESULT`, `LOOT_BOX_PURCHASE`, `LOOT_BOX_OPEN`, `LOOT_BOX_DUPLICATE_REFUND` | Arcade coin flow |
| `ArcadeLootBoxType` | `UNIT`, `FORTRESS` | Cosmetic loot box categories |
| `ArcadeCosmeticSlot` | `UNIT`, `FORTRESS` | Where a cosmetic equips |
| `WinnerRequestStatus` | `SUBMITTED`, `NEEDS_SIMPLIFICATION`, `ACCEPTED`, `REJECTED`, `UNDER_ADMIN_REVIEW` | Season winner change request |
| `CommunityWishStatus` | `PROPOSALS_OPEN`, `OPEN`, `RESOLVED`, `TIE_REQUIRES_ADMIN`, `NO_PROPOSALS` | Community vote lifecycle |

---

## 2. Models by Domain

### 2.1 Auth Domain

```
User ──→ Account          (Auth.js — OAuth accounts per user)
  │   ──→ Session          (Auth.js — database sessions)
  │   ──→ Fortress[]       (player's fortresses per cycle)
  │   ──→ ChatMessage[]    (chat messages sent)
  │   ──→ ScoreEvent[]     (score events as actor)
  │   ──→ WinnerRequest[]  (submitted/reviewed change requests)
  │   ──→ CommunityWish*   (proposals, votes, entitlements)
  │   ──→ BuildArcadeRun[]
  │   ──→ ArcadeWallet     (one wallet per user)
  │   ──→ ArcadeTransaction[]
  │   ──→ ArcadeCosmeticUnlock[]
  │   ──→ wonCycles        (Cycle winner relation)
  │   ──→ unitCosmeticVariant, fortressCosmeticVariant (equipped skins)
```

**Key fields on User:**
- `role: UserRole` — `PLAYER` or `ADMIN`
- `lastReadChatAt` — tracks unread chat count
- `cosmeticUnlockedAt` — when the user last got a new cosmetic

VerificationToken and Account/Session follow the Auth.js v5 Prisma adapter shape.

### 2.2 Cycle / Season Domain

```
Cycle ──→ Fortress[]          (all fortresses in this season)
  │    ──→ GameTick[]          (processed minute ticks)
  │    ──→ ScoreEvent[]        (all score events)
  │    ──→ AttackUnit[]        (all attack units in flight)
  │    ──→ Battlefield[]       (all battles)
  │    ──→ MapHexOwnership[]   (tile ownership)
  │    ──→ TilePressurePriority[]
  │    ──→ TilePressureState[]
  │    ──→ DiplomacyRelation[]
  │    ──→ ArmyOrder[]
  │    ──→ TerritoryCampaign[]
  │    ──→ TradeOffer[] + ConvoyLeg[]
  │    ──→ CovertIncident[]
  │    ──→ CastleUpgradeProject[]
  │    ──→ HomeOfAHolder[] + HomeOfABossDamageContribution[]
  │    ──→ UnicornTemporaryTeleport[]
  │    ──→ OrkScrapBank[] + OrkScrapEvent[] + OrkBossOrder[] + OrkWaaaghInvestment[]
  │    ──→ WinnerRequest[] + CommunityWishProposal[] + CommunityWishVoteEntitlement[]
  │    ──→ BuildArcadeRun[] + ArcadeTransaction[]
  │    ──→ FortressGarrison[]
  │    ──→ CycleHistory?    (resolved metadata, one per resolved cycle)
```

**Key state machine across Cycle.status:**

```
REGISTRATION ──→ TESTING ──→ ACTIVE ──→ RESOLUTION
     │              │           │
     └── joining    └── verification   └── gameplay + cron ticks
```

**Key timestamps on Cycle:**
- `registrationStartedAt`, `registrationEndsAt`
- `testingStartedAt`, `testingEndsAt`
- `joiningLockedAt` — when mid-season join closes
- `activeStartedAt`, `activeEndsAt`
- `resolvedAt`
- `homeOfABossRespawnsAt`
- `upgradesUnlockedAt`

**Winner tracking:**
- `winnerId` → User
- `crownedFortressId` → Fortress
- `megaFortressDestroyCount` — used for Home of A HP scaling

### 2.3 Fortress / Economy Domain

```
Fortress
├── identity: name, commanderName, race, doctrine, unitSpriteVariant
├── economy: gold, food, army, recruitmentQueue
├── workers: minersAssigned, farmersAssigned, recruitersAssigned, pressureWorkersAssigned
├── scores: points, unitsKilled, goblinsKilled, resourcesStolen,
│           deliveredCargoValue, interceptedCargoValue
├── map: mapX, mapY, locationShuffleCount
├── stats: level, health, maxHealth, sizeTiles
├── flags: fortressKind, isNpc, currentAction (GROW/ATTACK)
├── timestamps: joinedAt, doctrineChangedAt, commanderNameRegisteredAt
├── relations:
│   ├── owner → User
│   ├── cycle → Cycle
│   ├── targetFortress → Fortress (current attack target)
│   ├── ownedMapHexes → MapHexOwnership[]
│   ├── outboundAttackUnits / inboundAttackUnits → AttackUnit[]
│   ├── diplomacyRelationsA / diplomacyRelationsB → DiplomacyRelation[]
│   ├── armyOrders → ArmyOrder[]
│   ├── sentTradeOffers / receivedTradeOffers → TradeOffer[]
│   ├── outboundConvoyLegs / inboundConvoyLegs → ConvoyLeg[]
│   ├── garrisons → FortressGarrison[]
│   ├── castleUpgradeProjects → CastleUpgradeProject[]
│   ├── raceAbilityActivations → RaceAbilityActivation[]
│   ├── orkScrapBank → OrkScrapBank (one per ORK fortress)
│   ├── dwarfGrudges / grudgedBy → DwarfGrudge[]
│   ├── deepMiningRolls → DwarfDeepMiningRoll[]
│   ├── homeOfAHoldings → HomeOfAHolder[]
│   ├── homeOfABossDamageContributions → HomeOfABossDamageContribution[]
│   ├── unicornTemporaryTeleports → UnicornTemporaryTeleport[]
│   └── battlefieldParticipants → BattlefieldParticipant[]
```

**Unique constraints:**
- `(cycleId, ownerId)` — one fortress per player per season
- `(cycleId, commanderName)` — commander names are unique per season
- `(cycleId, name)` — fortress names are unique per season

### 2.4 Tile / Map Domain

```
MapHexOwnership        TilePressurePriority          TilePressureState
──────────────────     ─────────────────────         ─────────────────
cycleId (FK)           cycleId (FK)                  cycleId (FK)
tileId (string)        fortressId (FK)               tileId (string)
ownerFortressId (FK)   tileId (string)               fortressId (FK)
claimedAt              weight (Int=1)                pressure (Int)
                       createdAt                     lastPressuredAt
@@unique(cycleId,tileId)                              lastDecayedAt
                       @@unique(cycleId,fortressId,tileId)
                       @@unique(cycleId,tileId,fortressId)
```

**Pressure resolution rule (in tick.ts):**
- Claim a neutral tile when one fortress reaches 600 pressure with no tied competitor
- Pressure decays 10% per hour on unsupported legal targets
- Priorities favored before non-prioritized legal border tiles

### 2.5 Combat Domain

```
AttackUnit
├── cycleId (FK), attackerFortressId (FK), targetFortressId (FK)
├── sentArmy, damageProgress, currentMapX, currentMapY
├── speed, startsAt, arrivesAt
├── resolvedAt, cancelledAt
└── status tracking: isReinforcement, arrivalTriggered, impactApplied

Battlefield
├── cycleId (FK), targetFortressId (FK), targetTileId
├── status (ACTIVE/RESOLVED), side (castle/territory)
├── attackerBannerFortressId (FK), defenderBannerFortressId (FK)
├── attackerArmyRemaining, defenderArmyRemaining
├── progress, startedAt (combat start after 1h delay), resolvedAt
├── resolutionData (JSON — loot, casualties, outcome)
├── attackerBattlefieldScore, defenderBattlefieldScore
└── participants → BattlefieldParticipant[]

BattlefieldParticipant
├── battlefieldId (FK), fortressId (FK)
├── side (ATTACKER/DEFENDER)
├── armySent, armyRemaining, armyKilled
└── joinedAt, lastReinforcedAt

FortressGarrison
├── cycleId (FK), fortressId (FK)
├── tileId, army
└── status
```

**Key combat rules enforced in code:**
- Player castle & owned-tile battlefields visible immediately, casualties start after 1h (`startedAt`)
- Battlefield casualties ramp from 100→1000 units/tick after 1h
- Battlefield resolves when one side runs out of army
- Simultaneous outbound attack cap: `2 + level` (Space Murines: `2 + 2*level`)
- Home of A & Dwarf rune battlefields excluded from 1h delay

### 2.6 Diplomacy Domain

```
DiplomacyRelation
├── cycleId (FK), fortressAId (FK), fortressBId (FK)
├── status (NEUTRAL → ALLIANCE_PENDING → ALLIED → ...)
├── allianceProposedById, allianceProposedAt
├── allianceTrustTier (0-3), allianceEscrowGoldEach, allianceEscrowFoodEach
├── trustUpgradeProposedById, trustUpgradeTier
├── warDeclaredById, warDeclaredAt, warStartsAt (24h delay)
├── peaceProposedById, peaceProposedAt
├── betrayedById, betrayedAt
├── casusBelliFortressId, casusBelliExpiresAt
├── collateralGold, collateralFood, collateralArmy
└── @@unique(cycleId, fortressAId, fortressBId)
```

**State machine:**

```
NEUTRAL ──propose──→ ALLIANCE_PENDING ──accept──→ ALLIED
                            │                        │
                            └──reject/cancel──→ NEUTRAL  ├──betray──→ WAR (instant)
                                                         ├──trust_upgrade→ higher tiers
                                                         └──propose_peace──→ PEACE_PENDING

NEUTRAL ──declare_war──→ WAR_PENDING (24h) ──→ WAR
                                                │
                                                └──propose_peace──→ PEACE_PENDING ──accept──→ NEUTRAL
```

### 2.7 Trade Domain

```
TradeOffer
├── senderFortressId (FK), receiverFortressId (FK)
├── status (PENDING→ACCEPTED/REJECTED/CANCELED/EXPIRED/COMPLETED)
├── expiresAt
├── lineItems → TradeLineItem[]
└── convoyLegs → ConvoyLeg[]

TradeLineItem
├── tradeOfferId (FK), fromFortressId (FK), toFortressId (FK)
├── kind (GOLD/FOOD/ARMY)
└── amount (Int)

ConvoyLeg
├── tradeOfferId (FK), fromFortressId (FK), toFortressId (FK)
├── status (IN_TRANSIT→DELIVERED/SEIZED/INTERCEPTED/CANCELED)
├── gold, food, army (cargo)
├── baseCargoValue, pointsAwarded
├── stolenGold, stolenFood, stolenArmy, stolenCargoValue
├── bonusGold, bonusFood (from alliance trust tiers)
├── departedAt, arrivesAt, settledAt
├── escortOrder → ArmyOrder (GUARD/ESCORT)
├── interceptedByOrder → ArmyOrder (RAID)
└── raidDetected, encounterResolvedAt, encounterSucceeded
```

### 2.8 Standing Orders Domain

```
ArmyOrder
├── fortressId (FK), type (GUARD/ESCORT/RAID/CAMPAIGN)
├── status (ACTIVE→TRANSFERRED/RETURNED/CANCELED)
├── targetTileId, targetFortressId
├── convoyLegId (for ESCORT orders)
├── committedArmy, startsAt
├── campaign → TerritoryCampaign (1:1 for CAMPAIGN type)
├── convoyLeg (1:1 for ESCORT type)
├── raidedConvoyLegs (for RAID type)
└── covertIncidents → CovertIncident[]

TerritoryCampaign
├── attackerFortressId (FK), defenderFortressId (FK)
├── targetTileId
├── armyOrderId (FK, unique)
├── battlefieldId (FK, unique, set when siege turns into combat)
├── status (BUILDING→SIEGE_WARNING→ENGAGED→RESOLVED/CANCELED)
├── progress (Int, builds each tick)
├── siegeOpenedAt, responseEndsAt (12h warning)
└── engagedAt, resolvedAt, canceledAt, cancellationReason
```

### 2.9 Race / Ability Domain

```
RaceAbilityActivation       OrkScrapBank             OrkBossOrder
├── fortressId (FK)         ├── fortressId (FK)      ├── fortressId (FK)
├── abilityKind             ├── scrap (Int)          ├── kind
├── activatedAt             └── cycleId              ├── activatedAt
├── cooldownEndsAt                                   └── effectDuration
└── (target/rune fortress)

DwarfGrudge                 DwarfDeepMiningRoll      UnicornShatteredRealityRoll
├── ownerFortressId (FK)    ├── ownerFortressId (FK) ├── fortressId (FK)
├── targetFortressId (FK)   ├── outcome (RNG enum)   ├── outcome (RNG enum)
├── tier                     ├── summary             ├── summary
├── activeAt                 ├── goldDelta            ├── armyDelta
└── bountyPoints             └── foodDelta             └── goldDelta, foodDelta, etc.
```

### 2.10 Arcade / Cosmetic Domain

```
ArcadeWallet              ArcadeTransaction       ArcadeLootBoxPurchase
├── userId (FK, unique)   ├── userId (FK)          ├── userId (FK)
├── coins (Int)           ├── cycleId (FK)         ├── cycleId (FK)
├── totalCoinsGranted     ├── kind (enum)          ├── boxType
└── totalCoinsSpent       ├── coinAmount            └── openedAt, itemId, etc.
                           └── referenceId

ArcadeCosmeticUnlock      BuildArcadeRun
├── userId (FK)           ├── userId (FK)
├── slot (UNIT/FORTRESS)  ├── cycleId (FK)
├── variantId              └── score, duration
└── unlockedAt
```

### 2.11 Audit / History Domain

```
ScoreEvent                GameTick                CycleHistory
├── cycleId (FK)          ├── cycleId (FK)        ├── cycleId (FK, unique)
├── fortressId (FK)       ├── tickNumber (Int)    ├── winnerId (FK)
├── targetFortressId?     ├── processedAt         ├── runnerUpId?
├── type (ScoreEventType) └── tickData (JSON)     └── historyData (JSON)
├── amount (Int)
├── balanceAfter (Int)
└── metadata (JSON)

ChatMessage
├── userId (FK), cycleId (FK), fortressId (FK)
├── type (TEXT/GIF), body, gifUrl
└── createdAt

CovertIncident            WinnerRequest           CommunityWishProposal
├── cycleId (FK)          ├── authorId (FK)        ├── cycleId (FK)
├── convoyLegId (FK)      ├── cycleId (FK)         ├── authorId (FK)
├── raidOrderId (FK)      ├── title, description   ├── title, description
├── raiderFortressId (FK) ├── status (enum)        └── status, voteCount, etc.
├── detectingFortressId   └── reviewerId (FK)
└── detectedAt, casusBelliExpiresAt

CommunityWishVote          CommunityWishVoteEntitlement
├── voterId (FK)           ├── cycleId (FK)
├── proposalId (FK)         ├── userId (FK)
├── weight (Int)            └── votesRemaining
└── votedAt
```

---

## 3. Index Strategy Highlights

The schema defines targeted indexes for query performance:

| Index Pattern | Purpose |
|---------------|---------|
| `@@index([status])` on Cycle | Filter active/registration cycles |
| `@@index([cycleId, status, ...])` on multiple models | Scoped queries within a cycle |
| `@@index([cycleId, ownerId])` unique on Fortress | One fortress per player per cycle |
| `@@index([cycleId, tileId])` unique on MapHexOwnership | One owner per tile per cycle |
| `@@index([cycleId, fortressAId, fortressBId])` unique on DiplomacyRelation | Canonical pair ordering |
| `@@index([updatedAt])` on Cycle, Fortress | Realtime watcher polling for changes |
| `@@index([cycleId, status, arrivesAt])` on ConvoyLeg | Tick processing due deliveries |
| `@@index([cycleId, status, encounterResolvedAt, arrivesAt])` on ConvoyLeg | Raid encounter resolution |

---

## 4. Relationship Map (High-Level)

```
User ──1:N── Fortress ──N:1── Cycle
                         │
                  ┌──────┼──────────┐
                  │      │          │
            MapHexOwnership  AttackUnit  Battlefield
                  │      │          │
                  │  TilePressureState  BattlefieldParticipant
                  │      │
            DiplomacyRelation──TradeOffer──ConvoyLeg──CovertIncident
                  │                     │
              ArmyOrder──TerritoryCampaign
                  │
            FortressGarrison
```

---

## 5. Key Design Decisions in Schema

1. **Canonical pair ordering**: DiplomacyRelation stores `fortressAId < fortressBId` to prevent duplicate A/B and B/A rows
2. **No cascade delete on winners**: Cycle sets `winnerId` to `SetNull` on User delete, not Cascade
3. **JSON metadata fields**: ScoreEvent, GameTick, CycleHistory use JSON for flexible audit data without schema migrations
4. **One ArcadeWallet per user**: Unconstrained — created on first arcade interaction
5. **Chunked session cookies**: Socket.IO auth in `server.mjs` handles chunked `authjs.session-token.N` cookies for large sessions
6. **Fortress.recruitmentQueue**: Single Int column rather than separate RecruitmentOrder table — simplifies tick processing at the cost of audit history
