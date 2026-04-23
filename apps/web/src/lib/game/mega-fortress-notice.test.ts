import assert from "node:assert/strict";
import test from "node:test";
import {
  getFirstMegaFortressNoticeStorageKey,
  shouldShowFirstMegaFortressNotice,
} from "./mega-fortress-notice";

test("first mega fortress notice key is namespaced per cycle", () => {
  assert.equal(
    getFirstMegaFortressNoticeStorageKey("cycle-123"),
    "project-a:first-mega-fortress-notice:cycle-123"
  );
});

test("first mega fortress notice opens only on the first destroy", () => {
  assert.equal(
    shouldShowFirstMegaFortressNotice({
      cycleId: "cycle-123",
      megaFortressDestroyCount: 1,
      isDismissed: false,
    }),
    true
  );
  assert.equal(
    shouldShowFirstMegaFortressNotice({
      cycleId: "cycle-123",
      megaFortressDestroyCount: 0,
      isDismissed: false,
    }),
    false
  );
  assert.equal(
    shouldShowFirstMegaFortressNotice({
      cycleId: "cycle-123",
      megaFortressDestroyCount: 2,
      isDismissed: false,
    }),
    false
  );
});

test("first mega fortress notice stays closed when cycle is missing or already dismissed", () => {
  assert.equal(
    shouldShowFirstMegaFortressNotice({
      cycleId: null,
      megaFortressDestroyCount: 1,
      isDismissed: false,
    }),
    false
  );
  assert.equal(
    shouldShowFirstMegaFortressNotice({
      cycleId: "cycle-123",
      megaFortressDestroyCount: 1,
      isDismissed: true,
    }),
    false
  );
});

