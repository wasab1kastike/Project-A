# Diplomacy

> Alliances, war, peace, and trust. How fortresses interact.

---

## Relations

Every pair of fortresses has a diplomatic status:

| Status | What It Means |
|--------|---------------|
| **NEUTRAL** | Default. No obligations, no restrictions. |
| **ALLIANCE_PENDING** | Alliance proposed, waiting for acceptance. |
| **ALLIED** | Full alliance. Trust tiers, shared battlefields, convoy bonuses. |
| **WAR_PENDING** | War declared, 24-hour countdown. |
| **WAR** | Active hostilities. Attacks allowed, convoys vulnerable. |
| **PEACE_PENDING** | Peace proposed, waiting for acceptance. |
| **ENEMY** | Special — used for NPC enemies (loot camps, Home of A). |

---

## Alliances

### Proposing an Alliance

1. Send an alliance proposal to any neutral fortress
2. Recipient can **accept** or **reject**
3. Accepted → `ALLIED` status

### Trust Tiers

Allies can upgrade trust (0 → 1 → 2 → 3):

| Tier | Cargo Bonus | Escrow Pool | Upgrade Cost |
|------|-------------|-------------|-------------|
| 1 | +10% | 500g / 500f | 500g each |
| 2 | +20% | 1,500g / 1,500f | 1,500g each |
| 3 | +35% | 3,000g / 3,000f | 3,000g each |

Trust upgrades require both allies to contribute. Escrow pools are shared — either ally can draw from them in emergencies.

### Betrayal

An ally can **betray** at any time. Betrayal:
- Immediately sets status to `WAR`
- No 24-hour warning
- Betrayer loses all trust tier bonuses
- Betrayed ally keeps their escrow pool
- Betrayal is marked on the betrayer's record

---

## War

### Declaring War

1. Declare war on a neutral or allied fortress
2. **24-hour warning** period (`WAR_PENDING`)
3. After 24h → `WAR` — attacks enabled

### Casus Belli

Some actions grant a **casus belli** — a justified reason for war that skips the 24h delay:
- Enemy raid detected on your convoy
- Covert incident traced to the target
- Alliance betrayal (automatic war)

### During War

- Attacks allowed without restriction
- Trade offers cannot be sent between warring parties
- Existing convoys can be raided
- Battlefields form normally

### Peace

Either side can propose peace. If accepted → `NEUTRAL`. Peace resets all war timers and casus belli.

---

## Diplomacy Map

```
                       ┌─ reject/cancel → NEUTRAL
NEUTRAL ──propose──→ ALLIANCE_PENDING
                       └─ accept ──→ ALLIED
                                       ├── betray → WAR (instant)
                                       ├── upgrade_trust → higher tiers
                                       └── propose_peace → PEACE_PENDING

NEUTRAL ──declare_war──→ WAR_PENDING (24h) ──→ WAR
                                                 │
                                                 └── propose_peace → PEACE_PENDING ──accept──→ NEUTRAL
```

---

## Diplomatic Limits

- Maximum **5 active alliances** per fortress
- Alliance proposals expire after 24 hours
- War declarations cannot be canceled once made
- You cannot attack allies, even in shared battlefields
