// =============================================================================
// Auto-War System Tests
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── supply-lines.ts ──────────────────────────────────────────────────────────

import {
  RoadLevel,
  ROAD_THRESHOLDS,
  ROAD_SPEED_BONUS,
  createRoadSegment,
  addRoadProgress,
  getRoadLevelForCrossings,
  getRoadSpeedMultiplier,
  getRoadTravelTimeMultiplier,
  applyRoadDecay,
  recordPathCrossings,
  decayRoadNetwork,
  getPathTravelTimeMultiplier,
} from "./supply-lines";

describe("supply-lines", () => {
  describe("road levels", () => {
    it("NONE at 0 crossings", () => {
      assert.equal(getRoadLevelForCrossings(0), RoadLevel.NONE);
    });
    it("DIRT at 50", () => {
      assert.equal(getRoadLevelForCrossings(50), RoadLevel.DIRT);
    });
    it("STONE at 200", () => {
      assert.equal(getRoadLevelForCrossings(200), RoadLevel.STONE);
    });
    it("HIGHWAY at 500", () => {
      assert.equal(getRoadLevelForCrossings(500), RoadLevel.HIGHWAY);
    });
    it("still DIRT at 199", () => {
      assert.equal(getRoadLevelForCrossings(199), RoadLevel.DIRT);
    });
  });

  describe("speed bonuses", () => {
    it("baseline is 1.0", () => {
      assert.equal(getRoadSpeedMultiplier(RoadLevel.NONE), 1.0);
    });
    it("highway is 1.5x", () => {
      assert.equal(getRoadSpeedMultiplier(RoadLevel.HIGHWAY), 1.5);
    });
    it("travel time multiplier is inverse", () => {
      assert.ok(getRoadTravelTimeMultiplier(RoadLevel.HIGHWAY) < 1);
      assert.ok(
        getRoadTravelTimeMultiplier(RoadLevel.HIGHWAY) <
          getRoadTravelTimeMultiplier(RoadLevel.NONE),
      );
    });
  });

  describe("addRoadProgress", () => {
    it("accumulates crossings", () => {
      const seg = createRoadSegment("t1");
      const now = Date.now();
      const updated = addRoadProgress(seg, 30, now);
      assert.equal(updated.crossings, 30);
      assert.equal(updated.level, RoadLevel.NONE);
    });
    it("levels up at threshold", () => {
      const seg = createRoadSegment("t1");
      const now = Date.now();
      const updated = addRoadProgress(seg, 51, now);
      assert.equal(updated.level, RoadLevel.DIRT);
    });
    it("multiple crossings stack", () => {
      const seg = createRoadSegment("t1");
      const now = Date.now();
      let updated = addRoadProgress(seg, 100, now);
      updated = addRoadProgress(updated, 150, now);
      assert.equal(updated.crossings, 250);
      assert.equal(updated.level, RoadLevel.STONE);
    });
    it("sets lastUsedAt", () => {
      const seg = createRoadSegment("t1");
      const now = 1_000_000;
      const updated = addRoadProgress(seg, 10, now);
      assert.equal(updated.lastUsedAt, 1_000_000);
    });
  });

  describe("applyRoadDecay", () => {
    it("no decay when recently used", () => {
      const seg = addRoadProgress(createRoadSegment("t1"), 100, Date.now());
      const decayed = applyRoadDecay(seg, Date.now());
      assert.ok(decayed.crossings >= 99);
    });
    it("decays over hours", () => {
      const now = 10_000_000;
      const seg: typeof createRoadSegment extends (...args: any[]) => infer R ? R : never = {
        tileId: "t1",
        crossings: 100,
        level: RoadLevel.DIRT,
        lastUsedAt: now - 100 * 3_600_000, // 100 hours ago
      } as any;
      const decayed = applyRoadDecay(seg, now);
      assert.ok(decayed.crossings < 100);
    });
    it("can downgrade level", () => {
      const now = 10_000_000;
      // 55 crossings, dirt level. 100+ hours of decay should drop below 50.
      const seg = {
        tileId: "t1",
        crossings: 55,
        level: RoadLevel.DIRT,
        lastUsedAt: now - 200 * 3_600_000,
      };
      const decayed = applyRoadDecay(seg, now);
      assert.ok(decayed.crossings <= 55);
      assert.equal(decayed.level, RoadLevel.NONE);
    });
  });

  describe("recordPathCrossings", () => {
    it("adds crossings to all tiles in path", () => {
      const network = new Map();
      const updated = recordPathCrossings(
        network,
        ["t1", "t2", "t3"],
        50,
        Date.now(),
      );
      assert.equal(updated.get("t1")?.crossings, 50);
      assert.equal(updated.get("t2")?.crossings, 50);
      assert.equal(updated.get("t3")?.crossings, 50);
    });
    it("stacks on existing segments", () => {
      let network = new Map();
      network = recordPathCrossings(network, ["t1"], 30, Date.now());
      network = recordPathCrossings(network, ["t1"], 30, Date.now());
      assert.equal(network.get("t1")?.crossings, 60);
    });
  });

  describe("getPathTravelTimeMultiplier", () => {
    it("baseline for empty network", () => {
      const net = new Map();
      assert.equal(getPathTravelTimeMultiplier(net, ["t1", "t2"]), 1.0);
    });
    it("faster with roads", () => {
      const net = new Map();
      const seg: ReturnType<typeof createRoadSegment> = {
        tileId: "t1",
        crossings: 500,
        level: RoadLevel.HIGHWAY,
        lastUsedAt: Date.now(),
      };
      net.set("t1", seg);
      const mult = getPathTravelTimeMultiplier(net, ["t1", "t2"]);
      assert.ok(mult < 1.0);
    });
  });
});

