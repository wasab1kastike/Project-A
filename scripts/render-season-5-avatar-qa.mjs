import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const AVATAR_ROOT = path.join(
  REPO_ROOT,
  "apps",
  "web",
  "public",
  "assets",
  "season-5",
  "avatar"
);
const DOCS_ROOT = path.join(REPO_ROOT, "docs");

const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 320;

const FAMILIES = [
  { key: "warrior", label: "Retired Warrior" },
  { key: "wizard", label: "Demented Wizard" },
  { key: "rogue", label: "Burnt-Out Rogue" },
  { key: "monk", label: "Drunken Monk" },
];

const OUTFITS = [
  { key: "pants", label: "No coat" },
  { key: "waders", label: "Waders" },
  { key: "raincoat", label: "Raincoat" },
  { key: "greatcoat", label: "Greatcoat" },
];

const HATS = [
  { key: null, label: "No hat" },
  { key: "cap", label: "Cap" },
  { key: "bucket", label: "Bucket" },
  { key: "pointy", label: "Pointy" },
];

const RODS = [
  { key: "splintered", label: "Splintered" },
  { key: "cane", label: "Cane" },
  { key: "bamboo", label: "Bamboo" },
  { key: "obsidian", label: "Obsidian" },
];

const SAMPLE_COMBINATIONS = [
  {
    key: "default",
    label: "Default",
    outfit: "pants",
    hat: null,
    rod: "splintered",
  },
  {
    key: "waders-cap-cane",
    label: "Waders + cap + cane",
    outfit: "waders",
    hat: "cap",
    rod: "cane",
  },
  {
    key: "raincoat-bucket-obsidian",
    label: "Raincoat + bucket + obsidian",
    outfit: "raincoat",
    hat: "bucket",
    rod: "obsidian",
  },
  {
    key: "greatcoat-pointy-bamboo",
    label: "Greatcoat + pointy + bamboo",
    outfit: "greatcoat",
    hat: "pointy",
    rod: "bamboo",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetPathForBase(family, outfit) {
  return outfit === "pants"
    ? path.join(AVATAR_ROOT, "body", `${family}.png`)
    : path.join(AVATAR_ROOT, "base", family, `${outfit}.png`);
}

function assetPathForFittedLayer(slot, visualKey, family, outfit) {
  if (
    slot === "hat" &&
    outfit === "greatcoat" &&
    (family === "warrior" || family === "rogue")
  ) {
    return path.join(AVATAR_ROOT, slot, `${visualKey}.${family}.${outfit}.png`);
  }

  return path.join(AVATAR_ROOT, slot, `${visualKey}.${family}.png`);
}

async function assertFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing avatar QA asset: ${filePath}`);
  }
}

async function composeAvatar({
  family,
  outfit,
  hat,
  rod,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
}) {
  const basePath = assetPathForBase(family, outfit);
  const rodPath = assetPathForFittedLayer("rod", rod, family, outfit);
  const hatPath = hat
    ? assetPathForFittedLayer("hat", hat, family, outfit)
    : null;

  await assertFileExists(basePath);
  await assertFileExists(rodPath);
  if (hatPath) await assertFileExists(hatPath);

  const fullSizeAvatar = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: basePath, left: 0, top: 0 },
      { input: rodPath, left: 0, top: 0 },
      ...(hatPath ? [{ input: hatPath, left: 0, top: 0 }] : []),
    ])
    .png()
    .toBuffer();

  if (width !== CANVAS_WIDTH || height !== CANVAS_HEIGHT) {
    return sharp(fullSizeAvatar)
      .resize(width, height, {
        fit: "contain",
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
  }

  return fullSizeAvatar;
}

async function renderBaseCell({ family, outfit, width, height }) {
  const basePath = assetPathForBase(family, outfit);
  await assertFileExists(basePath);

  return sharp(basePath)
    .resize(width, height, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

function renderTextLines({ lines, x, y, fontSize, color, weight = 700 }) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * (fontSize + 4)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`
    )
    .join("");
}

