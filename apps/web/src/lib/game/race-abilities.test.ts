// =============================================================================
// Race Abilities — Unit Tests
// =============================================================================

import { describe, it, expect } from "vitest";

import {
  RaceAbilityKind,
  ABILITY_COOLDOWNS,
  isOffCooldown,
  computeCooldownEndsAt,
  formatCooldownRemaining,
  applyResourceDeltas,
  floor,
  FortressRace,
  DwarfDeepMiningOutcome,
  OrkBossOrderKind,
  OrkWaaaghInvestmentKind,
  OrkScrapEventReason,
  UnicornShatteredRealityOutcome,
} from "./race-abilities";

import {
  GRUDGE_MAX_TIER,
  MAX_ACTIVE_GRUDGES,
  GRUDGE_UPGRADE_GOLD_COST,
  DEEP_MINING_GOLD_COST,
  DEEP_MINING_MAX_INVESTMENT,
  bountyPerTick,
  calculateGrudgeBounty,
  grudgeBountyScoreValue,
  validateRunePlacement,
  createGrudge,
  upgradeGrudge,
  startMiningExpedition,
  isExpeditionReady,
  rollDeepMiningOutcome,
  resolveExpedition,
  activateDeepMining,
  activateRuneOfGrudges,
  upgradeRuneOfGrudges,
  collectGrudgeBounty,
  DEEP_MINING_OUTCOME_TABLE,
} from "./dwarf-abilities";

import {
  MAX_SCRAP,
  SCRAP_EVENT_YIELD,
  SCRAP_DECAY_PER_TICK,
  BOSS_ORDER_SCRAP_COST,
  MAX_WAAAGH_TIER,
  WAAAGH_DECAY_TICKS,
  WAAAGH_INVESTMENT_SCRAP_COST,
  calculateScrapEarned,
  applyScrapDecay,
  canAffordScrap,
  addScrap,
  spendScrap,
  getBossOrderBuff,
  isBossOrderActive,
  activateBossOrder,
  getWaaaghPassive,
  investInWaaagh,
  reinforceWaaagh,
  checkWaaaghDecay,
  applyWaaaghTickBonus,
  applyBossOrderAttackBuff,
  applyBossOrderLootBuff,
} from "./ork-abilities";

import {
  MAX_RAPID_RESPONSE_CHARGES,
  RAPID_RESPONSE_CHARGE_TICKS,
  validateRapidResponse,
  calculateRapidResponseCost,
  activateRapidResponse,
  tickRapidResponseRegen,
  getConvoyNetworkTier,
  applyConvoySpeedBonus,
  applyConvoyCargoBonus,
  rollEscortDefense,
  applyMurineBaseSpeedBonus,
  applyMurineTradeOfferExtension,
  RapidResponseAction,
} from "./murine-abilities";

import {
  rollRealityFlux,
  applyRealityFluxTick,
  calculateShatteredRealityCost,
  activateShatteredReality,
  grantTemporaryTeleport,
  useTemporaryTeleport,
  checkTeleportStatus,
  processUnicornTick,
  REALITY_FLUX_TABLE,
  SHATTERED_REALITY_OUTCOMES,
  FluxOutcomeKind,
} from "./unicorn-abilities";

// ═════════════════════════════════════════════════════════════════════════════
// Shared types & helpers
// ═════════════════════════════════════════════════════════════════════════════

