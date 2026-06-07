import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import {
  SEASON_FIVE_AVATAR_BODY_FAMILIES,
  SEASON_FIVE_AVATAR_BODY_PARTS,
  SEASON_FIVE_AVATAR_ITEM_PARTS,
  SEASON_FIVE_AVATAR_LAYER_KEYS,
  getSeasonFiveAvatarBodyFamily,
  getSeasonFiveAvatarBodyPartFit,
  getSeasonFiveAvatarItemPartFit,
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

  test("all class body part assets exist", () => {
    for (const rig of SEASON_FIVE_AVATAR_BODY_FAMILIES) {
      for (const part of SEASON_FIVE_AVATAR_BODY_PARTS) {
        const fit = getSeasonFiveAvatarBodyPartFit({ rig, part });
        assert.ok(fit, `${rig}/${part} should resolve`);
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

  test("all declared item replacement part assets exist", () => {
    for (const declaration of SEASON_FIVE_AVATAR_ITEM_PARTS) {
      for (const rig of declaration.rigs) {
        for (const part of declaration.parts) {
          const fit = getSeasonFiveAvatarItemPartFit({
            slot: declaration.slot,
            visualKey: declaration.visualKey,
            rig,
            part,
          });
          assert.ok(
            fit,
            `${declaration.slot}/${declaration.visualKey}/${rig}/${part} should resolve`
          );
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

  test("mixed class loadouts resolve body parts and fitted item layers", () => {
    const layers = getSeasonFiveAvatarLayers({
      body: "warrior",
      outfit: "raincoat",
      hat: "bucket",
      rod: "obsidian",
    });

    assert.equal(layers.body?.assetKey, "warrior");
    assert.deepEqual(
      layers.bodyParts.map((part) => [
        part.part,
        part.sourceSlot,
        part.sourceKey,
      ]),
      [
        ["legs", "outfit", "raincoat"],
        ["torso", "outfit", "raincoat"],
        ["head", "hat", "bucket"],
        ["leftHand", "outfit", "raincoat"],
        ["rightHand", "rod", "obsidian"],
      ]
    );
    assert.ok(
      layers.bodyParts.every((part) => part.rig === "warrior"),
      "class body keys should resolve body parts through the base rig"
    );
    assert.equal(layers.outfit?.assetKey, "raincoat.warrior");
    assert.equal(layers.hat?.assetKey, "bucket.warrior");
    assert.equal(layers.rod?.assetKey, "obsidian.warrior");
  });

  test("body variants resolve replacement parts before equipment parts", () => {
    const layers = getSeasonFiveAvatarLayers({
      body: "warrior-ironback",
      outfit: "pants",
      hat: null,
      rod: "cane",
    });

    assert.equal(layers.body?.assetKey, "warrior-ironback");
    assert.deepEqual(
      layers.bodyParts.map((part) => [
        part.part,
        part.sourceSlot,
        part.sourceKey,
      ]),
      [
        ["legs", "outfit", "pants"],
        ["torso", "body", "warrior-ironback"],
        ["head", "body", "warrior-ironback"],
        ["leftHand", "body", "warrior-ironback"],
        ["rightHand", "rod", "cane"],
      ]
    );
    assert.equal(layers.outfit?.assetKey, "pants.warrior");
    assert.equal(layers.hat, undefined);
    assert.equal(layers.rod?.assetKey, "cane.warrior");
  });
});
