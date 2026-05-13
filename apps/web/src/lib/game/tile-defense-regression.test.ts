import assert from "node:assert/strict";
import test from "node:test";
import { createBattlefieldFromAttackUnit, joinBattlefield } from "./battlefields";
import { getFortressState, getArmyState } from "./read-model";

// Regression test: Idle army in castle should NOT join tile defense automatically after initial attack

test("idle army in castle does not auto-join tile defense after initial attack", async () => {
  // Setup: fortress with idle army, attacked to create battlefield
  const fortressId = "fortress-1";
  const initialArmy = 100;
  // Simulate fortress state
  // ... (mock or setup fortress with 100 idle army)

  // Simulate attack: create battlefield
  await createBattlefieldFromAttackUnit({
    targetFortressId: fortressId,
    // ...other required params
  });

  // After battlefield creation, add more idle army to fortress
  // ... (simulate adding 50 more idle army)

  // No explicit joinBattlefield call for new idle army

  // Check: only the army present at attack time is defending
  const state = getFortressState(fortressId);
  const battlefield = state.activeBattlefield;
  assert.equal(battlefield.defenderArmy, initialArmy, "Only initial army should defend");

  // The new idle army should remain idle, not defending
  const armyState = getArmyState(fortressId);
  assert.equal(armyState.idle, 50, "New idle army should not auto-join defense");
});
