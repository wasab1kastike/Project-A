import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Place generated chroma-key source files in SOURCE_DIR using the configured
// file names, then run this importer to normalize them into fixed avatar parts.
const ROOT = process.cwd();
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 320;
const SOURCE_DIR = path.join(
  ROOT,
  "tmp",
  "season-5-warrior-generated-parts",
  "source"
);
const DEBUG_DIR = path.join(
  ROOT,
  "tmp",
  "season-5-warrior-generated-parts",
  "processed"
);
const AVATAR_ROOT = path.join(
  ROOT,
  "apps",
  "web",
  "public",
  "assets",
  "season-5",
  "avatar"
);

const PARTS = {
  head: {
    source: "head.png",
    output: "head.png",
    target: { x: 77, y: 32, width: 102, height: 124 },
  },
  torso: {
    source: "torso.png",
    output: "torso.png",
    target: { x: 43, y: 78, width: 170, height: 156 },
  },
  legs: {
    source: "legs.png",
    output: "legs.png",
    target: { x: 58, y: 170, width: 140, height: 138 },
  },
  leftHand: {
    source: "left-hand.png",
    output: "left-hand.png",
    target: { x: 8, y: 78, width: 90, height: 230 },
  },
  rightHand: {
    source: "right-hand.png",
    output: "right-hand.png",
    target: { x: 148, y: 78, width: 90, height: 230 },
  },
};

