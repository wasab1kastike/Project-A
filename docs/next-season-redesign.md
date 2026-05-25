# Next Season Redesign: Pressure, Politics, and Trade

## Product Goal

Project-A should move from a highly active attack-management game toward a slower idle strategy game. Players should make meaningful plans, assign workers, set diplomatic posture, negotiate trades, and check back later to see how pressure, treaties, and border conflicts developed.

The map remains the main experience, but the primary player verbs change:

- assign workers to economy, recruitment, and pressure
- prioritize nearby tiles for expansion
- manage relations with nearby players
- negotiate resource, army, and tile trades
- commit to war deliberately instead of attacking any target at any time

This document describes the next-season target design. It should not change current-season rules until the redesign is implemented behind migrations and season-bound rollout controls.

## Core Loop

1. Player assigns workers across miners, farmers, recruiters, and pressure.
2. Player marks desired border tiles as expansion priorities.
3. Each tick generates race-flavored pressure from assigned pressure workers.
4. Pressure accumulates on legal border tiles and competes with pressure from other fortresses.
5. Tiles are claimed automatically when a fortress has enough uncontested pressure.
6. Politics determines who can pressure, attack, trade, ally, or go to war.
7. Trading lets players reshape resources, armies, and peaceful borders without constant combat.
8. Combat becomes a deliberate border and war tool, not the default way to interact.

## Pressure-Based Expansion

### Worker Assignment

Add one new persisted worker assignment field on `Fortress`:

- `pressureWorkersAssigned Int @default(0)`

This is one internal mechanic with race-specific presentation:

- Dwarfs: Beer Culture
- ORKS: Scavenge Mob
- Space Murines: Imperial Faith
- Unstable Unicorns: Glitter Distribution

Existing worker validation must include pressure workers in the population cap:

```text
miners + farmers + recruiters + pressureWorkers <= fortress population
```

### Pressure Output

Add a pure rule helper that takes fortress race, pressure workers, tile target, and modifiers, and returns pressure generated for a tick.

Initial baseline:

- each pressure worker produces 1 pressure per tick
- race modifiers may adjust output later, but v1 should keep equal numeric output for balance readability
- race identity is mostly presentation until explicit race bonuses are designed

Recommended future race hooks:

- Dwarfs: stronger pressure on mountain or high-value resource tiles
- ORKS: bonus pressure on tiles adjacent to enemy-owned tiles
- Space Murines: bonus pressure during declared war or against enemies
- Unstable Unicorns: occasional pressure spillover or masking

### Tile Priorities

Add a model for player intent:

```prisma
model TilePressurePriority {
  id         String   @id @default(cuid())
  cycleId    String
  fortressId String
  tileId     String
  weight     Int      @default(1)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  cycle    Cycle    @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  fortress Fortress @relation(fields: [fortressId], references: [id], onDelete: Cascade)

  @@unique([cycleId, fortressId, tileId])
  @@index([cycleId, fortressId])
  @@index([cycleId, tileId])
}
```

Rules:

- priorities are allowed only for legal pressure targets
- priority weight starts as `1`
- a player may mark multiple tiles
- the pressure allocator favors priorities before non-prioritized legal border tiles
- if all priorities are illegal, pressure falls back to legal border candidates or remains unused

### Pressure State

Add a model for accumulated pressure:

```prisma
model TilePressureState {
  id              String   @id @default(cuid())
  cycleId         String
  tileId          String
  fortressId      String
  pressure        Int      @default(0)
  lastPressuredAt DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  cycle    Cycle    @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  fortress Fortress @relation(fields: [fortressId], references: [id], onDelete: Cascade)

  @@unique([cycleId, tileId, fortressId])
  @@index([cycleId, tileId])
  @@index([cycleId, fortressId])
}
```

Resolution rules:

- a neutral tile is claimed when one fortress reaches the tile threshold and has no tied competitor at or above threshold
- an owned tile can become contested by pressure, but ownership should not flip from pressure alone in the first version unless explicitly enabled
- if multiple fortresses pressure the same neutral tile, the highest pressure leads
- ties do not resolve until broken by later pressure
- pressure on illegal targets is ignored, and unsupported legal pressure decays by `10%` per completed hour

Initial threshold:

- base claim threshold: `600`, approximately one hour with ten focused pressure workers
- tile value modifier can be added later, but the first implementation should keep one threshold unless playtesting proves it too flat

### Legal Pressure Targets

A tile is a legal pressure target if:

