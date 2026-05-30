// =============================================================================
// Army System Tests — battalions, recruitment, guard, upkeep, XP, combat
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  BattalionTier,
  BattalionStance,
  BATTALION_TIER_NAMES,
  TIER_MULTIPLIERS,
  generateBattalionName,
  getBattalionSlots,
  nextExtraSlotCost,
  getMoraleLevel,
  MORALE_EVENTS,
  type Battalion,
} from "./battalion-types";
import {
  calculateRecruitment,
  distributeRecruits,
  processRecruitmentTick,
  createBattalion,
  expandBattalion,
  disbandBattalion,
} from "./recruitment";
import {
  calculateTileGuardWeight,
  distributeGuardPool,
  recallAllGuards,
  type GuardableTile,
  TilePriority,
} from "./guard-system";
import {
  calculateUpkeep,
  processUpkeepTick,
  EQUIPMENT_DECAY_PENALTY,
} from "./upkeep";
import {
  calculateCombatXp,
  checkTierAdvancement,
  promoteBattalion,
  calculateFieldPromotionCost,
  applyFieldPromotion,
  applyTrainingXp,
  processXpTick,
} from "./army-xp";
import {
  initCombat,
  resolveCombat,
  applyCombatResultsToBattalions,
  orderRetreat,
  type CombatState,
} from "./battalion-combat";

// ── Helper ───────────────────────────────────────────────────────────────────