// ── war-front.ts ─────────────────────────────────────────────────────────────

import {
  createWarFront,
  assignBattalionsToFront,
  removeBattalionsFromFront,
  updateFrontStatus,
  selectNextTarget,
  sortBattlefieldsByPriority,
  getBattlefieldReinforcementNeeds,
  FrontStatus,
  AggressionStance,
  TileAttackPriority,
  BattlefieldPriority,
  type ReachableTarget,
  type PrioritizedBattlefield,
  type WarFront,
} from "./war-front";

describe("war-front", () => {
  describe("createWarFront", () => {
    it("starts ADVANCING", () => {
      const front = createWarFront({
        id: "f1",
        enemyFortressId: "enemy1",
        battalionIds: ["b1"],
        now: 1000,
      });
      assert.equal(front.status, FrontStatus.ADVANCING);
      assert.equal(front.enemyFortressId, "enemy1");
    });
  });

  describe("assignBattalionsToFront", () => {
    it("adds new battalions", () => {
      const front = createWarFront({
        id: "f1",
        enemyFortressId: "e1",
        battalionIds: ["b1"],
        now: 0,
      });
      const updated = assignBattalionsToFront(front, ["b2", "b3"]);
      assert.equal(updated.assignedBattalionIds.length, 3);
    });
    it("ignores duplicates", () => {
      const front = createWarFront({
        id: "f1",
        enemyFortressId: "e1",
        battalionIds: ["b1"],
        now: 0,
      });
      const updated = assignBattalionsToFront(front, ["b1", "b2"]);
      assert.equal(updated.assignedBattalionIds.length, 2);
    });
    it("unstalls a stalled front", () => {
      const front: WarFront = {
        id: "f1",
        enemyFortressId: "e1",
        assignedBattalionIds: ["b1"],
        status: FrontStatus.STALLED,
        createdAt: 0,
      };
      const updated = assignBattalionsToFront(front, ["b2"]);
      assert.equal(updated.status, FrontStatus.ADVANCING);
    });
  });

  describe("removeBattalionsFromFront", () => {
    it("removes specified battalions", () => {
      const front = createWarFront({
        id: "f1",
        enemyFortressId: "e1",
        battalionIds: ["b1", "b2", "b3"],
        now: 0,
      });
      const updated = removeBattalionsFromFront(front, ["b2"]);
      assert.equal(updated.assignedBattalionIds.length, 2);
      assert.ok(!updated.assignedBattalionIds.includes("b2"));
    });
    it("marks DEFEATED when no battalions remain", () => {
      const front = createWarFront({
        id: "f1",
        enemyFortressId: "e1",
        battalionIds: ["b1"],
        now: 0,
      });
      const updated = removeBattalionsFromFront(front, ["b1"]);
      assert.equal(updated.status, FrontStatus.DEFEATED);
    });
  });

  describe("updateFrontStatus", () => {
    it("DEFEATED when no battalions alive", () => {
      const front = createWarFront({ id: "f1", enemyFortressId: "e1", battalionIds: ["b1"], now: 0 });
      const updated = updateFrontStatus(front, {
        hasReachableTargets: true,
        hasBattalionsAlive: false,
        allPriorityTilesCaptured: false,
      });
      assert.equal(updated.status, FrontStatus.DEFEATED);
    });
    it("VICTORIOUS when all tiles captured", () => {
      const front = createWarFront({ id: "f1", enemyFortressId: "e1", battalionIds: ["b1"], now: 0 });
      const updated = updateFrontStatus(front, {
        hasReachableTargets: true,
        hasBattalionsAlive: true,
        allPriorityTilesCaptured: true,
      });
      assert.equal(updated.status, FrontStatus.VICTORIOUS);
    });
    it("STALLED when no reachable targets", () => {
      const front = createWarFront({ id: "f1", enemyFortressId: "e1", battalionIds: ["b1"], now: 0 });
      const updated = updateFrontStatus(front, {
        hasReachableTargets: false,
        hasBattalionsAlive: true,
        allPriorityTilesCaptured: false,
      });
      assert.equal(updated.status, FrontStatus.STALLED);
    });
    it("ADVANCING when targets exist and battalions alive", () => {
      const front = createWarFront({ id: "f1", enemyFortressId: "e1", battalionIds: ["b1"], now: 0 });
      const updated = updateFrontStatus(front, {
        hasReachableTargets: true,
        hasBattalionsAlive: true,
        allPriorityTilesCaptured: false,
      });
      assert.equal(updated.status, FrontStatus.ADVANCING);
    });
  });

  describe("selectNextTarget", () => {
    it("returns highest priority closest tile", () => {
      const targets: ReachableTarget[] = [
        { tileId: "t1", priority: TileAttackPriority.SECONDARY, isConnected: true, estimatedDefense: 10, distance: 3 },
        { tileId: "t2", priority: TileAttackPriority.PRIMARY, isConnected: true, estimatedDefense: 20, distance: 5 },
        { tileId: "t3", priority: TileAttackPriority.PRIMARY, isConnected: true, estimatedDefense: 5, distance: 2 },
      ];
      const result = selectNextTarget(targets);
      assert.equal(result?.tileId, "t3"); // PRIMARY + closest
    });
    it("ignores unconnected tiles", () => {
      const targets: ReachableTarget[] = [
        { tileId: "t1", priority: TileAttackPriority.PRIMARY, isConnected: false, estimatedDefense: 10, distance: 1 },
        { tileId: "t2", priority: TileAttackPriority.SECONDARY, isConnected: true, estimatedDefense: 10, distance: 10 },
      ];
      const result = selectNextTarget(targets);
      assert.equal(result?.tileId, "t2");
    });
    it("falls back to connected enemy tiles when no priority targets exist", () => {
      const targets: ReachableTarget[] = [
        { tileId: "t1", priority: TileAttackPriority.NONE, isConnected: true, estimatedDefense: 10, distance: 1 },
      ];
      assert.equal(selectNextTarget(targets)?.tileId, "t1");
    });
    it("returns null when no connected targets exist", () => {
      const targets: ReachableTarget[] = [
        { tileId: "t1", priority: TileAttackPriority.PRIMARY, isConnected: false, estimatedDefense: 10, distance: 1 },
      ];
      assert.equal(selectNextTarget(targets), null);
    });
  });

  describe("sortBattlefieldsByPriority", () => {
    it("higher priority first", () => {
      const bfs: PrioritizedBattlefield[] = [
        { battlefieldId: "bf1", priority: BattlefieldPriority.NORMAL, side: "DEFENDER", ourArmyRemaining: 50, enemyArmyRemaining: 100 },
        { battlefieldId: "bf2", priority: BattlefieldPriority.REINFORCE_FIRST, side: "DEFENDER", ourArmyRemaining: 50, enemyArmyRemaining: 100 },
      ];
      const sorted = sortBattlefieldsByPriority(bfs);
      assert.equal(sorted[0].battlefieldId, "bf2");
    });
    it("more desperate first when same priority", () => {
      const bfs: PrioritizedBattlefield[] = [
        { battlefieldId: "bf1", priority: BattlefieldPriority.NORMAL, side: "DEFENDER", ourArmyRemaining: 80, enemyArmyRemaining: 100 },
        { battlefieldId: "bf2", priority: BattlefieldPriority.NORMAL, side: "DEFENDER", ourArmyRemaining: 20, enemyArmyRemaining: 100 },
      ];
      const sorted = sortBattlefieldsByPriority(bfs);
      assert.equal(sorted[0].battlefieldId, "bf2");
    });
  });

  describe("getBattlefieldReinforcementNeeds", () => {
    it("returns 0 for NONE priority", () => {
      const bf: PrioritizedBattlefield = {
        battlefieldId: "bf1", priority: BattlefieldPriority.NONE, side: "DEFENDER", ourArmyRemaining: 10, enemyArmyRemaining: 100,
      };
      assert.equal(getBattlefieldReinforcementNeeds(bf, 200), 0);
    });
    it("returns deficit capped by pool", () => {
      const bf: PrioritizedBattlefield = {
        battlefieldId: "bf1", priority: BattlefieldPriority.REINFORCE_FIRST, side: "DEFENDER", ourArmyRemaining: 30, enemyArmyRemaining: 100,
      };
      // deficit = 70, pool = 50 → capped at 50
      assert.equal(getBattlefieldReinforcementNeeds(bf, 50), 50);
    });
    it("returns 0 when winning", () => {
      const bf: PrioritizedBattlefield = {
        battlefieldId: "bf1", priority: BattlefieldPriority.NORMAL, side: "DEFENDER", ourArmyRemaining: 150, enemyArmyRemaining: 100,
      };
      assert.equal(getBattlefieldReinforcementNeeds(bf, 200), 0);
    });
  });
});

