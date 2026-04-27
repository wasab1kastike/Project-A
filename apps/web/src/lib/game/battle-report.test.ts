import assert from "node:assert/strict";
import test from "node:test";
import { formatRaidAttackPreview, formatRaidBattleReport } from "./battle-report";

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
  assert.match(lines[1] ?? "", /defender army 100/);
  assert.match(lines[2] ?? "", /28 survived/);
  assert.match(lines[2] ?? "", /14 returned/);
  assert.match(lines[2] ?? "", /14 retired/);
  assert.match(lines[3] ?? "", /14 points/);
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
  assert.match(lines[1] ?? "", /defender army 10/);
  assert.match(lines[2] ?? "", /sent army was lost/);
  assert.match(lines[2] ?? "", /7 troops/);
  assert.match(lines[3] ?? "", /0 points/);
  assert.match(lines[3] ?? "", /0 food/);
});
