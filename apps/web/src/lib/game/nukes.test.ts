import assert from "node:assert/strict";
import test from "node:test";
import { NukeComponentKind } from "@/lib/prisma-client";
import {
  allocateNukeArmyLosses,
  chooseNukeComponentWinner,
  getNukeBiddingWindowForDate,
  NUKE_ARMY_DAMAGE_CAP,
} from "./nukes";

test("nuke bidding window uses the Helsinki 14:00 to next-day 12:00 schedule", () => {
  const open = getNukeBiddingWindowForDate(new Date("2026-06-01T12:30:00.000Z"));
  assert.equal(open.isOpen, true);
  assert.equal(open.startsAt.toISOString(), "2026-06-01T11:00:00.000Z");
  assert.equal(open.endsAt.toISOString(), "2026-06-02T09:00:00.000Z");

  const gap = getNukeBiddingWindowForDate(new Date("2026-06-01T10:30:00.000Z"));
  assert.equal(gap.isOpen, false);
  assert.equal(gap.startsAt.toISOString(), "2026-06-01T11:00:00.000Z");
});

test("nuke bidding window handles Helsinki winter offset", () => {
  const open = getNukeBiddingWindowForDate(new Date("2026-01-05T12:30:00.000Z"));
  assert.equal(open.isOpen, true);
  assert.equal(open.startsAt.toISOString(), "2026-01-05T12:00:00.000Z");
  assert.equal(open.endsAt.toISOString(), "2026-01-06T10:00:00.000Z");
});

test("component winner is highest bid with earliest stable tie-break", () => {
  const winner = chooseNukeComponentWinner([
    {
      id: "b",
      fortressId: "late",
      amount: 500,
      createdAt: new Date("2026-06-01T12:00:01.000Z"),
    },
    {
      id: "a",
      fortressId: "early",
      amount: 500,
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    },
    {
      id: "c",
      fortressId: "low",
      amount: 100,
      createdAt: new Date("2026-06-01T11:00:00.000Z"),
    },
  ]);

  assert.equal(winner?.fortressId, "early");
});

test("nuke army losses halve active army and cap at 100k", () => {
  const small = allocateNukeArmyLosses([
    { id: "idle", kind: "idle", amount: 80 },
    { id: "guard", kind: "garrison", amount: 20 },
  ]);
  assert.equal(small.targetLoss, 50);
  assert.equal(
    small.losses.reduce((sum, loss) => sum + loss.loss, 0),
    50
  );

  const huge = allocateNukeArmyLosses([
    { id: "idle", kind: "idle", amount: 500_000 },
    { id: "battle", kind: "battlefield", amount: 500_000 },
  ]);
  assert.equal(huge.targetLoss, NUKE_ARMY_DAMAGE_CAP);
  assert.equal(
    huge.losses.reduce((sum, loss) => sum + loss.loss, 0),
    NUKE_ARMY_DAMAGE_CAP
  );
});

test("nuke component enum includes the required parts", () => {
  assert.deepEqual(
    [
      NukeComponentKind.FUEL,
      NukeComponentKind.ROCKET,
      NukeComponentKind.WRATH_OF_A,
    ],
    ["FUEL", "ROCKET", "WRATH_OF_A"]
  );
});
