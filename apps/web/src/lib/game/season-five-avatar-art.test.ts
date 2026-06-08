import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import sharp from "sharp";
import {
  SEASON_FIVE_AVATAR_BODY_FAMILIES,
  SEASON_FIVE_AVATAR_FRAME_SCALES,
  SEASON_FIVE_AVATAR_LAYER_KEYS,
  getSeasonFiveAvatarBaseFit,
  getSeasonFiveAvatarBodyFamily,
  getSeasonFiveAvatarLayerFit,
  getSeasonFiveAvatarLayers,
  type SeasonFiveAvatarLayerFit,
  type SeasonFiveAvatarLayerSlot,
  type SeasonFiveAvatarLoadout,
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

async function composeAvatarLoadout(loadout: SeasonFiveAvatarLoadout) {
  const layers = getSeasonFiveAvatarLayers(loadout);
  const orderedLayers: Array<SeasonFiveAvatarLayerFit | undefined> = [
    layers.base,
    layers.rod,
    layers.hat,
  ];

  return sharp({
    create: {
      width: AVATAR_CANVAS_WIDTH,
      height: AVATAR_CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      orderedLayers
        .filter((layer): layer is SeasonFiveAvatarLayerFit => Boolean(layer))
        .map((layer) => ({
          input: getPublicAssetLocalPath(layer.assetPath),
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
  test("all neutral gear visual assets exist", () => {
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

  test("all class body and coat base assets exist", () => {
    for (const family of SEASON_FIVE_AVATAR_BODY_FAMILIES) {
      for (const outfit of SEASON_FIVE_AVATAR_LAYER_KEYS.outfit) {
        const fit = getSeasonFiveAvatarBaseFit({
          body: family,
          outfit,
          hat: null,
          rod: "splintered",
        });

        assert.ok(fit, `${family}/${outfit} base should resolve`);
        assert.equal(fit.bodyFamily, family);
        assert.equal(fit.outfitKey, outfit);
        assert.equal(fit.sourceSlot, outfit === "pants" ? "body" : "outfit");
        assert.equal(
          fit.assetKey,
          outfit === "pants" ? family : `${family}.${outfit}`
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
  });

  test("hat and rod overlays have fitted family variants", () => {
    for (const slot of ["hat", "rod"] as const) {
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

  test("greatcoat hats resolve outfit-specific variants for regenerated bodies", () => {
    for (const family of ["warrior", "rogue"] as const) {
      for (const hat of SEASON_FIVE_AVATAR_LAYER_KEYS.hat) {
        const greatcoatLayers = getSeasonFiveAvatarLayers({
          body: family,
          outfit: "greatcoat",
          hat,
          rod: "splintered",
        });

        assert.equal(
          greatcoatLayers.hat?.assetKey,
          `${hat}.${family}.greatcoat`
        );
        assert.ok(
          publicAssetExists(greatcoatLayers.hat?.assetPath ?? ""),
          `${greatcoatLayers.hat?.assetPath} should exist`
        );

        const pantsLayers = getSeasonFiveAvatarLayers({
          body: family,
          outfit: "pants",
          hat,
          rod: "splintered",
        });

        assert.equal(pantsLayers.hat?.assetKey, `${hat}.${family}`);
      }
    }

    for (const family of ["monk", "wizard"] as const) {
      for (const hat of SEASON_FIVE_AVATAR_LAYER_KEYS.hat) {
        const layers = getSeasonFiveAvatarLayers({
          body: family,
          outfit: "greatcoat",
          hat,
          rod: "splintered",
        });

        assert.equal(layers.hat?.assetKey, `${hat}.${family}`);
      }
    }
  });

  test("mixed loadouts resolve hybrid base and overlay layers", () => {
    const layers = getSeasonFiveAvatarLayers({
      body: "warrior",
      outfit: "raincoat",
      hat: "bucket",
      rod: "obsidian",
    });

    assert.equal(layers.base?.assetKey, "warrior.raincoat");
    assert.equal(layers.base?.sourceSlot, "outfit");
    assert.equal(layers.hat?.assetKey, "bucket.warrior");
    assert.equal(layers.rod?.assetKey, "obsidian.warrior");
    assert.equal("bodyParts" in layers, false);
  });

  test("pants resolve to the no-coat class body", () => {
    for (const family of SEASON_FIVE_AVATAR_BODY_FAMILIES) {
      const base = getSeasonFiveAvatarBaseFit({
        body: family,
        outfit: "pants",
        hat: null,
        rod: "splintered",
      });

      assert.equal(base?.sourceSlot, "body");
      assert.equal(base?.assetKey, family);
      assert.equal(
        base?.assetPath,
        `/assets/season-5/avatar/body/${family}.png`
      );
    }
  });

  test("hybrid avatar compositions keep safe map-frame margins", async () => {
    const outfits = SEASON_FIVE_AVATAR_LAYER_KEYS.outfit;
    const hats = [null, ...SEASON_FIVE_AVATAR_LAYER_KEYS.hat] as const;
    const rods = SEASON_FIVE_AVATAR_LAYER_KEYS.rod;

    for (const family of SEASON_FIVE_AVATAR_BODY_FAMILIES) {
      for (const outfit of outfits) {
        for (const hat of hats) {
          for (const rod of rods) {
            const label = `${family}/${outfit}/${hat ?? "none"}/${rod}`;
            const rawMargins = await getVisualAlphaMargins(
              await composeAvatarLoadout({
                body: family,
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
