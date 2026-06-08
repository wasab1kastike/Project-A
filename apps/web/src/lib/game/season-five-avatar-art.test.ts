import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  SEASON_FIVE_AVATAR_BODY_FAMILIES,
  SEASON_FIVE_AVATAR_BODY_PARTS,
  SEASON_FIVE_AVATAR_LAYER_KEYS,
  getSeasonFiveAvatarBodyFamily,
  getSeasonFiveAvatarBodyPartFit,
  getSeasonFiveAvatarLayerFit,
  getSeasonFiveAvatarLayers,
  type SeasonFiveAvatarLayerSlot,
} from "./season-five-avatar-art";

function publicAssetExists(assetPath: string) {
  const localPath = path.join(
    process.cwd(),
    "public",
    assetPath.replace(/^\//, "")
  );
  return existsSync(localPath);
}

function getPublicPngSize(assetPath: string) {
  const localPath = path.join(
    process.cwd(),
    "public",
    assetPath.replace(/^\//, "")
  );
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
      body: "warrior",
      outfit: "raincoat",
      hat: "bucket",
      rod: "obsidian",
    });

    assert.equal(layers.body?.assetKey, "warrior");
    assert.equal(layers.outfit?.assetKey, "raincoat.warrior");
    assert.equal(layers.hat?.assetKey, "bucket.warrior");
    assert.equal(layers.rod?.assetKey, "obsidian.warrior");
  });

  test("warrior loadouts resolve modular body-part replacements", () => {
    const layers = getSeasonFiveAvatarLayers({
      body: "warrior",
      outfit: "raincoat",
      hat: "bucket",
      rod: "obsidian",
    });
    const partsByKey = new Map(
      layers.bodyParts.map((partFit) => [partFit.part, partFit])
    );

    assert.equal(layers.bodyParts.length, SEASON_FIVE_AVATAR_BODY_PARTS.length);
    assert.equal(partsByKey.get("legs")?.sourceSlot, "outfit");
    assert.equal(partsByKey.get("legs")?.visualKey, "raincoat");
    assert.equal(partsByKey.get("torso")?.sourceSlot, "outfit");
    assert.equal(partsByKey.get("torso")?.visualKey, "raincoat");
    assert.equal(partsByKey.get("leftHand")?.sourceSlot, "outfit");
    assert.equal(partsByKey.get("leftHand")?.visualKey, "raincoat");
    assert.equal(partsByKey.get("rightHand")?.sourceSlot, "rod");
    assert.equal(partsByKey.get("rightHand")?.visualKey, "obsidian");
    assert.equal(partsByKey.get("head")?.sourceSlot, "hat");
    assert.equal(partsByKey.get("head")?.visualKey, "bucket");

    for (const partFit of layers.bodyParts) {
      assert.ok(
        publicAssetExists(partFit.assetPath),
        `${partFit.assetPath} should exist`
      );
      assert.deepEqual(
        getPublicPngSize(partFit.assetPath),
        { width: 256, height: 320 },
        `${partFit.assetPath} should use the shared avatar canvas`
      );
    }
  });

  test("warrior modular body parts fall back to base parts when a slot is empty", () => {
    const layers = getSeasonFiveAvatarLayers({
      body: "warrior",
      outfit: "pants",
      hat: null,
      rod: "splintered",
    });
    const partsByKey = new Map(
      layers.bodyParts.map((partFit) => [partFit.part, partFit])
    );

    assert.equal(partsByKey.get("head")?.sourceSlot, "body");
    assert.equal(partsByKey.get("head")?.visualKey, "warrior");
  });

  test("non-warrior and deferred rod loadouts keep the full-layer renderer", () => {
    assert.equal(
      getSeasonFiveAvatarLayers({
        body: "wizard",
        outfit: "pants",
        hat: "pointy",
        rod: "obsidian",
      }).bodyParts.length,
      0
    );
    assert.equal(
      getSeasonFiveAvatarLayers({
        body: "warrior",
        outfit: "pants",
        hat: "cap",
        rod: "bamboo",
      }).bodyParts.length,
      0
    );
  });

  test("warrior base body part assets resolve from the class body", () => {
    for (const part of SEASON_FIVE_AVATAR_BODY_PARTS) {
      const fit = getSeasonFiveAvatarBodyPartFit({
        bodyKey: "warrior",
        part,
      });

      assert.ok(fit, `${part} should resolve`);
      assert.equal(fit.sourceSlot, "body");
      assert.equal(fit.visualKey, "warrior");
      assert.ok(publicAssetExists(fit.assetPath), `${fit.assetPath} exists`);
    }
  });

  test("body variants are not active avatar body keys", () => {
    assert.equal(getSeasonFiveAvatarBodyFamily("warrior-ironback"), undefined);
    assert.equal(
      getSeasonFiveAvatarLayerFit({
        slot: "body",
        visualKey: "warrior-ironback",
      }),
      undefined
    );
  });
});
