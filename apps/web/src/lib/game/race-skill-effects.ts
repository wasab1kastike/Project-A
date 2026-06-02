import type { FortressRace } from "./races";
import { getPurchasedNodeRewards } from "./race-skill-tree";

export type SkillModifiers = {
  pressureMultiplier: number;
  tileDefensePercent: number;
  foodPerTenFarmersBonus: number;
  goldPerTenMinersBonus: number;
  armyPerTenRecruitersBonus: number;
  raidPowerMultiplier: number;
  stolenCargoMultiplier: number;
  campaignSpeedMultiplier: number;
  campaignArmyMultiplier: number;
  escortPowerMultiplier: number;
  claimThreshold?: number;      // if set, replaces default
  pressureDisrupt: boolean;      // claiming tile disrupts adjacent pressure
  guardAttritionPercent: number; // guards deal % attrition to attackers
  doubleStealChance: number;     // % chance to double steal on raid
  campaignStartPercent: number;  // campaigns start at X% progress
  siegeWarningHours?: number;    // if set, replaces default
  bonusGoldChance: number;
  freeArmyChance: number;
  populationBonus: number;
  populationPerOwnedTile: number;
  attackSlotBonus: number;
  pressurePriorityLimitBonus: number;
  upkeepDiscountPercent: number;
  recruitmentRateMultiplier: number;
  battalionSlotBonus: number;
  battalionMaxSizePercent: number;
  battalionXpMultiplier: number;
  promotionDiscountPercent: number;
  tradeWagonCapacityPercent: number;
  tradeProfitPercent: number;
  tradeWagonSlotBonus: number;
  instantReinforce: boolean;
  precisionStrikeChance: number;
  prismaticClaimChance: number;
  cascade: boolean;
  decoyRaidChance: number;
  hiddenArmy: boolean;
  mirrorHost: boolean;
  grudgeGold: number;
  vengefulFood: number;
  bloodFrenzy: boolean;
  conveyanceSpeedHours: number;
};

const EMPTY_MODIFIERS: SkillModifiers = {
  pressureMultiplier: 1,
  tileDefensePercent: 0,
  foodPerTenFarmersBonus: 0,
  goldPerTenMinersBonus: 0,
  armyPerTenRecruitersBonus: 0,
  raidPowerMultiplier: 1,
  stolenCargoMultiplier: 1,
  campaignSpeedMultiplier: 1,
  campaignArmyMultiplier: 1,
  escortPowerMultiplier: 1,
  pressureDisrupt: false,
  guardAttritionPercent: 0,
  doubleStealChance: 0,
  campaignStartPercent: 0,
  bonusGoldChance: 0,
  freeArmyChance: 0,
  populationBonus: 0,
  populationPerOwnedTile: 0,
  attackSlotBonus: 0,
  pressurePriorityLimitBonus: 0,
  upkeepDiscountPercent: 0,
  recruitmentRateMultiplier: 1,
  battalionSlotBonus: 0,
  battalionMaxSizePercent: 0,
  battalionXpMultiplier: 1,
  promotionDiscountPercent: 0,
  tradeWagonCapacityPercent: 0,
  tradeProfitPercent: 0,
  tradeWagonSlotBonus: 0,
  instantReinforce: false,
  precisionStrikeChance: 0,
  prismaticClaimChance: 0,
  cascade: false,
  decoyRaidChance: 0,
  hiddenArmy: false,
  mirrorHost: false,
  grudgeGold: 0,
  vengefulFood: 0,
  bloodFrenzy: false,
  conveyanceSpeedHours: 0,
};