const requestedParts = new Set(
  (process.env.SEASON_5_IMPORT_WARRIOR_PARTS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
);

function outputPath(fileName) {
  return path.join(
    AVATAR_ROOT,
    "characters",
    "warrior",
    "idle",
    "front",
    "0",
    fileName
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

function colorDistanceToKey(r, g, b) {
  const dr = r;
  const dg = g - 255;
  const db = b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBorderBackgroundPixel(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const alpha = data[index + 3];

  if (alpha <= 18) return true;
  return alpha < 255 && Math.max(r, g, b) < 42;
}

function removeConnectedBorderBackground(data, width, height) {
  const queue = [];
  const seen = new Uint8Array(width * height);

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixelIndex = y * width + x;
    if (seen[pixelIndex]) return;
    const dataIndex = pixelIndex * 4;
    if (!isBorderBackgroundPixel(data, dataIndex)) return;
    seen[pixelIndex] = 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    data[(y * width + x) * 4 + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
}

function isSubjectSeedPixel(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const alpha = data[index + 3];

  return alpha > 18 && Math.max(r, g, b) > 58 && r > 45;
}

function keepSubjectComponents(data, width, height) {
  const pixelCount = width * height;
  const seed = new Uint8Array(pixelCount);
  const seen = new Uint8Array(pixelCount);
  const keep = new Uint8Array(pixelCount);
  const components = [];

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (isSubjectSeedPixel(data, pixelIndex * 4)) {
      seed[pixelIndex] = 1;
    }
  }

  function visit(startIndex) {
    const queue = [startIndex];
    const pixels = [];
    seen[startIndex] = 1;

    for (let index = 0; index < queue.length; index += 1) {
      const pixelIndex = queue[index];
      pixels.push(pixelIndex);
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const neighbors = [
        pixelIndex - 1,
        pixelIndex + 1,
        pixelIndex - width,
        pixelIndex + width,
      ];

      for (const neighborIndex of neighbors) {
        if (neighborIndex < 0 || neighborIndex >= pixelCount) continue;
        const nx = neighborIndex % width;
        const ny = Math.floor(neighborIndex / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (seen[neighborIndex] || !seed[neighborIndex]) continue;
        seen[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }

    return pixels;
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (!seed[pixelIndex] || seen[pixelIndex]) continue;
    components.push(visit(pixelIndex));
  }

  const largest = Math.max(
    0,
    ...components.map((component) => component.length)
  );
  const minimumSize = Math.max(120, largest * 0.08);
  for (const component of components) {
    if (component.length < minimumSize) continue;
    for (const pixelIndex of component) {
      keep[pixelIndex] = 1;
    }
  }

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = new Uint8Array(keep);
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (!keep[pixelIndex]) continue;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const neighbors = [
        pixelIndex - 1,
        pixelIndex + 1,
        pixelIndex - width,
        pixelIndex + width,
      ];
      for (const neighborIndex of neighbors) {
        if (neighborIndex < 0 || neighborIndex >= pixelCount) continue;
        const nx = neighborIndex % width;
        const ny = Math.floor(neighborIndex / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (data[neighborIndex * 4 + 3] > 18) {
          next[neighborIndex] = 1;
        }
      }
    }
    keep.set(next);
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (keep[pixelIndex]) continue;
    data[pixelIndex * 4 + 3] = 0;
  }
}

async function removeChromaKey(inputPath) {
  const image = sharp(inputPath).ensureAlpha();
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const transparentDistance = 42;
  const opaqueDistance = 145;

  for (let index = 0; index < output.length; index += 4) {
    const r = output[index];
    const g = output[index + 1];
    const b = output[index + 2];
    const originalAlpha = output[index + 3];
    const strongGreen =
      g > 145 && g > Math.max(r * 1.7, b * 1.35) && g > r + 70;

    if (strongGreen) {
      output[index + 3] = 0;
      continue;
    }

    const distance = colorDistanceToKey(r, g, b);
    const matte = Math.max(
      0,
      Math.min(1, (distance - transparentDistance) / opaqueDistance)
    );
    const alpha = Math.round(originalAlpha * matte);

    output[index + 3] = alpha;
    if (alpha < 255 && g > r && g > b) {
      output[index + 1] = Math.max(r, b);
    }
  }
  removeConnectedBorderBackground(output, info.width, info.height);
  keepSubjectComponents(output, info.width, info.height);

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

async function extractAlphaBounds(input) {
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
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("Generated part has no visible alpha pixels.");
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function normalizePart(alphaImage, target) {
  const bounds = await extractAlphaBounds(alphaImage);
  const cropped = await sharp(alphaImage).extract(bounds).png().toBuffer();
  const normalized = await sharp(cropped)
    .resize({
      width: target.width,
      height: target.height,
      fit: "contain",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  const left =
    target.x + Math.round((target.width - (metadata.width ?? 0)) / 2);
  const top =
    target.y + Math.round((target.height - (metadata.height ?? 0)) / 2);

  const normalizedCanvas = await transparentCanvas()
    .composite([{ input: normalized, left, top }])
    .png()
    .toBuffer();
  return removeDetachedDarkArtifacts(normalizedCanvas);
}

async function removeDetachedDarkArtifacts(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);

  function hasNearbySubjectPixel(x, y) {
    const radius = 3;
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.abs(ox) + Math.abs(oy) > radius) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) {
          continue;
        }
        if (isSubjectSeedPixel(output, (ny * info.width + nx) * 4)) {
          return true;
        }
      }
    }
    return false;
  }

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const alpha = output[index + 3];
      const dark =
        Math.max(output[index], output[index + 1], output[index + 2]) < 30;

      if (alpha > 18 && dark && !hasNearbySubjectPixel(x, y)) {
        output[index + 3] = 0;
      }
    }
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

await mkdir(DEBUG_DIR, { recursive: true });
await mkdir(path.dirname(outputPath("head.png")), { recursive: true });

for (const [part, config] of Object.entries(PARTS)) {
  if (requestedParts.size > 0 && !requestedParts.has(part)) {
    continue;
  }

  const sourcePath = path.join(SOURCE_DIR, config.source);
  const alphaImage = await removeChromaKey(sourcePath);
  await sharp(alphaImage).png().toFile(path.join(DEBUG_DIR, config.source));
  const normalizedPart = await normalizePart(alphaImage, config.target);
  await sharp(normalizedPart).png().toFile(outputPath(config.output));
  console.log(`Imported warrior ${part} -> ${outputPath(config.output)}`);
}
