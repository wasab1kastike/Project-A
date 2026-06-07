import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  SEASON_FIVE_AVATAR_BODY_FAMILIES,
  SEASON_FIVE_AVATAR_LAYER_KEYS,
  getSeasonFiveAvatarBodyFamily,
  getSeasonFiveAvatarLayerFit,
  getSeasonFiveAvatarLayers,
  type SeasonFiveAvatarLayerSlot,
} from "./season-five-avatar-art";

function publicAssetExists(assetPath: string) {
  const localPath = path.join(process.cwd(), "public", assetPath.replace(/^\//, ""));
  return existsSync(localPath);
}

function getPublicPngSize(assetPath: string) {
  const localPath = path.join(process.cwd(), "public", assetPath.replace(/^\//, ""));
  const file = readFileSync(localPath);
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

describe("Season 5 avatar art manifest", () => {
  test("all neutral layer assets exist", () => {
    for (const [slot, visualKeys] of Object.entries(
      SEASON_FIVE_AVATAR_LAYER_KEYS
    ) as Array<[SeasonFiveAvatarLayerSlot, readonly string[]]>) {
      for (const visualKey of visualKeys) {
        const fit = getSeasonFiveAvatarLayerFit({ slot, visualKey });
        assert.ok(fit, `${slot}/${visualKey} should resolve`);
        assert.ok(
          publicAssetExists(fit.assetPath),
          `${fit.assetPath} should exist`
        );
        assert.deepEqual(
          getPublicPngSize(fit.assetPath),
          { width: 256, height: 320 },
          `${fit.assetPath} should use the shared avatar canvas`
        );
      }
    }
  });

  test("every body key maps to a body family", () => {
    for (const bodyKey of SEASON_FIVE_AVATAR_LAYER_KEYS.body) {
      assert.ok(
        getSeasonFiveAvatarBodyFamily(bodyKey),
        `${bodyKey} should have a body family`
      );
    }
  });

  test("all non-body items have fitted family variants", () => {
    for (const slot of ["outfit", "hat", "rod"] as const) {
      for (const visualKey of SEASON_FIVE_AVATAR_LAYER_KEYS[slot]) {
        for (const family of SEASON_FIVE_AVATAR_BODY_FAMILIES) {
          const fit = getSeasonFiveAvatarLayerFit({
            slot,
            visualKey,
            bodyKey: family,
          });
          assert.ok(fit, `${slot}/${visualKey}.${family} should resolve`);
          assert.equal(fit.assetKey, `${visualKey}.${family}`);
          assert.ok(
            publicAssetExists(fit.assetPath),
            `${fit.assetPath} should exist`
          );
          assert.deepEqual(
            getPublicPngSize(fit.assetPath),
            { width: 256, height: 320 },
            `${fit.assetPath} should use the shared avatar canvas`
          );
        }
      }
    }
  });

  test("mixed loadouts resolve fitted item layers", () => {
    const layers = getSeasonFiveAvatarLayers({
      body: "warrior-ironback",
      outfit: "raincoat",
      hat: "bucket",
      rod: "obsidian",
    });

    assert.equal(layers.body?.assetKey, "warrior-ironback");
    assert.equal(layers.outfit?.assetKey, "raincoat.warrior");
    assert.equal(layers.hat?.assetKey, "bucket.warrior");
    assert.equal(layers.rod?.assetKey, "obsidian.warrior");
  });
});