function makeSheetSvg({
  title,
  subtitle,
  width,
  height,
  rows,
  columns,
  left,
  top,
  cellWidth,
  cellHeight,
  compact = false,
}) {
  const labelColor = "#f6eddc";
  const mutedColor = "#b8c5b1";
  const cellStroke = compact ? "#55615a" : "#667265";
  const guardStroke = compact ? "#83745d" : "#a58b59";

  const columnText = columns
    .map((column, columnIndex) => {
      const x = left + columnIndex * cellWidth + 8;
      const y = compact ? top - 42 : top - 44;
      const lines = Array.isArray(column.labelLines)
        ? column.labelLines
        : [column.label];
      return renderTextLines({
        lines,
        x,
        y,
        fontSize: compact ? 11 : 18,
        color: labelColor,
        weight: 700,
      });
    })
    .join("");

  const rowText = rows
    .map((row, rowIndex) => {
      const x = 24;
      const y = top + rowIndex * cellHeight + (compact ? 32 : 58);
      const lines = Array.isArray(row.labelLines)
        ? row.labelLines
        : [row.label];
      return renderTextLines({
        lines,
        x,
        y,
        fontSize: compact ? 12 : 18,
        color: labelColor,
        weight: 700,
      });
    })
    .join("");

  const cells = rows
    .flatMap((_, rowIndex) =>
      columns.map((_, columnIndex) => {
        const x = left + columnIndex * cellWidth;
        const y = top + rowIndex * cellHeight;
        return [
          `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="0" fill="#1d2a23" stroke="${cellStroke}" stroke-width="1"/>`,
          `<rect x="${x + 8}" y="${y + 8}" width="${cellWidth - 16}" height="${cellHeight - 16}" rx="0" fill="none" stroke="${guardStroke}" stroke-width="1" stroke-dasharray="5 7" opacity="0.55"/>`,
        ].join("");
      })
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#111916"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#17231d"/>
  <text x="24" y="30" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="${labelColor}">${escapeXml(title)}</text>
  <text x="24" y="54" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="600" fill="${mutedColor}">${escapeXml(subtitle)}</text>
  ${columnText}
  ${rowText}
  ${cells}
</svg>`;
}

async function renderGrid({
  title,
  subtitle,
  rows,
  columns,
  output,
  cellWidth,
  cellHeight,
  left,
  top,
  compact = false,
  renderCell,
}) {
  const width = left + columns.length * cellWidth + 24;
  const height = top + rows.length * cellHeight + 24;
  const svg = makeSheetSvg({
    title,
    subtitle,
    width,
    height,
    rows,
    columns,
    left,
    top,
    cellWidth,
    cellHeight,
    compact,
  });
  const composites = [];

  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, column] of columns.entries()) {
      composites.push({
        input: await renderCell({
          row,
          column,
          rowIndex,
          columnIndex,
          width: cellWidth,
          height: cellHeight,
        }),
        left: left + columnIndex * cellWidth,
        top: top + rowIndex * cellHeight,
      });
    }
  }

  await sharp(Buffer.from(svg)).composite(composites).png().toFile(output);
  return output;
}

async function renderBaseGrid() {
  return renderGrid({
    title: "Season 5 Hybrid Avatar Bases",
    subtitle:
      "Each class has one no-coat body plus fitted waders, raincoat, and greatcoat bases on a 256 x 320 canvas.",
    rows: FAMILIES,
    columns: OUTFITS,
    output: path.join(DOCS_ROOT, "season-5-avatar-hybrid-bases.png"),
    cellWidth: CANVAS_WIDTH,
    cellHeight: CANVAS_HEIGHT,
    left: 190,
    top: 120,
    renderCell: ({ row, column, width, height }) =>
      renderBaseCell({
        family: row.key,
        outfit: column.key,
        width,
        height,
      }),
  });
}

async function renderSampleGrid() {
  return renderGrid({
    title: "Season 5 Hybrid Avatar Sample Combinations",
    subtitle:
      "Representative base + rod + hat stacks using the same layer order as the app.",
    rows: FAMILIES,
    columns: SAMPLE_COMBINATIONS,
    output: path.join(DOCS_ROOT, "season-5-avatar-hybrid-samples.png"),
    cellWidth: CANVAS_WIDTH,
    cellHeight: CANVAS_HEIGHT,
    left: 190,
    top: 120,
    renderCell: ({ row, column, width, height }) =>
      composeAvatar({
        family: row.key,
        outfit: column.outfit,
        hat: column.hat,
        rod: column.rod,
        width,
        height,
      }),
  });
}

async function renderMatrix() {
  const columns = OUTFITS.flatMap((outfit) =>
    HATS.map((hat) => ({
      outfit: outfit.key,
      hat: hat.key,
      label: `${outfit.label} / ${hat.label}`,
      labelLines: [outfit.label, hat.label],
    }))
  );
  const rows = FAMILIES.flatMap((family) =>
    RODS.map((rod) => ({
      family: family.key,
      rod: rod.key,
      label: `${family.label} / ${rod.label}`,
      labelLines: [family.label, rod.label],
    }))
  );

  return renderGrid({
    title: "Season 5 Hybrid Avatar Exhaustive Matrix",
    subtitle:
      "All active class, outfit, hat, and rod visual combinations; pants maps to the no-coat body.",
    rows,
    columns,
    output: path.join(DOCS_ROOT, "season-5-avatar-hybrid-matrix.png"),
    cellWidth: 96,
    cellHeight: 120,
    left: 190,
    top: 108,
    compact: true,
    renderCell: ({ row, column, width, height }) =>
      composeAvatar({
        family: row.family,
        outfit: column.outfit,
        hat: column.hat,
        rod: row.rod,
        width,
        height,
      }),
  });
}

async function main() {
  await fs.mkdir(DOCS_ROOT, { recursive: true });
  const outputs = [
    await renderBaseGrid(),
    await renderSampleGrid(),
    await renderMatrix(),
  ];

  for (const output of outputs) {
    console.log(path.relative(REPO_ROOT, output));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