- it is a normal map tile
- it is not Home of A
- it is not a special objective that forbids ownership transfer
- it is adjacent to the fortress home tile or any tile currently owned by the fortress
- it is not owned by an ally
- it is not protected by an active treaty
- it does not violate a hard relation rule

## Border-Limited Combat

Combat targeting should use one shared legality helper, not scattered UI and service checks.

Add a `combat-targeting` rule module with:

- `getLegalAttackTargets`
- `canAttackTile`
- `canAttackFortress`
- `getAttackBlockedReason`

Rules:

- normal attacks require an active border
- active border means the target tile is adjacent to owned territory or the attacker fortress tile
- enemy-owned border tiles can be attacked only if politics allows hostility
- neutral contested pressure tiles can be attacked only if the combat redesign explicitly supports that tile state
- direct fortress attacks should be rare or disabled unless the defender is reachable through border rules
- Home of A remains a special exception

Politics gate:

- allies cannot attack each other unless betrayal is explicitly invoked
- neutral players cannot be freely attacked except through limited border pressure rules
- declared war unlocks full border attacks after the war timer completes
- instant war/betrayal unlocks attacks immediately only after treaty collateral is paid or forfeited

## Politics System

### Relation States

Add relation records between fortress pairs:

```prisma
enum DiplomacyRelationStatus {
  NEUTRAL
  ALLIED
  ENEMY
  WAR_PENDING
  WAR
  PEACE_PENDING
}

model DiplomacyRelation {
  id                    String                   @id @default(cuid())
  cycleId               String
  fortressAId           String
  fortressBId           String
  status                DiplomacyRelationStatus  @default(NEUTRAL)
  warDeclaredById        String?
  warDeclaredAt          DateTime?
  warStartsAt            DateTime?
  peaceProposedById      String?
  peaceProposedAt        DateTime?
  collateralGold         Int                      @default(0)
  collateralFood         Int                      @default(0)
  collateralArmy         Int                      @default(0)
  createdAt             DateTime                 @default(now())
  updatedAt             DateTime                 @updatedAt

  cycle     Cycle    @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  fortressA Fortress @relation("DiplomacyRelationFortressA", fields: [fortressAId], references: [id], onDelete: Cascade)
  fortressB Fortress @relation("DiplomacyRelationFortressB", fields: [fortressBId], references: [id], onDelete: Cascade)

  @@unique([cycleId, fortressAId, fortressBId])
  @@index([cycleId, status])
  @@index([fortressAId])
  @@index([fortressBId])
}
```

Implementation detail:

- store each pair in canonical fortress id order
- expose helpers that accept either fortress order
- never create duplicate A/B and B/A rows

### Treaty Collateral

Treaty-defined collateral is the default betrayal penalty.

Rules:

- alliances and peace treaties may define collateral terms
- collateral is agreed by both parties before the treaty becomes active
- instant war or treaty-breaking forfeits collateral to the harmed party
- if collateral cannot be paid, the betrayal action is rejected unless a future design allows reputation debt
- collateral can include gold, food, and army in v1
- tile collateral should wait until tile trading is stable

### War and Peace

War declaration:

- normal war starts after 24 hours
- `WAR_PENDING` blocks surprise full attacks until `warStartsAt`
- once `warStartsAt <= now`, tick or read-time normalization may treat the relation as `WAR`

Instant war:

- allowed only through explicit betrayal action
- immediately changes relation to `WAR`
- applies treaty collateral
- creates a visible system event or history item

Peace:

- one party proposes peace, setting `PEACE_PENDING`
- both parties must agree before relation returns to `NEUTRAL` or `ALLIED`
- optional gold cost can be added later, but v1 should rely on negotiated collateral and mutual consent

## Trading

### Trade Offers

Add trade offers with line items:

```prisma
enum TradeOfferStatus {
  PENDING
  ACCEPTED
  REJECTED
  CANCELED
  EXPIRED
}

enum TradeLineItemKind {
  GOLD
  FOOD
  ARMY
  TILE
}

model TradeOffer {
  id                 String           @id @default(cuid())
  cycleId            String
  senderFortressId   String
  receiverFortressId String
  status             TradeOfferStatus @default(PENDING)
  message            String?          @db.Text
  expiresAt          DateTime?
  acceptedAt         DateTime?
  rejectedAt         DateTime?
  canceledAt         DateTime?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  cycle            Cycle           @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  senderFortress   Fortress        @relation("TradeOfferSender", fields: [senderFortressId], references: [id], onDelete: Cascade)
  receiverFortress Fortress        @relation("TradeOfferReceiver", fields: [receiverFortressId], references: [id], onDelete: Cascade)
  lineItems        TradeLineItem[]

  @@index([cycleId, status])
  @@index([senderFortressId, status])
  @@index([receiverFortressId, status])
}

model TradeLineItem {
  id            String            @id @default(cuid())
  tradeOfferId  String
  fromFortressId String
  toFortressId   String
  kind          TradeLineItemKind
  amount        Int?
  tileId        String?
  createdAt     DateTime          @default(now())

  tradeOffer TradeOffer @relation(fields: [tradeOfferId], references: [id], onDelete: Cascade)

  @@index([tradeOfferId])
  @@index([fromFortressId])
  @@index([toFortressId])
}
```