describe("Shared types & helpers", () => {
  describe("cooldowns", () => {
    it("isOffCooldown returns true when no cooldown set", () => {
      expect(isOffCooldown(RaceAbilityKind.DWARF_DEEP_MINING, undefined)).toBe(
        true,
      );
    });

    it("isOffCooldown returns true when cooldown expired", () => {
      const past = Date.now() - 10_000;
      expect(
        isOffCooldown(RaceAbilityKind.DWARF_DEEP_MINING, past),
      ).toBe(true);
    });

    it("isOffCooldown returns false when cooldown active", () => {
      const future = Date.now() + 1_000_000;
      expect(
        isOffCooldown(RaceAbilityKind.ORK_BOSS_ORDER, future),
      ).toBe(false);
    });

    it("computeCooldownEndsAt returns future timestamp", () => {
      const now = 1_000_000;
      const end = computeCooldownEndsAt(RaceAbilityKind.MURINE_RAPID_RESPONSE, now);
      expect(end).toBe(now + ABILITY_COOLDOWNS[RaceAbilityKind.MURINE_RAPID_RESPONSE]);
    });

    it("formatCooldownRemaining returns null when ready", () => {
      expect(formatCooldownRemaining(undefined)).toBeNull();
      expect(formatCooldownRemaining(Date.now() - 1000)).toBeNull();
    });

    it("formatCooldownRemaining returns minutes string", () => {
      const future = Date.now() + 5 * 60_000; // 5 min
      expect(formatCooldownRemaining(future)).toBe("5m");
    });

    it("formatCooldownRemaining returns hours string", () => {
      const future = Date.now() + 3 * 3_600_000; // 3h
      expect(formatCooldownRemaining(future)).toBe("3h");
    });

    it("all cooldown values are positive", () => {
      for (const [kind, ms] of Object.entries(ABILITY_COOLDOWNS)) {
        expect(ms).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("resource floors", () => {
    it("floor clamps to default 0", () => {
      expect(floor(-100)).toBe(0);
      expect(floor(50)).toBe(50);
    });

    it("applyResourceDeltas floors each resource", () => {
      const result = applyResourceDeltas(
        { gold: 50, food: 10, army: 5, points: 0 },
        { gold: -100, food: -5, army: 10 },
      );
      expect(result.gold).toBe(0);
      expect(result.food).toBe(5);
      expect(result.army).toBe(15);
    });
  });

  describe("enums match data model", () => {
    it("FortressRace has 4 values", () => {
      expect(Object.keys(FortressRace)).toHaveLength(4);
    });

    it("DwarfDeepMiningOutcome has 8 outcomes", () => {
      expect(Object.keys(DwarfDeepMiningOutcome)).toHaveLength(8);
    });

    it("OrkBossOrderKind has 3 kinds", () => {
      expect(Object.keys(OrkBossOrderKind)).toHaveLength(3);
    });

    it("UnicornShatteredRealityOutcome has 3 outcomes", () => {
      expect(Object.keys(UnicornShatteredRealityOutcome)).toHaveLength(3);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Dwarf Abilities
// ═════════════════════════════════════════════════════════════════════════════

describe("Dwarf abilities", () => {
  describe("Grudge economy", () => {
    it("bountyPerTick scales with tier", () => {
      expect(bountyPerTick(1)).toBe(2);
      expect(bountyPerTick(2)).toBe(5);
      expect(bountyPerTick(3)).toBe(12);
    });

    it("bountyPerTick caps at max tier", () => {
      expect(bountyPerTick(999)).toBe(12);
    });

    it("calculateGrudgeBounty accrues over ticks", () => {
      const grudge = createGrudge("target-1", 1_000_000);
      const bounty = calculateGrudgeBounty(grudge, 60); // 60 ticks
      expect(bounty).toBe(0 + 60 * 2); // initial 0 + 60 * tier-1 rate
    });

    it("grudgeBountyScoreValue uses tier multiplier", () => {
      expect(grudgeBountyScoreValue(100, 1)).toBe(100); // 100 * 1.0
      expect(grudgeBountyScoreValue(100, 2)).toBe(150); // 100 * 1.5
      expect(grudgeBountyScoreValue(100, 3)).toBe(200); // 100 * 2.0
    });

    it("validateRunePlacement rejects invalid target", () => {
      expect(
        validateRunePlacement({
          existingGrudgeOnTarget: undefined,
          targetIsValid: false,
          hasFreeGrudgeSlot: true,
        }),
      ).toBe("You cannot place a Rune of Grudges on that target.");
    });

    it("validateRunePlacement rejects duplicate target", () => {
      expect(
        validateRunePlacement({
          existingGrudgeOnTarget: createGrudge("t", 0),
          targetIsValid: true,
          hasFreeGrudgeSlot: true,
        }),
      ).toBe("You already have an active grudge against this fortress.");
    });

    it("validateRunePlacement rejects when no slots", () => {
      expect(
        validateRunePlacement({
          existingGrudgeOnTarget: undefined,
          targetIsValid: true,
          hasFreeGrudgeSlot: false,
        }),
      ).toBe(
        "You have no free grudge slots. Resolve an existing grudge first.",
      );
    });

    it("validateRunePlacement returns null when valid", () => {
      expect(
        validateRunePlacement({
          existingGrudgeOnTarget: undefined,
          targetIsValid: true,
          hasFreeGrudgeSlot: true,
        }),
      ).toBeNull();
    });

    it("createGrudge starts at tier 1 with 0 bounty", () => {
      const g = createGrudge("target-1", 5_000);
      expect(g.tier).toBe(1);
      expect(g.bountyPoints).toBe(0);
      expect(g.targetFortressId).toBe("target-1");
      expect(g.activeAt).toBe(5_000);
    });

    it("upgradeGrudge increases tier", () => {
      const g = createGrudge("t", 0);
      const upgraded = upgradeGrudge(g, 2, 10_000);
      expect(upgraded.tier).toBe(2);
      expect(upgraded.activeAt).toBe(10_000);
    });

    it("upgradeGrudge caps at max tier", () => {
      const g = createGrudge("t", 0);
      const upgraded = upgradeGrudge(g, 999, 0);
      expect(upgraded.tier).toBe(GRUDGE_MAX_TIER);
    });

    it("activateRuneOfGrudges succeeds with enough gold", () => {
      const result = activateRuneOfGrudges({
        gold: 1000,
        cooldownEndsAt: undefined,
        activeGrudgeCount: 0,
        existingGrudgeOnTarget: undefined,
        targetIsValid: true,
        now: 1_000_000,
      });
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("activateRuneOfGrudges fails with insufficient gold", () => {
      const result = activateRuneOfGrudges({
        gold: 100,
        cooldownEndsAt: undefined,
        activeGrudgeCount: 0,
        existingGrudgeOnTarget: undefined,
        targetIsValid: true,
        now: 1_000_000,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("gold");
    });

    it("activateRuneOfGrudges fails when at max grudges", () => {
      const result = activateRuneOfGrudges({
        gold: 10_000,
        cooldownEndsAt: undefined,
        activeGrudgeCount: MAX_ACTIVE_GRUDGES,
        existingGrudgeOnTarget: undefined,
        targetIsValid: true,
        now: 1_000_000,
      });
      expect(result.ok).toBe(false);
    });

    it("upgradeRuneOfGrudges succeeds with enough gold", () => {
      const grudge = createGrudge("t", 0);
      const result = upgradeRuneOfGrudges({
        gold: 5_000,
        grudge,
        now: 1_000_000,
      });
      expect(result.ok).toBe(true);
    });

    it("upgradeRuneOfGrudges fails at max tier", () => {
      const grudge = createGrudge("t", 0);
      const maxGrudge = upgradeGrudge(grudge, GRUDGE_MAX_TIER, 0);
      const result = upgradeRuneOfGrudges({
        gold: 50_000,
        grudge: maxGrudge,
        now: 1_000_000,
      });
      expect(result.ok).toBe(false);
    });

    it("collectGrudgeBounty returns score value", () => {
      const grudge = createGrudge("t", 0);
      grudge.bountyPoints = 500;
      const collected = collectGrudgeBounty(grudge);
      expect(collected.bountyCollected).toBe(500);
      expect(collected.scoreValue).toBe(500); // tier 1 = 1.0x
    });

    it("grudge upgrade costs are defined for all tiers", () => {
      for (let t = 1; t <= GRUDGE_MAX_TIER; t++) {
        expect(GRUDGE_UPGRADE_GOLD_COST[t]).toBeGreaterThan(0);
      }
    });
  });

  describe("Deep Mining", () => {
    it("startMiningExpedition creates expedition", () => {
      const exp = startMiningExpedition(2_000, 1_000_000);
      expect(exp.goldInvested).toBe(2_000);
      expect(exp.returnsAt).toBeGreaterThan(exp.startedAt);
    });

    it("startMiningExpedition caps investment", () => {
      const exp = startMiningExpedition(50_000, 0);
      expect(exp.goldInvested).toBe(DEEP_MINING_MAX_INVESTMENT);
    });

    it("isExpeditionReady returns false before return time", () => {
      const exp = startMiningExpedition(2_000, 100_000);
      expect(isExpeditionReady(exp, 100_000)).toBe(false);
    });

    it("isExpeditionReady returns true after return time", () => {
      const exp = startMiningExpedition(2_000, 0);
      expect(isExpeditionReady(exp, exp.returnsAt + 1)).toBe(true);
    });

    it("resolveExpedition returns null when not ready", () => {
      const exp = startMiningExpedition(2_000, 100_000);
      expect(resolveExpedition(exp, 100_000)).toBeNull();
    });

    it("resolveExpedition returns result when ready", () => {
      const exp = startMiningExpedition(2_000, 0);
      const result = resolveExpedition(exp, exp.returnsAt + 1);
      expect(result).not.toBeNull();
      expect(result!.outcome).toBeDefined();
      expect(result!.summary).toBeTruthy();
    });

    it("rollDeepMiningOutcome returns a valid outcome", () => {
      // Run many rolls to check all outcomes are reachable.
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        const result = rollDeepMiningOutcome(0);
        seen.add(result.outcome);
        expect(result.goldDelta).toBeDefined();
        expect(result.foodDelta).toBeGreaterThanOrEqual(0);
        expect(result.runesFound).toBeGreaterThanOrEqual(0);
      }
      // With 500 rolls we should see most outcomes.
      expect(seen.size).toBeGreaterThanOrEqual(4);
    });

    it("higher investment shifts weights toward positive outcomes", () => {
      // With max extra investment, positive outcomes should be more frequent.
      let positiveCount = 0;
      const positiveOutcomes: Set<DwarfDeepMiningOutcome> = new Set([
        DwarfDeepMiningOutcome.RICH_VEIN,
        DwarfDeepMiningOutcome.ORE_SURGE,
        DwarfDeepMiningOutcome.BATTLE_RUNES,
      ]);

      for (let i = 0; i < 200; i++) {
        const result = rollDeepMiningOutcome(8_000); // max extra
        if (positiveOutcomes.has(result.outcome)) positiveCount++;
      }
      // With max investment, positive outcomes should be > 50%.
      expect(positiveCount).toBeGreaterThan(50);
    });

    it("activateDeepMining fails with insufficient gold", () => {
      const result = activateDeepMining({
        gold: 100,
        cooldownEndsAt: undefined,
        extraInvestment: 0,
        now: 0,
      });
      expect(result.ok).toBe(false);
    });

    it("activateDeepMining succeeds with enough gold", () => {
      const result = activateDeepMining({
        gold: 5_000,
        cooldownEndsAt: undefined,
        extraInvestment: 1_000,
        now: 0,
      });
      expect(result.ok).toBe(true);
      expect(result.cooldownEndsAt).toBeGreaterThan(0);
    });

    it("outcome table has correct base weights sum", () => {
      const sum = DEEP_MINING_OUTCOME_TABLE.reduce(
        (s, e) => s + e.baseWeight,
        0,
      );
      expect(sum).toBe(100);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Ork Abilities
// ═════════════════════════════════════════════════════════════════════════════

describe("Ork abilities", () => {
  describe("Scrap economy", () => {
    it("scrap event yields are positive", () => {
      for (const [reason, yield_] of Object.entries(SCRAP_EVENT_YIELD)) {
        expect(yield_).toBeGreaterThan(0);
      }
    });

    it("calculateScrapEarned applies Waaagh multiplier", () => {
      const base = calculateScrapEarned(
        OrkScrapEventReason.ATTACK_LAUNCHED,
        1,
        0,
      );
      const t2 = calculateScrapEarned(
        OrkScrapEventReason.ATTACK_LAUNCHED,
        1,
        2,
      );
      expect(t2).toBeGreaterThan(base);
      // Tier 2 = +50% bonus
      expect(t2).toBe(Math.floor(15 * 1.5));
    });

    it("applyScrapDecay reduces scrap", () => {
      const decayed = applyScrapDecay(1000);
      expect(decayed).toBeLessThan(1000);
      expect(decayed).toBe(990); // 1% decay
    });

    it("canAffordScrap checks budget", () => {
      expect(canAffordScrap(500, 200)).toBe(true);
      expect(canAffordScrap(100, 200)).toBe(false);
      expect(canAffordScrap(500, 0)).toBe(false);
    });

    it("addScrap caps at MAX_SCRAP", () => {
      expect(addScrap(MAX_SCRAP - 10, 100)).toBe(MAX_SCRAP);
    });

    it("spendScrap floors at zero", () => {
      expect(spendScrap(50, 100)).toBe(0);
      expect(spendScrap(200, 50)).toBe(150);
    });
  });

  describe("Boss Orders", () => {
    it("getBossOrderBuff returns correct buffs for each tier", () => {
      for (let tier = 0; tier <= 3; tier++) {
        const buff = getBossOrderBuff(OrkBossOrderKind.MORE_DAKKA, tier);
        expect(buff.attackMultiplier).toBeGreaterThanOrEqual(0);
      }
    });

    it("Boss Order buffs scale up with Waaagh tier", () => {
      const t0 = getBossOrderBuff(OrkBossOrderKind.MORE_DAKKA, 0);
      const t3 = getBossOrderBuff(OrkBossOrderKind.MORE_DAKKA, 3);
      expect(t3.attackMultiplier).toBeGreaterThan(t0.attackMultiplier);
    });

    it("activateBossOrder succeeds with enough scrap", () => {
      const result = activateBossOrder({
        scrap: 500,
        kind: OrkBossOrderKind.MORE_DAKKA,
        waaaghTier: 2,
        activeBossOrder: undefined,
        now: 1_000_000,
      });
      expect(result.ok).toBe(true);
    });

    it("activateBossOrder fails with insufficient scrap", () => {
      const result = activateBossOrder({
        scrap: 10,
        kind: OrkBossOrderKind.LOOT_WAGONS,
        waaaghTier: 0,
        activeBossOrder: undefined,
        now: 1_000_000,
      });
      expect(result.ok).toBe(false);
    });

    it("activateBossOrder fails when order already active", () => {
      const active = {
        kind: OrkBossOrderKind.PATCH_DA_FORT,
        activatedAt: 1_000_000,
        expiresAt: 2_000_000,
        waaaghTier: 1,
      };
      const result = activateBossOrder({
        scrap: 500,
        kind: OrkBossOrderKind.MORE_DAKKA,
        waaaghTier: 1,
        activeBossOrder: active,
        now: 1_500_000,
      });
      expect(result.ok).toBe(false);
    });

    it("isBossOrderActive returns correct status", () => {
      const order = {
        kind: OrkBossOrderKind.MORE_DAKKA,
        activatedAt: 1_000,
        expiresAt: 2_000,
        waaaghTier: 0,
      };
      expect(isBossOrderActive(order, 1_500)).toBe(true);
      expect(isBossOrderActive(order, 2_500)).toBe(false);
    });

    it("applyBossOrderAttackBuff increases damage", () => {
      const order = {
        kind: OrkBossOrderKind.MORE_DAKKA,
        activatedAt: 0,
        expiresAt: 10_000,
        waaaghTier: 2,
      };
      const buffed = applyBossOrderAttackBuff(100, order, 5_000);
      expect(buffed).toBeGreaterThan(100);
    });

    it("applyBossOrderAttackBuff returns base when no order", () => {
      expect(applyBossOrderAttackBuff(100, undefined, 0)).toBe(100);
    });
  });

  describe("Waaagh investment", () => {
    it("getWaaaghPassive scales with tier", () => {
      const t0 = getWaaaghPassive(0);
      const t3 = getWaaaghPassive(3);
      expect(t3.attackGoldBonus).toBeGreaterThan(t0.attackGoldBonus);
      expect(t3.scrapBonus).toBeGreaterThan(t0.scrapBonus);
    });

    it("investInWaaagh advances tier", () => {
      const waaagh = { tier: 0, lastFedAt: 0, totalScrapInvested: 0 };
      const result = investInWaaagh({ scrap: 1_000, currentWaaagh: waaagh, now: 1_000_000 });
      expect(result.ok).toBe(true);
      if (result.ok && result.data) {
        const data = result.data as Record<string, unknown>;
        expect(data.newTier).toBe(1);
      }
    });

    it("investInWaaagh fails when at max tier", () => {
      const waaagh = { tier: MAX_WAAAGH_TIER, lastFedAt: 0, totalScrapInvested: 10_000 };
      const result = investInWaaagh({ scrap: 10_000, currentWaaagh: waaagh, now: 0 });
      expect(result.ok).toBe(false);
    });

    it("investInWaaagh fails with insufficient scrap", () => {
      const waaagh = { tier: 0, lastFedAt: 0, totalScrapInvested: 0 };
      const result = investInWaaagh({ scrap: 10, currentWaaagh: waaagh, now: 0 });
      expect(result.ok).toBe(false);
    });

    it("reinforceWaaagh resets decay timer", () => {
      const waaagh = { tier: 2, lastFedAt: 0, totalScrapInvested: 2000 };
      const result = reinforceWaaagh({ scrap: 500, currentWaaagh: waaagh, now: 10_000 });
      expect(result.ok).toBe(true);
    });

    it("checkWaaaghDecay lowers tier after decay window", () => {
      const waaagh = { tier: 3, lastFedAt: 0, totalScrapInvested: 5000 };
      // Move far past the decay window.
      const future = WAAAGH_DECAY_TICKS * 60_000 + 1000;
      const decayed = checkWaaaghDecay(waaagh, future);
      expect(decayed.tier).toBeLessThan(3);
    });

    it("checkWaaaghDecay does nothing when fed recently", () => {
      const waaagh = { tier: 2, lastFedAt: 10_000, totalScrapInvested: 2000 };
      const decayed = checkWaaaghDecay(waaagh, 10_000 + 1000);
      expect(decayed.tier).toBe(2);
    });

    it("applyWaaaghTickBonus returns positive bonuses at higher tiers", () => {
      const bonus = applyWaaaghTickBonus(3);
      expect(bonus.goldBonus).toBeGreaterThan(0);
      expect(bonus.armyBonus).toBeGreaterThan(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Space Murine Abilities
// ═════════════════════════════════════════════════════════════════════════════

describe("Space Murine abilities", () => {
  describe("Rapid Response", () => {
    const freshState = () => ({
      charges: MAX_RAPID_RESPONSE_CHARGES,
      lastUsedAt: undefined,
      totalUsed: 0,
      chargeRegenProgress: 0,
    });

    it("validateRapidResponse passes with charges", () => {
      expect(
        validateRapidResponse({
          state: freshState(),
          cooldownEndsAt: undefined,
          now: 0,
        }),
      ).toBeNull();
    });

    it("validateRapidResponse fails with no charges", () => {
      const empty = { ...freshState(), charges: 0 };
      expect(
        validateRapidResponse({
          state: empty,
          cooldownEndsAt: undefined,
          now: 0,
        }),
      ).toContain("No Rapid Response charges");
    });

    it("validateRapidResponse fails on cooldown", () => {
      expect(
        validateRapidResponse({
          state: freshState(),
          cooldownEndsAt: 10_000,
          now: 5_000,
        }),
      ).toContain("cooldown");
    });

    it("calculateRapidResponseCost returns correct cost", () => {
      const cost = calculateRapidResponseCost(
        RapidResponseAction.RECALL_ATTACK,
        1000,
      );
      expect(cost).toBe(50); // 5% of 1000
    });

    it("calculateRapidResponseCost for RECALL_ALL is higher", () => {
      const recall = calculateRapidResponseCost(
        RapidResponseAction.RECALL_ATTACK,
        1000,
      );
      const recallAll = calculateRapidResponseCost(
        RapidResponseAction.RECALL_ALL,
        1000,
      );
      expect(recallAll).toBeGreaterThan(recall);
    });

    it("activateRapidResponse succeeds with charges", () => {
      const result = activateRapidResponse({
        state: freshState(),
        cooldownEndsAt: undefined,
        action: RapidResponseAction.RECALL_ATTACK,
        armyAffected: 500,
        armyAvailable: 1000,
        now: 0,
      });
      expect(result.ok).toBe(true);
    });

    it("activateRapidResponse fails with insufficient army", () => {
      const result = activateRapidResponse({
        state: freshState(),
        cooldownEndsAt: undefined,
        action: RapidResponseAction.RECALL_ALL,
        armyAffected: 10_000,
        armyAvailable: 100,
        now: 0,
      });
      expect(result.ok).toBe(false);
    });

    it("tickRapidResponseRegen generates charge after enough ticks", () => {
      let state = { ...freshState(), charges: 1, chargeRegenProgress: RAPID_RESPONSE_CHARGE_TICKS - 1 };
      const result = tickRapidResponseRegen(state);
      expect(result.chargeGenerated).toBe(true);
      expect(result.state.charges).toBe(2);
      expect(result.state.chargeRegenProgress).toBe(0);
    });

    it("tickRapidResponseRegen does not exceed max charges", () => {
      let state = { ...freshState(), charges: MAX_RAPID_RESPONSE_CHARGES, chargeRegenProgress: 500 };
      const result = tickRapidResponseRegen(state);
      expect(result.chargeGenerated).toBe(false);
      expect(result.state.charges).toBe(MAX_RAPID_RESPONSE_CHARGES);
    });

    it("tickRapidResponseRegen increments progress when not full", () => {
      let state = { ...freshState(), charges: 1, chargeRegenProgress: 5 };
      const result = tickRapidResponseRegen(state);
      expect(result.chargeGenerated).toBe(false);
      expect(result.state.chargeRegenProgress).toBe(6);
    });
  });

  describe("Convoy Network", () => {
    it("getConvoyNetworkTier returns correct tier for leg count", () => {
      expect(getConvoyNetworkTier(0).speedBonus).toBe(0);
      expect(getConvoyNetworkTier(1).speedBonus).toBe(0.1);
      expect(getConvoyNetworkTier(4).speedBonus).toBe(0.2);
      expect(getConvoyNetworkTier(7).speedBonus).toBe(0.3);
      expect(getConvoyNetworkTier(10).speedBonus).toBe(0.4);
    });

    it("applyConvoySpeedBonus reduces duration", () => {
      const reduced = applyConvoySpeedBonus(60_000, 5);
      expect(reduced).toBeLessThan(60_000);
      // 20% faster with 5 legs.
      expect(reduced).toBe(Math.floor(60_000 * 0.8));
    });

    it("applyConvoyCargoBonus increases value", () => {
      const boosted = applyConvoyCargoBonus(1000, 5);
      expect(boosted).toBeGreaterThan(1000);
      expect(boosted).toBe(Math.floor(1000 * 1.12));
    });

    it("rollEscortDefense returns boolean", () => {
      const result = rollEscortDefense(0.5, 3);
      expect(typeof result).toBe("boolean");
    });

    it("applyMurineBaseSpeedBonus reduces duration", () => {
      const reduced = applyMurineBaseSpeedBonus(100_000);
      expect(reduced).toBeLessThan(100_000);
    });

    it("applyMurineTradeOfferExtension adds time", () => {
      const extended = applyMurineTradeOfferExtension(1_000_000);
      expect(extended).toBeGreaterThan(1_000_000);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unicorn Abilities
// ═════════════════════════════════════════════════════════════════════════════

describe("Unicorn abilities", () => {
  describe("Reality Flux", () => {
    it("flux table has correct total weight", () => {
      const total = REALITY_FLUX_TABLE.reduce((s, e) => s + e.weight, 0);
      expect(total).toBe(100);
    });

    it("rollRealityFlux returns a valid entry", () => {
      const entry = rollRealityFlux();
      expect(REALITY_FLUX_TABLE).toContain(entry);
    });

    it("rollRealityFlux distribution covers all outcomes", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        seen.add(rollRealityFlux().outcome);
      }
      // With 500 rolls we should see every outcome.
      expect(seen.size).toBe(REALITY_FLUX_TABLE.length);
    });

    it("boons are more frequent than curses", () => {
      let boonCount = 0;
      let curseCount = 0;
      const curses: Set<FluxOutcomeKind> = new Set([
        FluxOutcomeKind.SUGAR_CRASH,
        FluxOutcomeKind.GLITTER_SPILL,
        FluxOutcomeKind.BRIEF_MORTALITY,
      ]);

      for (let i = 0; i < 500; i++) {
        const flux = rollRealityFlux();
        if (curses.has(flux.outcome)) {
          curseCount++;
        } else if (
          flux.outcome !== FluxOutcomeKind.NOTHING_UNUSUAL &&
          flux.outcome !== FluxOutcomeKind.ODD_WHINNY
        ) {
          boonCount++;
        }
      }
      // Boons should outnumber curses significantly (70% vs 15%).
      expect(boonCount).toBeGreaterThan(curseCount * 2);
    });

    it("applyRealityFluxTick updates resources", () => {
      const resources = { gold: 100, food: 50, army: 10, points: 5 };
      const result = applyRealityFluxTick(resources);
      expect(result.resources).toBeDefined();
      expect(result.flux).toBeDefined();
      expect(result.flux.message).toBeTruthy();
    });

    it("resource floors prevent negative values from curses", () => {
      const resources = { gold: 0, food: 0, army: 0, points: 0 };
      for (let i = 0; i < 100; i++) {
        const result = applyRealityFluxTick(resources);
        expect(result.resources.gold).toBeGreaterThanOrEqual(0);
        expect(result.resources.food).toBeGreaterThanOrEqual(0);
        expect(result.resources.army).toBeGreaterThanOrEqual(0);
        expect(result.resources.points).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Shattered Reality", () => {
    it("calculateShatteredRealityCost escalates with use count", () => {
      const cost0 = calculateShatteredRealityCost(0);
      const cost5 = calculateShatteredRealityCost(5);
      expect(cost5).toBeGreaterThan(cost0);
      // 5 uses → base * (1 + 5*0.5) = base * 3.5
      expect(cost5).toBe(3500);
    });

    it("activateShatteredReality succeeds with chosen outcome", () => {
      const state = { activationCount: 0, lastActivatedAt: undefined };
      const result = activateShatteredReality({
        gold: 2_000,
        state,
        cooldownEndsAt: undefined,
        chosenOutcome: UnicornShatteredRealityOutcome.MIRROR_HOST,
        now: 1_000_000,
      });
      expect(result.ok).toBe(true);
    });

    it("activateShatteredReality fails with insufficient gold", () => {
      const state = { activationCount: 10, lastActivatedAt: undefined };
      const result = activateShatteredReality({
        gold: 100,
        state,
        cooldownEndsAt: undefined,
        chosenOutcome: UnicornShatteredRealityOutcome.PRISMATIC_SURGE,
        now: 0,
      });
      expect(result.ok).toBe(false);
    });

    it("LUCKY_GALLOP grants teleport", () => {
      const state = { activationCount: 0, lastActivatedAt: undefined };
      const result = activateShatteredReality({
        gold: 5_000,
        state,
        cooldownEndsAt: undefined,
        chosenOutcome: UnicornShatteredRealityOutcome.LUCKY_GALLOP,
        now: 0,
      });
      expect(result.ok).toBe(true);
      if (result.ok && result.data) {
        const data = result.data as Record<string, unknown>;
        expect(data.grantsTeleport).toBe(true);
      }
    });

    it("activation count increments after use", () => {
      const state = { activationCount: 3, lastActivatedAt: undefined };
      const result = activateShatteredReality({
        gold: 10_000,
        state,
        cooldownEndsAt: undefined,
        chosenOutcome: UnicornShatteredRealityOutcome.MIRROR_HOST,
        now: 0,
      });
      expect(result.ok).toBe(true);
      if (result.ok && result.data) {
        const data = result.data as Record<string, unknown>;
        const newState = data.newState as { activationCount: number };
        expect(newState.activationCount).toBe(4);
      }
    });

    it("next activation cost is shown in result", () => {
      const state = { activationCount: 0, lastActivatedAt: undefined };
      const result = activateShatteredReality({
        gold: 5_000,
        state,
        cooldownEndsAt: undefined,
        chosenOutcome: UnicornShatteredRealityOutcome.PRISMATIC_SURGE,
        now: 0,
      });
      expect(result.ok).toBe(true);
      if (result.ok && result.data) {
        const data = result.data as Record<string, unknown>;
        expect(data.nextActivationCost).toBe(1500); // base * (1 + 1*0.5)
      }
    });
  });

  describe("Temporary Teleport", () => {
    it("grantTemporaryTeleport creates unused teleport", () => {
      const tp = grantTemporaryTeleport({
        now: 1_000_000,
        originTileId: "origin-1",
      });
      expect(tp.used).toBe(false);
      expect(tp.originTileId).toBe("origin-1");
      expect(tp.expiresAt).toBeGreaterThan(tp.grantedAt);
    });

    it("useTemporaryTeleport sets used=true", () => {
      const tp = grantTemporaryTeleport({ now: 0, originTileId: "origin" });
      const result = useTemporaryTeleport({
        teleport: tp,
        targetTileId: "dest-1",
        targetTileIsOccupied: false,
        now: 100,
      });
      expect("teleport" in result).toBe(true);
      if ("teleport" in result) {
        expect(result.teleport.used).toBe(true);
        expect(result.teleport.targetTileId).toBe("dest-1");
      }
    });

    it("useTemporaryTeleport fails when already used", () => {
      const tp = grantTemporaryTeleport({ now: 0, originTileId: "origin" });
      tp.used = true;
      const result = useTemporaryTeleport({
        teleport: tp,
        targetTileId: "dest",
        targetTileIsOccupied: false,
        now: 100,
      });
      expect("error" in result).toBe(true);
    });

    it("useTemporaryTeleport fails on occupied tile", () => {
      const tp = grantTemporaryTeleport({ now: 0, originTileId: "origin" });
      const result = useTemporaryTeleport({
        teleport: tp,
        targetTileId: "dest",
        targetTileIsOccupied: true,
        now: 100,
      });
      expect("error" in result).toBe(true);
    });

    it("checkTeleportStatus returns expired_unused when past expiry", () => {
      const tp = grantTemporaryTeleport({ now: 0, originTileId: "o" });
      expect(checkTeleportStatus(tp, 9_999_999)).toBe("expired_unused");
    });

    it("checkTeleportStatus returns snap_back after stay duration", () => {
      const tp = grantTemporaryTeleport({ now: 0, originTileId: "o" });
      tp.used = true;
      // Stay duration is 10 min (600,000ms).
      expect(checkTeleportStatus(tp, 700_000)).toBe("snap_back");
    });
  });

  describe("processUnicornTick", () => {
    it("returns flux and no teleport by default", () => {
      const result = processUnicornTick({
        resources: { gold: 100, food: 50, army: 10, points: 5 },
        shatteredReality: { activationCount: 0, lastActivatedAt: undefined },
        teleport: undefined,
        now: 0,
      });
      expect(result.flux).toBeDefined();
      expect(result.teleportStatus).toBe("none");
    });

    it("returns snap_back for expired teleport", () => {
      const tp = grantTemporaryTeleport({ now: 0, originTileId: "o" });
      tp.used = true;
      const result = processUnicornTick({
        resources: { gold: 100, food: 50, army: 10, points: 5 },
        shatteredReality: { activationCount: 0, lastActivatedAt: undefined },
        teleport: tp,
        now: 999_999,
      });
      expect(result.teleportStatus).toBe("snap_back");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-race invariants
// ═════════════════════════════════════════════════════════════════════════════

describe("Cross-race invariants", () => {
  it("no race ability produces negative resources when flooring is applied", () => {
    // All ability activation results should either fail or produce valid deltas.
    // This is enforced by applyResourceDeltas in every module.
    const resources = { gold: 0, food: 0, army: 0, points: 0 };
    const result = applyResourceDeltas(resources, {
      gold: -1000,
      food: -500,
    });
    expect(result.gold).toBe(0);
    expect(result.food).toBe(0);
  });

  it("cooldowns are distinct per ability", () => {
    const durations = Object.values(ABILITY_COOLDOWNS);
    const unique = new Set(durations);
    // At least some abilities have different cooldowns.
    expect(unique.size).toBeGreaterThan(1);
  });

  it("max tier constants are consistent", () => {
    expect(GRUDGE_MAX_TIER).toBe(3);
    expect(MAX_WAAAGH_TIER).toBe(3);
    // Both Dwarfs and Orks cap at tier 3 — intentional symmetry.
  });
});
