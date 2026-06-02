import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const componentDir = dirname(fileURLToPath(import.meta.url));
const tutorialFiles = [
  join(componentDir, "tutorial-panel.tsx"),
  join(componentDir, "tutorial-panel.module.css"),
];

test("tutorial panel source has no mojibake markers", () => {
  const badMarkers = [
    String.fromCharCode(0x00e2),
    String.fromCharCode(0x00f0),
    String.fromCharCode(0x00c3),
    String.fromCharCode(0xfffd),
  ];

  for (const filePath of tutorialFiles) {
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

test("tutorial teaches Season 4 recruitment and retired PvE correctly", () => {
  const source = readFileSync(tutorialFiles[0], "utf8");

  assert.match(source, /Recruits fill those battalions passively while room exists/);
  assert.match(source, /Home of A and loot camps are not live Season 4 targets/);
  assert.doesNotMatch(source, /Order paid recruits/i);
  assert.doesNotMatch(source, /Queue army with gold/i);
  assert.doesNotMatch(source, /Army grows passively each tick/i);
  assert.doesNotMatch(source, /Home of A is a daily boss/i);
});

test("tutorial is a focused stepper instead of a flat always-open list", () => {
  const source = readFileSync(tutorialFiles[0], "utf8");
  const css = readFileSync(tutorialFiles[1], "utf8");

  assert.match(source, /Back/);
  assert.match(source, /Next/);
  assert.match(source, /Mark done/);
  assert.match(source, /All steps/);
  assert.match(css, /\.focusStep/);
  assert.match(css, /\.stepRail/);
});
