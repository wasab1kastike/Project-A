import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import sharp from "sharp";
import {
  SEASON_FIVE_AVATAR_FRAME_SCALES,
  SEASON_FIVE_AVATAR_BODY_FAMILIES,
  SEASON_FIVE_AVATAR_BODY_PARTS,
  SEASON_FIVE_AVATAR_LAYER_KEYS,
  getSeasonFiveAvatarBodyFamily,
  getSeasonFiveAvatarBodyPartFit,
  getSeasonFiveAvatarLayerFit,
  getSeasonFiveAvatarLayers,
  type SeasonFiveAvatarLoadout,
  type SeasonFiveAvatarLayerSlot,
} from "./season-five-avatar-art";

const AVATAR_CANVAS_WIDTH = 256;
const AVATAR_CANVAS_HEIGHT = 320;
const VISUAL_ALPHA_THRESHOLD = 64;
const MIN_FRAMED_SIDE_MARGIN_PX = 22;
const MIN_FRAMED_TOP_MARGIN_PX = 16;

type AlphaMargins = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function getPublicAssetLocalPath(assetPath: string) {
  return path.join(process.cwd(), "public", assetPath.replace(/^\//, ""));
}

function publicAssetExists(assetPath: string) {
  return existsSync(getPublicAssetLocalPath(assetPath));
}

function getPublicPngSize(assetPath: string) {
  const localPath = getPublicAssetLocalPath(assetPath);
  const file = readFileSync(localPath);
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

async function composeWarriorBodyPartLoadout(loadout: SeasonFiveAvatarLoadout) {
  const bodyParts = getSeasonFiveAvatarLayers(loadout).bodyParts;
  assert.equal(bodyParts.length, SEASON_FIVE_AVATAR_BODY_PARTS.length);

  return sharp({
    create: {
      width: AVATAR_CANVAS_WIDTH,
      height: AVATAR_CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      bodyParts.map((partFit) => ({
        input: getPublicAssetLocalPath(partFit.assetPath),
      }))
    )
    .png()
    .toBuffer();
}

async function getVisualAlphaMargins(input: Buffer): Promise<AlphaMargins> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > VISUAL_ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  assert.notEqual(maxX, -1, "avatar composition should contain visible pixels");
  return {
    left: minX,
    top: minY,
    right: info.width - 1 - maxX,
    bottom: info.height - 1 - maxY,
  };
}

function getCenteredFrameMargins(
  margins: AlphaMargins,
  scale: number
): AlphaMargins {
  const xInset = (AVATAR_CANVAS_WIDTH * (1 - scale)) / 2;
  const yInset = (AVATAR_CANVAS_HEIGHT * (1 - scale)) / 2;
  return {
    left: xInset + margins.left * scale,
    top: yInset + margins.top * scale,
    right: xInset + margins.right * scale,
    bottom: yInset + margins.bottom * scale,
  };
}

function formatMargin(value: number) {
  return `${value.toFixed(1)}px`;
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

  test("warrior map-framed loadouts keep safe visual margins", async () => {
    const outfits = ["pants", "waders", "raincoat"] as const;
    const hats = [null, "cap", "bucket", "pointy"] as const;
    const rods = ["splintered", "cane", "obsidian"] as const;

    for (const outfit of outfits) {
      for (const hat of hats) {
        for (const rod of rods) {
          const label = `${outfit}/${hat ?? "none"}/${rod}`;
          const rawMargins = await getVisualAlphaMargins(
            await composeWarriorBodyPartLoadout({
              body: "warrior",
              outfit,
              hat,
              rod,
            })
          );
          const framedMargins = getCenteredFrameMargins(
            rawMargins,
            SEASON_FIVE_AVATAR_FRAME_SCALES.map
          );

          assert.ok(
            framedMargins.left >= MIN_FRAMED_SIDE_MARGIN_PX,
            `${label} framed left margin ${formatMargin(
              framedMargins.left
            )} should stay clear`
          );
          assert.ok(
            framedMargins.right >= MIN_FRAMED_SIDE_MARGIN_PX,
            `${label} framed right margin ${formatMargin(
              framedMargins.right
            )} should stay clear`
          );
          assert.ok(
            framedMargins.bottom >= MIN_FRAMED_SIDE_MARGIN_PX,
            `${label} framed bottom margin ${formatMargin(
              framedMargins.bottom
            )} should stay clear`
          );
          assert.ok(
            framedMargins.top >= MIN_FRAMED_TOP_MARGIN_PX,
            `${label} framed top margin ${formatMargin(
              framedMargins.top
            )} should stay clear`
          );
        }
      }
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
