import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const wikiDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(wikiDir, "../../../public");

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectFiles(fullPath);
    }

    return /\.(ts|tsx|css)$/.test(entry) ? [fullPath] : [];
  });
}

const wikiFiles = collectFiles(wikiDir);
const wikiRuntimeFiles = wikiFiles.filter((filePath) => !filePath.endsWith(".test.ts"));

test("wiki source has no mojibake markers", () => {
  const badMarkers = [
    String.fromCharCode(0x00e2),
    String.fromCharCode(0x00f0),
    String.fromCharCode(0x00c3),
    String.fromCharCode(0xfffd),
  ];

  for (const filePath of wikiRuntimeFiles) {
    const source = readFileSync(filePath, "utf8");

    for (const marker of badMarkers) {
      assert.equal(
        source.includes(marker),
        false,
        `${filePath} contains mojibake marker ${marker}`,
      );
    }
  }
});

test("wiki does not describe retired Season 4 PvE as live", () => {
  const forbiddenPatterns = [
    /Home of A is a daily boss/i,
    /kill it for points/i,
    /Home of A respawns/i,
    /loot camps do spawn/i,
    /loot camps.*can be attacked/i,
  ];

  for (const filePath of wikiRuntimeFiles) {
    const source = readFileSync(filePath, "utf8");

    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `${filePath} matches forbidden retired-system pattern ${pattern}`,
      );
    }
  }
});

test("wiki does not describe retired paid recruitment as live Season 4", () => {
  const forbiddenPatterns = [
    /recruitment is paid up front/i,
    /pay .*gold per unit/i,
    /gold per unit is paid/i,
    /buy queued army/i,
    /buy army/i,
    /paid queue/i,
    /turns paid queue into active army/i,
  ];

  for (const filePath of wikiRuntimeFiles) {
    const source = readFileSync(filePath, "utf8");

    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `${filePath} matches forbidden paid-recruitment pattern ${pattern}`,
      );
    }
  }
});

test("wiki image assets exist", () => {
  const source = wikiRuntimeFiles
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  const assetMatches = source.matchAll(/"(?<asset>\/assets\/[^"]+)"/g);

  for (const match of assetMatches) {
    const asset = match.groups?.asset;

    if (!asset) {
      continue;
    }

    assert.equal(
      existsSync(join(publicDir, asset.replace(/^\//, ""))),
      true,
      `${asset} is referenced by wiki but missing from public assets`,
    );
  }
});