// ── auto-war.ts ──────────────────────────────────────────────────────────────

import {
  createDefaultAutoWarPolicy,
  addPriorityTile,
  removePriorityTile,
  calculateArmySplit,
  dispatchAttack,
  processAutoWarTick,
  type AutoWarPolicy,
} from "./auto-war";
import { Battalion, BattalionTier } from "./battalion-types";
import { TileAttackPriority, BattlefieldPriority } from "./war-front";

function makeBn(overrides: Partial<Battalion> = {}): Battalion {
  return {
    id: overrides.id ?? "b1",
    name: overrides.name ?? "Test",
    size: overrides.size ?? 100,
    maxSize: overrides.maxSize ?? 200,
    tier: overrides.tier ?? BattalionTier.RECRUIT,
    xp: 0,
    readyAt: null,
    stance: "MOBILE",
    garrisonedAt: null,
    stanceLockedUntil: null,
  };
}

describe("auto-war", () => {
  describe("calculateArmySplit", () => {
    it("splits by guard %", () => {
      const bns = [makeBn({ size: 500 })];
      const policy = createDefaultAutoWarPolicy();
      policy.guardPercent = 30;
      const split = calculateArmySplit({
        battalions: bns,
        policy,
        committedBattalionIds: new Set(),
      });
      assert.equal(split.totalArmy, 500);
      assert.equal(split.defensiveArmy, 150);
      assert.equal(split.offensiveArmy, 350);
    });
    it("tracks committed vs idle", () => {
      const bns = [makeBn({ id: "b1", size: 300 }), makeBn({ id: "b2", size: 200 })];
      const policy = createDefaultAutoWarPolicy();
      const split = calculateArmySplit({
        battalions: bns,
        policy,
        committedBattalionIds: new Set(["b1"]),
      });
      assert.equal(split.committedArmy, 300);
      assert.equal(split.idleArmy, 50); // 500 * 0.7 - 300
    });
  });

  describe("dispatchAttack", () => {
    it("commits aggression % of battalion", () => {
      const bn = makeBn({ size: 100 });
      const { order, battalion } = dispatchAttack({
        battalion: bn,
        targetTileId: "t1",
        frontId: "f1",
        aggression: AggressionStance.BALANCED,
      });
      assert.equal(order.armyCommitted, 60);
      assert.equal(battalion.size, 40);
    });
    it("always commits at least 1 unit", () => {
      const bn = makeBn({ size: 2 });
      const { order } = dispatchAttack({
        battalion: bn,
        targetTileId: "t1",
        frontId: "f1",
        aggression: AggressionStance.CAUTIOUS,
      });
      assert.ok(order.armyCommitted >= 1);
    });
  });

  describe("processAutoWarTick", () => {
    it("dispatches attacks from active fronts", () => {
      const bn = makeBn({ id: "b1", size: 200 });
      const policy = createDefaultAutoWarPolicy();
      policy.fronts = [
        createWarFront({ id: "f1", enemyFortressId: "e1", battalionIds: ["b1"], now: 0 }),
      ];
      policy.priorityTiles = [
        { tileId: "t1", priority: TileAttackPriority.PRIMARY, targetEnemyId: "e1" },
      ];
      policy.maxArmySize = 500;

      const result = processAutoWarTick({
        battalions: [bn],
        policy,
        reachableTargets: [
          { tileId: "t1", priority: TileAttackPriority.PRIMARY, isConnected: true, estimatedDefense: 10, distance: 1 },
        ],
        battalionsInTransit: new Set(),
      });

      assert.equal(result.orders.length, 1);
      assert.equal(result.orders[0].targetTileId, "t1");
      assert.equal(result.orders[0].frontId, "f1");
    });

    it("skips stalled fronts", () => {
      const bn = makeBn({ id: "b1", size: 200 });
      const policy = createDefaultAutoWarPolicy();
      policy.fronts = [
        { id: "f1", enemyFortressId: "e1", assignedBattalionIds: ["b1"], status: FrontStatus.STALLED, createdAt: 0 },
      ];

      const result = processAutoWarTick({
        battalions: [bn],
        policy,
        reachableTargets: [],
        battalionsInTransit: new Set(),
      });

      assert.equal(result.orders.length, 0);
    });

    it("caps army at max size", () => {
      const bn = makeBn({ id: "b1", size: 600 });
      const policy = createDefaultAutoWarPolicy();
      policy.maxArmySize = 400;

      const result = processAutoWarTick({
        battalions: [bn],
        policy,
        reachableTargets: [],
        battalionsInTransit: new Set(),
      });

      const total = result.battalions.reduce((s, b) => s + b.size, 0);
      assert.ok(total <= 400);
      assert.ok(result.summary.some((s) => s.includes("capped")));
    });

    it("routes reinforcements to priority battlefields", () => {
      const bn = makeBn({ id: "b1", size: 200 });
      const policy = createDefaultAutoWarPolicy();
      policy.guardPercent = 0; // all army offensive
      policy.maxArmySize = 500;
      policy.battlefieldPriorities = [
        { battlefieldId: "bf1", priority: BattlefieldPriority.REINFORCE_FIRST, side: "DEFENDER", ourArmyRemaining: 20, enemyArmyRemaining: 100 },
      ];

      const result = processAutoWarTick({
        battalions: [bn],
        policy,
        reachableTargets: [],
        battalionsInTransit: new Set(),
      });

      assert.equal(result.reinforcements.length, 1);
      assert.equal(result.reinforcements[0].battlefieldId, "bf1");
      assert.ok(result.reinforcements[0].armySent > 0);
    });

    it("does not dispatch if battalion in transit", () => {
      const bn = makeBn({ id: "b1", size: 200 });
      const policy = createDefaultAutoWarPolicy();
      policy.fronts = [
        createWarFront({ id: "f1", enemyFortressId: "e1", battalionIds: ["b1"], now: 0 }),
      ];
      policy.priorityTiles = [
        { tileId: "t1", priority: TileAttackPriority.PRIMARY, targetEnemyId: "e1" },
      ];

      const result = processAutoWarTick({
        battalions: [bn],
        policy,
        reachableTargets: [
          { tileId: "t1", priority: TileAttackPriority.PRIMARY, isConnected: true, estimatedDefense: 10, distance: 1 },
        ],
        battalionsInTransit: new Set(["b1"]),
      });

      assert.equal(result.orders.length, 0);
    });

    it("adds and removes priority tiles", () => {
      let policy = createDefaultAutoWarPolicy();
      assert.equal(policy.priorityTiles.length, 0);
      policy = addPriorityTile(policy, { tileId: "t1", priority: TileAttackPriority.PRIMARY, targetEnemyId: "e1" });
      assert.equal(policy.priorityTiles.length, 1);
      policy = addPriorityTile(policy, { tileId: "t1", priority: TileAttackPriority.SECONDARY, targetEnemyId: "e1" });
      assert.equal(policy.priorityTiles.length, 1); // replaced
      assert.equal(policy.priorityTiles[0].priority, TileAttackPriority.SECONDARY);
      policy = removePriorityTile(policy, "t1");
      assert.equal(policy.priorityTiles.length, 0);
    });
  });
});
