import { access, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 320;
const WARRIOR_PREVIEW_FRAME_SCALE = 0.86;
const AVATAR_ROOT = path.join(
  ROOT,
  "apps",
  "web",
  "public",
  "assets",
  "season-5",
  "avatar"
);
const DOCS_ROOT = path.join(ROOT, "docs");
const WARRIOR_BODY = path.join(AVATAR_ROOT, "body", "warrior.png");

const BODY_PARTS = ["legs", "torso", "leftHand", "rightHand", "head"];
const PART_FILE_BY_PART = {
  legs: "legs",
  torso: "torso",
  head: "head",
  leftHand: "left-hand",
  rightHand: "right-hand",
};

const ITEM_PARTS = {
  outfit: {
    pants: ["legs"],
    waders: ["legs", "torso"],
    raincoat: ["legs", "torso", "leftHand", "rightHand"],
  },
  hat: {
    cap: ["head"],
    bucket: ["head"],
    pointy: ["head"],
  },
  rod: {
    splintered: ["rightHand"],
    cane: ["rightHand"],
    obsidian: ["rightHand"],
  },
};

const ITEM_LAYER_TRANSFORMS = {
  outfit: {
    raincoat: { scale: 1.12, left: -15, top: -48 },
  },
};

const MASK_PATHS = {
  legs: "M72 178 L184 178 L199 313 L57 313 Z",
  torso: "M51 82 C78 76 178 76 205 82 L197 223 C164 231 92 231 59 223 Z",
  head: "M72 18 L184 18 L184 158 L72 158 Z",
  leftHand: "M0 88 C34 85 76 93 95 117 L91 310 L14 310 Z",
  rightHand: "M161 117 C180 93 222 85 256 88 L242 310 L165 310 Z",
};

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&apos;";
  });
}

function maskSvg(part) {
  return Buffer.from(
    `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><path d="${MASK_PATHS[part]}" fill="#fff"/></svg>`
  );
}

function transparentCanvas() {
  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
}

async function maskedSource(input, part) {
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: maskSvg(part), blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function layerSource(input) {
  return sharp(input).ensureAlpha().png().toBuffer();
}

async function transformedLayerSource(input, transform) {
  if (!transform) return layerSource(input);

  const width = Math.round(CANVAS_WIDTH * transform.scale);
  const height = Math.round(CANVAS_HEIGHT * transform.scale);
  const padX = Math.max(
    Math.abs(transform.left),
    Math.max(0, width - CANVAS_WIDTH)
  );
  const padY = Math.max(
    Math.abs(transform.top),
    Math.max(0, height - CANVAS_HEIGHT)
  );
  const resized = await sharp(input)
    .ensureAlpha()
    .resize({ width, height, fit: "fill" })
    .png()
    .toBuffer();
  const placed = await sharp({
    create: {
      width: CANVAS_WIDTH + padX * 2,
      height: CANVAS_HEIGHT + padY * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        left: padX + transform.left,
        top: padY + transform.top,
      },
    ])
    .png()
    .toBuffer();

  return sharp(placed)
    .extract({
      left: padX,
      top: padY,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    })
    .png()
    .toBuffer();
}

async function writePng(outputPath, input) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(input).png().toFile(outputPath);
}

function characterPartPath(part) {
  return path.join(
    AVATAR_ROOT,
    "characters",
    "warrior",
    "idle",
    "front",
    "0",
    `${PART_FILE_BY_PART[part]}.png`
  );
}

function itemPartPath(slot, key, part) {
  return path.join(
    AVATAR_ROOT,
    "items",
    slot,
    key,
    "warrior",
    "idle",
    "front",
    "0",
    `${PART_FILE_BY_PART[part]}.png`
  );
}

function fittedLayerPath(slot, key) {
  return path.join(AVATAR_ROOT, slot, `${key}.warrior.png`);
}

function referencePath(slot, key) {
  return path.join(AVATAR_ROOT, "reference", slot, `${key}.png`);
}

async function composeLayers(layers) {
  return transparentCanvas()
    .composite(layers.map((input) => ({ input })))
    .png()
    .toBuffer();
}