Validation:

- sender and receiver must be in the same active cycle
- trading requires a diplomacy relation that allows trade
- war blocks trade
- neutral trade is blocked unless future rules explicitly allow it
- pending offers validate affordability when created and again when accepted
- accepted offers transfer resources atomically
- army trades move active army instantly in v1 unless later design chooses travel time

### Tile Trading

Tile trade rules:

- allowed only during peace or alliance
- receiver must legally connect the tile after transfer
- sender must currently own the tile
- tile must be a normal tile
- Home of A, fortress home tiles, temporary objectives, and special generated tiles are excluded by default
- tile cannot have an active unresolved battlefield
- tile cannot be part of another pending trade

Connectivity rule:

- after removing the tile from sender and adding it to receiver, receiver must have adjacency to its home tile or owned territory
- sender should not be split into disconnected territory unless a future design intentionally allows enclaves

## UI Surfaces

The map stays primary. Add compact panels rather than a new landing-page style flow.

Home/map surface:

- tile priority controls on tile inspection
- pressure preview and claim ETA
- border legality indicators
- relation badge for tile owner

Politics window:

- relation list by fortress
- ally/enemy/neutral status
- war pending timers
- peace requests
- treaty collateral terms
- betrayal warning before instant war

Trading window:

- incoming offers
- outgoing offers
- create offer form for gold, food, army, and legal tiles
- clear disabled reasons when trade is blocked by politics or connectivity

Castle management:

- add pressure worker assignment beside miners, farmers, and recruiters
- label the assignment by race flavor

## Implementation Sequence

1. Add pure rule modules and tests without schema changes:
   - pressure worker labels and output
   - border target legality
   - diplomacy permission matrix
   - trade validation helpers
2. Add Prisma schema and migrations:
   - pressure workers on fortress
   - tile priorities and pressure state
   - diplomacy relations
   - trade offers and line items
3. Add service actions:
   - set tile priority
   - clear tile priority
   - propose relation change
   - declare war
   - betray treaty
   - propose/accept peace
   - create/accept/reject/cancel trade
4. Add tick processing:
   - generate pressure
   - allocate pressure to legal priorities
   - resolve neutral claims
   - normalize pending war timers
   - expire stale trade offers
5. Update read models and UI:
   - pressure state on map tiles
   - politics window
   - trading window
   - pressure worker assignment
6. Disable or replace current manual claim and broad attack flows at season boundary.

## Test Matrix

Pure tests:

- pressure worker labels are race-specific
- pressure output is deterministic
- worker assignment validation includes pressure workers
- legal pressure targets require border adjacency
- allies block pressure and attacks
- war pending blocks full attacks until 24 hours
- instant betrayal applies collateral
- peace requires both parties
- trade requires allowed diplomacy
- tile trade requires receiver connectivity
- tile trade rejects Home of A and special tiles

Integration tests:

- tick accumulates pressure on prioritized border tiles
- automatic neutral claim creates `MapHexOwnership`
- contested pressure tie does not resolve
- higher pressure wins after tie breaks
- war starts after `warStartsAt`
- instant betrayal changes relation and transfers collateral
- accepted resource trade transfers gold, food, and army atomically
- accepted tile trade transfers ownership and preserves connectivity
- attacks are rejected outside legal borders
- Home of A remains attackable through its special center-tile rule

Verification commands:

```bash
npm run test:game --workspace web
npm run typecheck --workspace web
npm run build --workspace web
```

## Open Design Questions

- Should pressure on enemy-owned tiles weaken defenses, create claims, or only unlock combat?
- Should army trades be instant, delayed, or require visible transport?
- Should alliances have global shared visibility or only relation-specific permissions?
- Should betrayal collateral be escrowed up front or checked at betrayal time?
- Should race pressure bonuses launch in v1 or wait until the base system is proven?
