import assert from "node:assert/strict";
import test from "node:test";

import { getMapViewKeyboardAction } from "./map-controls";

test("map view keyboard actions include main keyboard and numpad inputs", () => {
  assert.equal(getMapViewKeyboardAction({ key: "+" }), "zoom-in");
  assert.equal(getMapViewKeyboardAction({ key: "=" }), "zoom-in");
  assert.equal(
    getMapViewKeyboardAction({ key: "Unidentified", code: "NumpadAdd" }),
    "zoom-in",
  );

  assert.equal(getMapViewKeyboardAction({ key: "-" }), "zoom-out");
  assert.equal(
    getMapViewKeyboardAction({ key: "Unidentified", code: "NumpadSubtract" }),
    "zoom-out",
  );

  assert.equal(getMapViewKeyboardAction({ key: "0" }), "reset-view");
  assert.equal(
    getMapViewKeyboardAction({ key: "Unidentified", code: "Numpad0" }),
    "reset-view",
  );
});

test("map view keyboard actions ignore unrelated keys", () => {
  assert.equal(getMapViewKeyboardAction({ key: "ArrowUp" }), null);
  assert.equal(getMapViewKeyboardAction({ key: "Escape" }), null);
});