async function frameAvatar(input, scale) {
  const width = Math.round(CANVAS_WIDTH * scale);
  const height = Math.round(CANVAS_HEIGHT * scale);
  const framed = await sharp(input)
    .resize({ width, height, fit: "fill" })
    .png()
    .toBuffer();

  return transparentCanvas()
    .composite([
      {
        input: framed,
        left: Math.round((CANVAS_WIDTH - width) / 2),
        top: Math.round((CANVAS_HEIGHT - height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function writeBaseParts() {
  for (const part of BODY_PARTS) {
    await access(characterPartPath(part));
  }
}

async function writeItemParts() {
  for (const [slot, items] of Object.entries(ITEM_PARTS)) {
    for (const [key, parts] of Object.entries(items)) {
      const sourcePath = fittedLayerPath(slot, key);
      const itemLayer = await transformedLayerSource(
        sourcePath,
        ITEM_LAYER_TRANSFORMS[slot]?.[key]
      );
      for (const part of parts) {
        const basePart = await maskedSource(WARRIOR_BODY, part);
        const partItemLayer =
          slot === "hat" || slot === "rod"
            ? itemLayer
            : await maskedSource(itemLayer, part);
        await writePng(
          itemPartPath(slot, key, part),
          await composeLayers([basePart, partItemLayer])
        );
      }
      await mkdir(path.dirname(referencePath(slot, key)), { recursive: true });
      await copyFile(sourcePath, referencePath(slot, key));
    }
  }
}

function sheetBackground(width, height) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#191c1a"/>
      <defs>
        <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#2d332f"/>
          <rect x="8" y="8" width="8" height="8" fill="#2d332f"/>
          <rect x="8" width="8" height="8" fill="#222723"/>
          <rect y="8" width="8" height="8" fill="#222723"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#checker)" opacity="0.55"/>
    </svg>
  `);
}

function labelSvg(width, height, label) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="0" fill="rgba(0,0,0,0.62)"/>
      <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#f5ead8">${escapeXml(label)}</text>
    </svg>
  `);
}

async function renderSheet({
  entries,
  columns,
  cellWidth,
  cellHeight,
  output,
}) {
  const rows = Math.ceil(entries.length / columns);
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const composites = [];

  for (const [index, entry] of entries.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellWidth;
    const y = row * cellHeight;
    const sprite = await sharp(entry.input)
      .resize({
        width: Math.round(cellWidth * 0.82),
        height: Math.round(cellHeight * 0.78),
        fit: "contain",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const spriteMeta = await sharp(sprite).metadata();
    composites.push({
      input: sprite,
      left: x + Math.round((cellWidth - (spriteMeta.width ?? 0)) / 2),
      top: y + 8,
    });
    composites.push({
      input: labelSvg(cellWidth, 34, entry.label),
      left: x,
      top: y + cellHeight - 34,
    });
  }

  await sharp(sheetBackground(width, height))
    .composite(composites)
    .png()
    .toFile(output);
}

function partPathForLoadout(part, loadout) {
  if (ITEM_PARTS.outfit[loadout.outfit]?.includes(part)) {
    return itemPartPath("outfit", loadout.outfit, part);
  }
  if (loadout.hat && ITEM_PARTS.hat[loadout.hat]?.includes(part)) {
    return itemPartPath("hat", loadout.hat, part);
  }
  if (ITEM_PARTS.rod[loadout.rod]?.includes(part)) {
    return itemPartPath("rod", loadout.rod, part);
  }
  return characterPartPath(part);
}

async function renderLoadout(loadout) {
  const layers = BODY_PARTS.map((part) => partPathForLoadout(part, loadout));
  return composeLayers(layers);
}

async function withOpacity(input, opacity) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);

  for (let index = 3; index < output.length; index += 4) {
    output[index] = Math.round(output[index] * opacity);
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function writeBodyPartSheet() {
  const recomposedWarrior = await composeLayers(
    BODY_PARTS.map((part) => characterPartPath(part))
  );
  const overlayComparison = await composeLayers([
    await withOpacity(WARRIOR_BODY, 0.35),
    recomposedWarrior,
  ]);
  await renderSheet({
    entries: [
      { label: "recomposed", input: recomposedWarrior },
      { label: "overlay", input: overlayComparison },
      ...BODY_PARTS.map((part) => ({
        label: part,
        input: characterPartPath(part),
      })),
    ],
    columns: 7,
    cellWidth: 150,
    cellHeight: 205,
    output: path.join(DOCS_ROOT, "season-5-warrior-body-parts.png"),
  });
}

async function writeItemSheets() {
  await renderSheet({
    entries: Object.entries(ITEM_PARTS).flatMap(([slot, items]) =>
      Object.keys(items).map((key) => ({
        label: `${slot}: ${key}`,
        input: referencePath(slot, key),
      }))
    ),
    columns: 3,
    cellWidth: 170,
    cellHeight: 220,
    output: path.join(DOCS_ROOT, "season-5-warrior-item-references.png"),
  });

  const combinations = [];
  for (const outfit of Object.keys(ITEM_PARTS.outfit)) {
    for (const hat of Object.keys(ITEM_PARTS.hat)) {
      for (const rod of Object.keys(ITEM_PARTS.rod)) {
        combinations.push({
          label: `${outfit} ${hat} ${rod === "splintered" ? "split" : rod}`,
          input: await frameAvatar(
            await renderLoadout({ outfit, hat, rod }),
            WARRIOR_PREVIEW_FRAME_SCALE
          ),
        });
      }
    }
  }
  await renderSheet({
    entries: combinations,
    columns: 3,
    cellWidth: 220,
    cellHeight: 198,
    output: path.join(DOCS_ROOT, "season-5-warrior-item-combinations.png"),
  });
}

await writeBaseParts();
if (process.env.SEASON_5_REBUILD_WARRIOR_ITEM_PARTS === "1") {
  await writeItemParts();
}
await writeBodyPartSheet();
if (process.env.SEASON_5_RENDER_WARRIOR_ITEM_SHEETS === "1") {
  await writeItemSheets();
}

console.log(
  "Generated Season 5 warrior modular avatar base-body review sheet."
);
