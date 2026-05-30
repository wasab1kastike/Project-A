# Trade

> Send resources across the map. Convoy legs, escorts, and raids.

---

## Trade Offers

1. Create a trade offer — choose goods and recipient
2. Line items: **Gold**, **Food**, or **Army** — any combination
3. Recipient accepts → convoy legs spawn
4. Convoy travels across the map → cargo delivered → points awarded

### Trade Restrictions

- Cannot trade with enemies or warring fortresses
- Trade offers expire after a set time (longer for Space Murines)
- Sender pays the resources upfront — they're held in the convoy
- Canceling an in-transit convoy returns remaining cargo to sender

---

## Convoy Legs

Each trade line item creates one convoy leg:

| Status | Meaning |
|--------|---------|
| **IN_TRANSIT** | Convoy is traveling between fortresses |
| **DELIVERED** | Cargo arrived safely — recipient gets resources, sender gets points |
| **SEIZED** | Raider intercepted and stole the cargo |
| **INTERCEPTED** | Raider destroyed the convoy — cargo lost |
| **CANCELED** | Convoy canceled before completion |

### Transit Time

```
transitTime = distance × baseSpeed × raceBonus × networkBonus
```

- **Base speed**: 1 tile per tick (60s/tile)
- **Space Murines**: 15% faster baseline
- **Convoy Network**: up to 40% faster with 9+ active legs

### Cargo Value & Points

Points are awarded to the **sender** on delivery:
```
points = cargoValue × allianceTrustBonus × convoyNetworkBonus
```

---

## Escorts

Use the **ESCORT** standing order to protect a convoy leg:

1. Assign an escort order to a specific convoy leg
2. Committed army travels alongside the convoy
3. If raiders intercept, escort strength determines outcome

### Escort Strength

```
escortStrength = escortArmy / (escortArmy + raiderArmy)
                 + allianceTrustBonus
                 + convoyNetworkEscortBonus
```

Higher escort strength = better chance to repel raiders.

---

## Raids

Use the **RAID** standing order to intercept enemy convoys:

1. Target a tile where enemy convoys pass through
2. Committed army waits in ambush
3. When a convoy leg enters the tile → encounter triggered

### Raid Outcomes

| Outcome | What Happens |
|---------|-------------|
| **Raid succeeds** | Raider steals cargo. Convoy status → `SEIZED`. Raider gets points + loot. |
| **Escort wins** | Convoy continues. Raider army damaged. Convoy status unchanged. |
| **No escort** | Automatic raid success. Free cargo! |

### Raid Detection

Raided convoys generate a **Covert Incident**. If traced back to the raider, the victim gets a casus belli for instant war.

---

## Alliance Trade Bonuses

Allied trade gets better with trust tiers:

| Trust Tier | Cargo Bonus | Convoy Speed | Escrow Access |
|------------|-------------|-------------|---------------|
| 0 (new ally) | — | — | — |
| 1 | +10% cargo value | — | 500g / 500f shared pool |
| 2 | +20% cargo value | +5% speed | 1,500g / 1,500f |
| 3 | +35% cargo value | +10% speed | 3,000g / 3,000f |

Escrow pools can be drawn by either ally to fund emergency recruitment or upgrades.

---

## Space Murine Trade

Space Murines are the trade specialists:

- **+15% baseline convoy speed** — always faster
- **+1 hour trade offer expiry extension** — more time to negotiate
- **Convoy Network** — speed, cargo, and escort bonuses scale with active legs (1-10 legs)
