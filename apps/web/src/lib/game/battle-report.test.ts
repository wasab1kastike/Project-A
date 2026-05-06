import assert from "node:assert/strict";
import test from "node:test";
import {
  formatApproximateForce,
  formatRaidAttackPreview,
  formatRaidBattleReport,
  formatRaidRecallReport,
} from "./battle-report";

test("approximate force formatting uses nearest display buckets", () => {
  assert.equal(formatApproximateForce(null), "unknown");
  assert.equal(formatApproximateForce(undefined), "unknown");
  assert.equal(formatApproximateForce(0), "0");
  assert.equal(formatApproximateForce(8), "10+");
  assert.equal(formatApproximateForce(75), "100+");
  assert.equal(formatApproximateForce(250), "300+");
  assert.equal(formatApproximateForce(347), "300+");
  assert.equal(formatApproximateForce(400), "500+");
  assert.equal(formatApproximateForce(1200), "1000+");
  assert.equal(formatApproximateForce(3600), "5000+");
  assert.equal(formatApproximateForce(8000), "10000+");
  assert.equal(formatApproximateForce(20000), "10000+");
});

test("raid preview shows the target castle level, defense bonus, and tie warning", () => {
  const lines = formatRaidAttackPreview({
    availableArmy: 42,
    sentArmy: 7,
    targetName: "Iron Gate",
    targetDbLevel: 2,
  });

  assert.deepEqual(lines, [
    "Available army: 42. Sent army: 7.",
    "Target: Iron Gate, castle level 3, defense bonus +30%.",
    "Defender wins ties. Sent army leaves your castle immediately.",
  ]);
});

test("raid preview includes defender castle specialization defense", () => {
  const lines = formatRaidAttackPreview({
    availableArmy: 42,
    sentArmy: 14,
    targetName: "Iron Gate",
    targetDbLevel: 0,
    targetCastleSpecializations: {
      POINTS: 0,
      FOOD: 0,
      MILITARY: 0,
      DEFENSE: 2,
    },
    targetVisibleArmy: 10,
  });

  assert.deepEqual(lines, [
    "Available army: 42. Sent army: 14.",
    "Target: Iron Gate, castle level 1, defense bonus +30%.",
    "Target army: 10. Estimated defense power: 13.",
    "Defender wins ties. Sent army leaves your castle immediately.",
  ]);
});

test("raid preview shows loot camp reward, timer, and defending army", () => {
  const lines = formatRaidAttackPreview({
    availableArmy: 80,
    sentArmy: 20,
    targetName: "Rich Loot Camp test",
    targetDbLevel: 0,
    targetIsLootCamp: true,
    targetLootCampVariant: "RICH",
    targetLootCampStrength: 500,
    targetLootCampDefenseArmy: 40,
  });

  assert.deepEqual(lines, [
    "Available army: 80. Sent army: 20.",
    "Target: Rich Loot Camp test, strength 500, defending army 40, rewards gold.",
    "Loot camps vanish after 30 minutes, fight back, and pay only when destroyed.",
  ]);
});

test("winning raid report includes survivors, retirement, return, and loot", () => {
  const lines = formatRaidBattleReport({
    attackerName: "North Keep",
    defenderName: "South Keep",
    sentArmy: 130,
    defenderArmyAtBattleStart: 100,
    defenderDbLevel: 1,
    resolvedDefensePower: 120,
    outcome: "ATTACKER_WIN",
    attackerSurvivors: 28,
    attackerRetired: 14,
    attackerReturned: 14,
    defenderLosses: 70,
    pointsLooted: 14,
    foodLooted: 14,
  });

  assert.match(lines[0] ?? "", /Raid victory!/);
  assert.match(lines[0] ?? "", /North Keep/);
  assert.match(lines[1] ?? "", /defender army about 100\+/);
  assert.match(lines[1] ?? "", /power about 100\+/);
  assert.doesNotMatch(lines[1] ?? "", /power 120/);
  assert.match(lines[2] ?? "", /28 survived/);
  assert.match(lines[2] ?? "", /14 returned/);
  assert.match(lines[2] ?? "", /14 retired/);
  assert.match(lines[3] ?? "", /14 gold/);
  assert.match(lines[3] ?? "", /14 food/);
});

test("losing raid report includes defender losses and no returned army", () => {
  const lines = formatRaidBattleReport({
    attackerName: "North Keep",
    defenderName: "South Keep",
    sentArmy: 11,
    defenderArmyAtBattleStart: 10,
    defenderDbLevel: 0,
    resolvedDefensePower: 11,
    outcome: "DEFENDER_WIN",
    attackerSurvivors: 0,
    attackerRetired: 0,
    attackerReturned: 0,
    defenderLosses: 7,
    pointsLooted: 0,
    foodLooted: 0,
  });

  assert.match(lines[0] ?? "", /Raid failed/);
  assert.match(lines[1] ?? "", /defender army about 10\+/);
  assert.match(lines[1] ?? "", /power about 10\+/);
  assert.doesNotMatch(lines[1] ?? "", /power 11/);
  assert.match(lines[2] ?? "", /sent army was lost/);
  assert.match(lines[2] ?? "", /7 troops/);
  assert.match(lines[3] ?? "", /0 gold/);
  assert.match(lines[3] ?? "", /0 food/);
});

test("loot camp report includes counterattack details and health damage", () => {
  const lines = formatRaidBattleReport({
    attackerName: "North Keep",
    defenderName: "Chaos Loot Camp test",
    sentArmy: 100,
    defenderArmyAtBattleStart: 12,
    defenderDbLevel: 0,
    resolvedAttackPower: 100,
    resolvedDefensePower: 13,
    outcome: "ATTACKER_WIN",
    attackerSurvivors: 80,
    attackerRetired: 40,
    attackerReturned: 40,
    defenderLosses: 9,
    pointsLooted: 0,
    foodLooted: 0,
    armyLooted: 100,
    defenderIsLootCamp: true,
    defenderLootCampVariant: "CHAOS",
  });

  assert.match(lines[1] ?? "", /defending army was 12/);
  assert.match(lines[2] ?? "", /Camp health was reduced by 100/);
  assert.match(lines[3] ?? "", /100 army and race cooldown reset/);
});

test("recall report includes returned army without battle details", () => {
  const lines = formatRaidRecallReport({
    attackerName: "North Keep",
    sentArmy: 3,
    returnedArmy: 3,
  });

  assert.deepEqual(lines, [
    "Army recalled. 3 troops returned home to North Keep.",
    "Sent army: 3. Returned army: 3.",
  ]);
  assert.doesNotMatch(lines.join(" "), /Loot|Defender|Raid failed|Raid victory/);
});