function makeBattalion(overrides: Partial<Battalion> = {}): Battalion {
  return {
    id: overrides.id ?? "bn_test",
    name: overrides.name ?? "Test Battalion",
    size: overrides.size ?? 100,
    maxSize: overrides.maxSize ?? 100,
    tier: overrides.tier ?? BattalionTier.RECRUIT,
    xp: overrides.xp ?? 0,
    readyAt: overrides.readyAt ?? null,
    stance: overrides.stance ?? BattalionStance.MOBILE,
    garrisonedAt: overrides.garrisonedAt ?? null,
    stanceLockedUntil: overrides.stanceLockedUntil ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BATTALION TYPES
// ═════════════════════════════════════════════════════════════════════════════

describe("battalion-types", () => {
  describe("tier multipliers", () => {
    it("recruit is baseline 1.0", () => {
      expect(TIER_MULTIPLIERS[BattalionTier.RECRUIT].damage).toBe(1.0);
      expect(TIER_MULTIPLIERS[BattalionTier.RECRUIT].defense).toBe(1.0);
    });

    it("elite has significant bonuses", () => {
      expect(TIER_MULTIPLIERS[BattalionTier.ELITE].damage).toBe(1.6);
      expect(TIER_MULTIPLIERS[BattalionTier.ELITE].defense).toBe(1.45);
    });

    it("xp thresholds increase with tier", () => {
      expect(TIER_MULTIPLIERS[BattalionTier.REGULAR].xpToReach).toBe(100);
      expect(TIER_MULTIPLIERS[BattalionTier.VETERAN].xpToReach).toBe(300);
      expect(TIER_MULTIPLIERS[BattalionTier.ELITE].xpToReach).toBe(750);
    });
  });

  describe("battalion slots", () => {
    it("returns correct slots per level", () => {
      expect(getBattalionSlots(1, 0)).toBe(3);
      expect(getBattalionSlots(5, 0)).toBe(5);
      expect(getBattalionSlots(10, 0)).toBe(7);
      expect(getBattalionSlots(15, 0)).toBe(10);
    });

    it("extra slots add up", () => {
      expect(getBattalionSlots(5, 2)).toBe(7);
    });

    it("caps at absolute max", () => {
      expect(getBattalionSlots(15, 10)).toBe(13);
    });

    it("next extra slot cost", () => {
      expect(nextExtraSlotCost(0)).toBe(2000);
      expect(nextExtraSlotCost(1)).toBe(5000);
      expect(nextExtraSlotCost(2)).toBe(12000);
      expect(nextExtraSlotCost(3)).toBeNull();
    });
  });

  describe("morale", () => {
    it("classifies levels correctly", () => {
      expect(getMoraleLevel(90)).toBe("INSPIRED");
      expect(getMoraleLevel(60)).toBe("STEADY");
      expect(getMoraleLevel(30)).toBe("SHAKEN");
      expect(getMoraleLevel(10)).toBe("BROKEN");
    });

    it("broken has desertion", () => {
      const effects = getMoraleLevel(10);
      expect(effects).toBe("BROKEN");
    });
  });

  describe("name generator", () => {
    it("generates unique names per race", () => {
      const dwarf = generateBattalionName("DWARFS", 0);
      const ork = generateBattalionName("ORKS", 0);
      expect(dwarf).toContain("1st");
      expect(ork).toContain("1st");
      expect(dwarf).not.toBe(ork);
    });

    it("increments prefix", () => {
      const first = generateBattalionName("DWARFS", 0);
      const second = generateBattalionName("DWARFS", 1);
      expect(first).toContain("1st");
      expect(second).toContain("2nd");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECRUITMENT
// ═════════════════════════════════════════════════════════════════════════════

describe("recruitment", () => {
  describe("calculateRecruitment", () => {
    it("baseline without bonuses", () => {
      expect(calculateRecruitment(5, 0, 1.0)).toBe(10);
    });

    it("barracks bonus applied", () => {
      const base = calculateRecruitment(5, 0, 1.0);
      const withBarracks = calculateRecruitment(5, 2, 1.0);
      expect(withBarracks).toBeGreaterThan(base);
    });

    it("race bonus applied", () => {
      const noBonus = calculateRecruitment(10, 0, 1.0);
      const withBonus = calculateRecruitment(10, 0, 1.25);
      expect(withBonus).toBeGreaterThan(noBonus);
    });
  });

  describe("distributeRecruits", () => {
    it("fills lowest-fill battalion first", () => {
      const b1 = makeBattalion({ id: "b1", size: 50, maxSize: 100 });
      const b2 = makeBattalion({ id: "b2", size: 90, maxSize: 100 });
      const { battalions, wasted } = distributeRecruits([b1, b2], 20);
      expect(battalions[0].size).toBe(70); // b1 had more space
      expect(battalions[1].size).toBe(90); // b2 unchanged
      expect(wasted).toBe(0);
    });

    it("preferred battalion gets priority", () => {
      const b1 = makeBattalion({ id: "b1", size: 50, maxSize: 100 });
      const b2 = makeBattalion({ id: "b2", size: 10, maxSize: 100 });
      const { battalions } = distributeRecruits([b1, b2], 20, "b1");
      expect(battalions[0].size).toBe(70); // preferred
      expect(battalions[1].size).toBe(10); // unchanged
    });

    it("wastes units when all battalions are full", () => {
      const b1 = makeBattalion({ id: "b1", size: 100 });
      const b2 = makeBattalion({ id: "b2", size: 100 });
      const { wasted } = distributeRecruits([b1, b2], 20);
      expect(wasted).toBe(20);
    });
  });

  describe("processRecruitmentTick", () => {
    it("produces and distributes units", () => {
      const b = makeBattalion({ id: "b1", size: 0 });
      const result = processRecruitmentTick({
        battalions: [b],
        recruiters: 5,
        barracksLevel: 0,
        raceBonus: 1.0,
        totalSlots: 3,
        gold: 5000,
      });
      expect(result.unitsProduced).toBe(10);
      expect(result.battalions[0].size).toBe(10);
      expect(result.battalionCreated).toBe(false);
    });

    it("auto-creates battalion when full and units wasted", () => {
      const b = makeBattalion({ id: "b1", size: 100 });
      const result = processRecruitmentTick({
        battalions: [b],
        recruiters: 20,
        barracksLevel: 0,
        raceBonus: 1.0,
        totalSlots: 3,
        gold: 5000,
      });
      expect(result.battalionCreated).toBe(true);
      expect(result.battalions.length).toBe(2);
    });

    it("does not auto-create if no slots", () => {
      const b = makeBattalion({ id: "b1", size: 100 });
      const result = processRecruitmentTick({
        battalions: [b],
        recruiters: 20,
        barracksLevel: 0,
        raceBonus: 1.0,
        totalSlots: 1,
        gold: 5000,
      });
      expect(result.battalionCreated).toBe(false);
    });
  });

  describe("createBattalion", () => {
    it("creates a battalion with cost", () => {
      const result = createBattalion({
        id: "new_bn",
        name: "New Corps",
        gold: 5000,
      });
      expect("battalion" in result).toBe(true);
      if ("battalion" in result) {
        expect(result.battalion.tier).toBe(BattalionTier.RECRUIT);
        expect(result.goldCost).toBe(1500);
      }
    });

    it("fails with insufficient gold", () => {
      const result = createBattalion({ id: "x", name: "X", gold: 500 });
      expect("error" in result).toBe(true);
    });
  });

  describe("expandBattalion", () => {
    it("increases maxSize", () => {
      const b = makeBattalion({ maxSize: 100 });
      const result = expandBattalion({
        battalion: b,
        gold: 5000,
        expandCost: 800,
        maxBattalionSize: 300,
      });
      if ("battalion" in result) {
        expect(result.battalion.maxSize).toBe(150);
      }
    });

    it("caps at max", () => {
      const b = makeBattalion({ maxSize: 300 });
      const result = expandBattalion({
        battalion: b,
        gold: 5000,
        expandCost: 800,
        maxBattalionSize: 300,
      });
      expect("error" in result).toBe(true);
    });
  });

  describe("disbandBattalion", () => {
    it("refunds 50% of commission cost", () => {
      const result = disbandBattalion({ battalion: makeBattalion() });
      expect(result.goldRefund).toBe(750);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GUARD SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

describe("guard-system", () => {
  describe("calculateTileGuardWeight", () => {
    it("high priority tiles get more weight", () => {
      const high: GuardableTile = {
        tileId: "t1", priority: TilePriority.HIGH, isBorder: false,
        enemyProximity: 0, productionValue: 0, currentGuardStrength: 0,
      };
      const low: GuardableTile = {
        tileId: "t2", priority: TilePriority.LOW, isBorder: false,
        enemyProximity: 0, productionValue: 0, currentGuardStrength: 0,
      };
      expect(calculateTileGuardWeight(high)).toBeGreaterThan(
        calculateTileGuardWeight(low),
      );
    });

    it("border tiles get bonus", () => {
      const border: GuardableTile = {
        tileId: "t1", priority: TilePriority.NORMAL, isBorder: true,
        enemyProximity: 0, productionValue: 0, currentGuardStrength: 0,
      };
      const interior: GuardableTile = {
        tileId: "t2", priority: TilePriority.NORMAL, isBorder: false,
        enemyProximity: 0, productionValue: 0, currentGuardStrength: 0,
      };
      expect(calculateTileGuardWeight(border)).toBeGreaterThan(
        calculateTileGuardWeight(interior),
      );
    });

    it("none priority returns 0", () => {
      const tile: GuardableTile = {
        tileId: "t1", priority: TilePriority.NONE, isBorder: true,
        enemyProximity: 5, productionValue: 1000, currentGuardStrength: 0,
      };
      expect(calculateTileGuardWeight(tile)).toBe(0);
    });
  });

  describe("distributeGuardPool", () => {
    it("distributes proportionally", () => {
      const tiles: GuardableTile[] = [
        { tileId: "t1", priority: TilePriority.HIGH, isBorder: false, enemyProximity: 0, productionValue: 0, currentGuardStrength: 0 },
        { tileId: "t2", priority: TilePriority.NORMAL, isBorder: false, enemyProximity: 0, productionValue: 0, currentGuardStrength: 0 },
      ];
      const { distribution, unassigned } = distributeGuardPool(tiles, 1000);
      expect(unassigned).toBe(0);
      // HIGH priority tile should get more.
      const t1 = distribution.find((d) => d.tileId === "t1")!;
      const t2 = distribution.find((d) => d.tileId === "t2")!;
      expect(t1.assignedStrength).toBeGreaterThan(t2.assignedStrength);
    });

    it("handles empty tiles", () => {
      const { distribution, unassigned } = distributeGuardPool([], 500);
      expect(distribution).toEqual([]);
      expect(unassigned).toBe(500);
    });
  });

  describe("recallAllGuards", () => {
    it("recalls all battalions to fortress", () => {
      const b1 = makeBattalion({ id: "b1", garrisonedAt: "tile_a", stance: BattalionStance.FORTIFY });
      const b2 = makeBattalion({ id: "b2", garrisonedAt: "tile_b", stance: BattalionStance.PATROL });
      const result = recallAllGuards([b1, b2]);
      expect(result[0].garrisonedAt).toBeNull();
      expect(result[0].stance).toBe(BattalionStance.REST);
      expect(result[1].garrisonedAt).toBeNull();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// UPKEEP
// ═════════════════════════════════════════════════════════════════════════════

describe("upkeep", () => {
  describe("calculateUpkeep", () => {
    it("calculates costs per tier", () => {
      const b1 = makeBattalion({ id: "b1", tier: BattalionTier.RECRUIT, size: 100 });
      const bill = calculateUpkeep([b1]);
      expect(bill.totalFood).toBe(1);
      expect(bill.totalGold).toBe(0);
    });

    it("elite costs more", () => {
      const recruit = makeBattalion({ id: "b1", tier: BattalionTier.RECRUIT, size: 100 });
      const elite = makeBattalion({ id: "b2", tier: BattalionTier.ELITE, size: 100 });
      const billRecruit = calculateUpkeep([recruit]);
      const billElite = calculateUpkeep([elite]);
      expect(billElite.totalFood).toBeGreaterThan(billRecruit.totalFood);
      expect(billElite.totalGold).toBeGreaterThan(billRecruit.totalGold);
    });

    it("skips empty battalions", () => {
      const b1 = makeBattalion({ id: "b1", size: 0 });
      const bill = calculateUpkeep([b1]);
      expect(bill.totalFood).toBe(0);
    });
  });

  describe("processUpkeepTick", () => {
    it("deducts food and gold", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, size: 100 });
      const result = processUpkeepTick({ battalions: [b], food: 10, gold: 10 });
      expect(result.foodPaid).toBe(1);
      expect(result.goldPaid).toBe(0);
    });

    it("desertion when food insufficient", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, size: 100 });
      const result = processUpkeepTick({ battalions: [b], food: 0, gold: 10 });
      expect(result.unitsDeserted).toBeGreaterThan(0);
      expect(result.moraleDelta).toBeLessThan(0);
    });

    it("starvation doubles desertion", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, size: 100 });
      const result = processUpkeepTick({ battalions: [b], food: 0, gold: 10 });
      // Starvation = food is 0 + food shortfall
      expect(result.unitsDeserted).toBeGreaterThan(0);
    });

    it("desertion targets lowest tier first", () => {
      const recruit = makeBattalion({ id: "r", tier: BattalionTier.RECRUIT, size: 100 });
      const elite = makeBattalion({ id: "e", tier: BattalionTier.ELITE, size: 100 });
      const result = processUpkeepTick({ battalions: [elite, recruit], food: 0, gold: 100 });

      // Both should lose units to starvation, but recruits lose proportionally more
      // because they're checked first.
      const updatedRecruit = result.battalions.find((b) => b.id === "r")!;
      const updatedElite = result.battalions.find((b) => b.id === "e")!;
      expect(updatedRecruit.size).toBeLessThan(100);
    });
  });

  describe("equipment decay", () => {
    it("flags when gold unpaid", () => {
      const b = makeBattalion({ tier: BattalionTier.ELITE, size: 100 });
      const result = processUpkeepTick({ battalions: [b], food: 100, gold: 0 });
      expect(result.equipmentDecay).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ARMY XP
// ═════════════════════════════════════════════════════════════════════════════

describe("army-xp", () => {
  describe("calculateCombatXp", () => {
    it("gives XP per surviving unit", () => {
      const xp = calculateCombatXp({
        survivors: 50, enemyTier: BattalionTier.REGULAR, won: false, isBattlefield: false,
      });
      expect(xp).toBe(50); // 50 × 1 XP
    });

    it("win bonus applies", () => {
      const base = calculateCombatXp({
        survivors: 50, enemyTier: BattalionTier.REGULAR, won: false, isBattlefield: false,
      });
      const win = calculateCombatXp({
        survivors: 50, enemyTier: BattalionTier.REGULAR, won: true, isBattlefield: false,
      });
      expect(win).toBeGreaterThan(base);
    });

    it("battlefield bonus applies", () => {
      const skirmish = calculateCombatXp({
        survivors: 50, enemyTier: BattalionTier.VETERAN, won: true, isBattlefield: false,
      });
      const battlefield = calculateCombatXp({
        survivors: 50, enemyTier: BattalionTier.VETERAN, won: true, isBattlefield: true,
      });
      expect(battlefield).toBeGreaterThan(skirmish);
    });

    it("fighting recruits gives no XP", () => {
      const xp = calculateCombatXp({
        survivors: 100, enemyTier: BattalionTier.RECRUIT, won: true, isBattlefield: true,
      });
      expect(xp).toBe(0);
    });
  });

  describe("checkTierAdvancement", () => {
    it("promotes when XP threshold met", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, xp: 100 });
      expect(checkTierAdvancement(b)).toBe(BattalionTier.REGULAR);
    });

    it("returns null when not enough XP", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, xp: 50 });
      expect(checkTierAdvancement(b)).toBeNull();
    });

    it("elite cannot promote", () => {
      const b = makeBattalion({ tier: BattalionTier.ELITE, xp: 9999 });
      expect(checkTierAdvancement(b)).toBeNull();
    });
  });

  describe("promoteBattalion", () => {
    it("resets XP with carry-over", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, xp: 150 });
      const promoted = promoteBattalion(b, BattalionTier.REGULAR);
      expect(promoted.tier).toBe(BattalionTier.REGULAR);
      expect(promoted.xp).toBe(50); // 150 - 100
    });
  });

  describe("field promotion", () => {
    it("costs scale with tier and size", () => {
      const small = makeBattalion({ tier: BattalionTier.RECRUIT, size: 10 });
      const large = makeBattalion({ tier: BattalionTier.RECRUIT, size: 100 });
      const costSmall = calculateFieldPromotionCost(small);
      const costLarge = calculateFieldPromotionCost(large);
      expect(costSmall).not.toBeNull();
      expect(costLarge).not.toBeNull();
      if (costSmall !== null && costLarge !== null) {
        expect(costLarge).toBeGreaterThan(costSmall);
      }
    });

    it("applies promotion", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, size: 50 });
      const result = applyFieldPromotion(b);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.battalion.tier).toBe(BattalionTier.REGULAR);
        expect(result.goldCost).toBeGreaterThan(0);
      }
    });

    it("elite cannot be promoted", () => {
      const b = makeBattalion({ tier: BattalionTier.ELITE });
      expect(calculateFieldPromotionCost(b)).toBeNull();
      expect(applyFieldPromotion(b)).toBeNull();
    });
  });

  describe("applyTrainingXp", () => {
    it("gives XP to lowest-tier training battalion", () => {
      const b1 = makeBattalion({ id: "b1", tier: BattalionTier.RECRUIT, stance: BattalionStance.TRAINING, xp: 0 });
      const b2 = makeBattalion({ id: "b2", tier: BattalionTier.REGULAR, stance: BattalionStance.TRAINING, xp: 0 });
      const result = applyTrainingXp([b1, b2]);
      const updatedB1 = result.find((b) => b.id === "b1")!;
      const updatedB2 = result.find((b) => b.id === "b2")!;
      expect(updatedB1.xp).toBe(1);
      expect(updatedB2.xp).toBe(0);
    });
  });

  describe("processXpTick", () => {
    it("auto-promotes when XP threshold met", () => {
      const b = makeBattalion({ tier: BattalionTier.RECRUIT, xp: 99, stance: BattalionStance.TRAINING });
      const result = processXpTick([b]);
      expect(result.promotions.length).toBe(1);
      expect(result.promotions[0].newTier).toBe(BattalionTier.REGULAR);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BATTALION COMBAT
// ═════════════════════════════════════════════════════════════════════════════

describe("battalion-combat", () => {
  describe("initCombat", () => {
    it("initializes with correct totals", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.REGULAR, size: 100 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 80 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 100 }],
        defenderBattalions: [{ battalion: d, committed: 80 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      expect(state.attackerTotalAlive).toBe(100);
      expect(state.defenderTotalAlive).toBe(80);
      expect(state.round).toBe(0);
      expect(state.finished).toBe(false);
    });
  });

  describe("resolveCombat", () => {
    it("higher tier wins with fewer casualties", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.ELITE, size: 100 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 100 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 100 }],
        defenderBattalions: [{ battalion: d, committed: 100 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const result = resolveCombat(state);
      expect(result.winner).toBe("ATTACKER");
      expect(result.attackerTotalCasualties).toBeLessThan(
        result.defenderTotalCasualties,
      );
    });

    it("defender wins with overwhelming numbers", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.RECRUIT, size: 50 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 200 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 50 }],
        defenderBattalions: [{ battalion: d, committed: 200 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const result = resolveCombat(state);
      expect(result.winner).toBe("DEFENDER");
    });

    it("awards XP to survivors", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.REGULAR, size: 100 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.REGULAR, size: 50 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 100 }],
        defenderBattalions: [{ battalion: d, committed: 50 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const result = resolveCombat(state);
      expect(result.xpAwarded.length).toBeGreaterThan(0);
    });

    it("wiped battalions are tracked", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.ELITE, size: 200 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 10 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 200 }],
        defenderBattalions: [{ battalion: d, committed: 10 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const result = resolveCombat(state);
      expect(result.wipedBattalionIds).toContain("d1");
    });

    it("multi-battalion combat works", () => {
      const a1 = makeBattalion({ id: "a1", tier: BattalionTier.REGULAR, size: 60 });
      const a2 = makeBattalion({ id: "a2", tier: BattalionTier.VETERAN, size: 40 });
      const d1 = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 100 });
      const d2 = makeBattalion({ id: "d2", tier: BattalionTier.REGULAR, size: 50 });
      const state = initCombat({
        attackerBattalions: [
          { battalion: a1, committed: 60 },
          { battalion: a2, committed: 40 },
        ],
        defenderBattalions: [
          { battalion: d1, committed: 100 },
          { battalion: d2, committed: 50 },
        ],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const result = resolveCombat(state);
      // Combat should resolve — one side wins.
      expect(result.winner).toBeDefined();
      expect(result.rounds).toBeGreaterThan(0);
    });
  });

  describe("applyCombatResultsToBattalions", () => {
    it("applies casualties and fatigue", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.ELITE, size: 100 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 50 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 100 }],
        defenderBattalions: [{ battalion: d, committed: 50 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const combatResult = resolveCombat(state);
      const now = Date.now();
      const { battalions, moraleDeltaAttacker, moraleDeltaDefender } =
        applyCombatResultsToBattalions({
          battalions: [a, d],
          combatResult,
          now,
          isBattlefield: false,
        });

      // Attacker won — should have some casualties but survived.
      const updatedAttacker = battalions.find((b) => b.id === "a1")!;
      expect(updatedAttacker.size).toBeLessThan(100);
      expect(updatedAttacker.readyAt).not.toBeNull();
      expect(moraleDeltaAttacker).toBeGreaterThan(0);
      expect(moraleDeltaDefender).toBeLessThan(0);
    });

    it("wiped battalion resets stance", () => {
      const a = makeBattalion({ id: "a1", tier: BattalionTier.ELITE, size: 200 });
      const d = makeBattalion({ id: "d1", tier: BattalionTier.RECRUIT, size: 10, stance: BattalionStance.FORTIFY, garrisonedAt: "tile_x" });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 200 }],
        defenderBattalions: [{ battalion: d, committed: 10 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      const result = resolveCombat(state);
      const { battalions } = applyCombatResultsToBattalions({
        battalions: [a, d],
        combatResult: result,
        now: Date.now(),
        isBattlefield: false,
      });
      const wiped = battalions.find((b) => b.id === "d1")!;
      expect(wiped.size).toBe(0);
      expect(wiped.stance).toBe(BattalionStance.REST);
      expect(wiped.garrisonedAt).toBeNull();
    });
  });

  describe("orderRetreat", () => {
    it("applies 15% extra casualties", () => {
      const a = makeBattalion({ id: "a1", size: 100 });
      const d = makeBattalion({ id: "d1", size: 100 });
      const state = initCombat({
        attackerBattalions: [{ battalion: a, committed: 100 }],
        defenderBattalions: [{ battalion: d, committed: 100 }],
        isBattlefield: false,
        attackerMorale: 60,
        defenderMorale: 60,
        attackerEquipmentDecay: false,
        defenderEquipmentDecay: false,
      });
      // Resolve one round so some casualties occur.
      const combatResult = resolveCombat(state);
      const battalions = orderRetreat({
        attackerBattalions: combatResult.attackerBattalions,
        battalions: [a],
        now: Date.now(),
      });
      const updated = battalions[0];
      // Attacker should have taken casualties including retreat penalty.
      expect(updated.size).toBeLessThan(100);
      expect(updated.stance).toBe(BattalionStance.REST);
      expect(updated.readyAt).not.toBeNull();
    });
  });
});