export function getSkillModifiers({
  race,
  purchases,
}: {
  race: FortressRace | null;
  purchases: Array<{ nodeKey: string }>;
}): SkillModifiers {
  if (!race) return EMPTY_MODIFIERS;

  const rewards = getPurchasedNodeRewards({
    race,
    nodeKeys: purchases.map((purchase) => purchase.nodeKey),
  });
  const mods: SkillModifiers = { ...EMPTY_MODIFIERS };

  for (const r of rewards) {
    switch (r.effect) {
      case "pressure":
        mods.pressureMultiplier += (r.value ?? 0) / 100;
        break;
      case "tileDefense":
        mods.tileDefensePercent += r.value ?? 0;
        break;
      case "foodPerTenFarmers":
        mods.foodPerTenFarmersBonus += r.value ?? 0;
        break;
      case "goldPerTenMiners":
        mods.goldPerTenMinersBonus += r.value ?? 0;
        break;
      case "armyPerTenRecruiters":
        mods.armyPerTenRecruitersBonus += r.value ?? 0;
        break;
      case "raidPower":
        mods.raidPowerMultiplier = 1 + (r.value ?? 0) / 100;
        break;
      case "stolenCargo":
        mods.stolenCargoMultiplier = 1 + (r.value ?? 0) / 100;
        break;
      case "campaignSpeed":
        mods.campaignSpeedMultiplier = 1 + (r.value ?? 0) / 100;
        break;
      case "campaignArmy":
        mods.campaignArmyMultiplier = 1 + (r.value ?? 0) / 100;
        break;
      case "escortPower":
        mods.escortPowerMultiplier = 1 + (r.value ?? 0) / 100;
        break;
      case "claimThreshold":
        mods.claimThreshold =
          typeof r.value === "number"
            ? Math.min(mods.claimThreshold ?? r.value, r.value)
            : mods.claimThreshold;
        break;
      case "pressureDisrupt":
        mods.pressureDisrupt = true;
        break;
      case "guardAttrition":
        mods.guardAttritionPercent = r.value ?? 0;
        break;
      case "doubleSteal":
        mods.doubleStealChance = r.value ?? 0;
        break;
      case "campaignStart":
        mods.campaignStartPercent = r.value ?? 0;
        break;
      case "siegeWarning":
        mods.siegeWarningHours = r.value;
        break;
      case "bonusGold":
        mods.bonusGoldChance = r.value ?? 0;
        break;
      case "freeArmy":
        mods.freeArmyChance = r.value ?? 0;
        break;
      case "population":
        mods.populationBonus += r.value ?? 0;
        break;
      case "populationPerOwnedTile":
        mods.populationPerOwnedTile += r.value ?? 0;
        break;
      case "attackSlot":
        mods.attackSlotBonus = r.value ?? 0;
        break;
      case "pressurePrioritySlots":
        mods.pressurePriorityLimitBonus += r.value ?? 0;
        break;
      case "upkeepDiscount":
        mods.upkeepDiscountPercent = Math.max(
          mods.upkeepDiscountPercent,
          r.value ?? 0
        );
        break;
      case "recruitmentRate":
        mods.recruitmentRateMultiplier += (r.value ?? 0) / 100;
        break;
      case "battalionSlots":
        mods.battalionSlotBonus += r.value ?? 0;
        break;
      case "battalionMaxSize":
        mods.battalionMaxSizePercent += r.value ?? 0;
        break;
      case "battalionXpRate":
        mods.battalionXpMultiplier += (r.value ?? 0) / 100;
        break;
      case "promotionDiscount":
        mods.promotionDiscountPercent = Math.max(
          mods.promotionDiscountPercent,
          r.value ?? 0
        );
        break;
      case "tradeWagonCapacity":
        mods.tradeWagonCapacityPercent += r.value ?? 0;
        break;
      case "tradeProfit":
        mods.tradeProfitPercent += r.value ?? 0;
        break;
      case "tradeWagonSlots":
        mods.tradeWagonSlotBonus += r.value ?? 0;
        break;
      case "instantReinforce":
        mods.instantReinforce = true;
        break;
      case "precisionStrike":
        mods.precisionStrikeChance = r.value ?? 0;
        break;
      case "prismaticClaim":
        mods.prismaticClaimChance = r.value ?? 0;
        break;
      case "cascade":
        mods.cascade = true;
        break;
      case "decoyRaid":
        mods.decoyRaidChance = r.value ?? 0;
        break;
      case "hiddenArmy":
        mods.hiddenArmy = true;
        break;
      case "mirrorHost":
        mods.mirrorHost = true;
        break;
      case "grudgeGold":
        mods.grudgeGold = r.value ?? 0;
        break;
      case "vengefulFood":
        mods.vengefulFood = r.value ?? 0;
        break;
      case "bloodFrenzy":
        mods.bloodFrenzy = true;
        break;
      case "conveyance":
      case "convoySpeed":
        mods.conveyanceSpeedHours = r.value ?? 0;
        break;
    }
  }

  return mods;
}
