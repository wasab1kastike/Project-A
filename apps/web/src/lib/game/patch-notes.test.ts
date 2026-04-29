import assert from "node:assert/strict";
import test from "node:test";
import { EXPLOIT_HALL_OF_FAME_ENTRIES } from "./exploit-hall-of-fame";
import { PATCH_NOTES_RELEASES, getPatchNotesPageState } from "./patch-notes";
import {
  PATCH_NOTES_PAGE_HREF,
  PRIMARY_GAME_NAV_LINKS,
  WIKI_PAGE_HREF,
} from "./site-navigation";

test("patch notes releases stay newest-first", () => {
  for (let index = 1; index < PATCH_NOTES_RELEASES.length; index += 1) {
    const previousDate = PATCH_NOTES_RELEASES[index - 1]?.date ?? "";
    const currentDate = PATCH_NOTES_RELEASES[index]?.date ?? "";

    assert.ok(previousDate >= currentDate);
  }
});

test("patch notes releases expose both player-facing categories", () => {
  for (const release of PATCH_NOTES_RELEASES) {
    assert.ok(release.newFeatures.length > 0);
    assert.ok(release.bugFixes.length > 0);
  }
});

test("exploit hall of fame credits are available for history", () => {
  const entry = EXPLOIT_HALL_OF_FAME_ENTRIES[0];

  assert.ok(entry);
  assert.equal(entry.season, 1);
  assert.equal(entry.exploitName, "Stutterfire");
  assert.equal(entry.founder, "Giga Destroyer");
  assert.equal(entry.firstExploiter, "Giga Destroyer");
});

test("patch notes page state reports empty and populated release lists", () => {
  const populatedState = getPatchNotesPageState();
  const emptyState = getPatchNotesPageState([]);

  assert.equal(populatedState.isEmpty, false);
  assert.equal(populatedState.releases.length, PATCH_NOTES_RELEASES.length);
  assert.equal(emptyState.isEmpty, true);
  assert.deepEqual(emptyState.releases, []);
});

test("primary navigation includes the patch notes page", () => {
  assert.equal(PATCH_NOTES_PAGE_HREF, "/patch-notes");
  assert.equal(
    PRIMARY_GAME_NAV_LINKS.some((link) => link.href === PATCH_NOTES_PAGE_HREF),
    true
  );
});

test("primary navigation includes wiki", () => {
  assert.equal(WIKI_PAGE_HREF, "/wiki");
  assert.equal(
    PRIMARY_GAME_NAV_LINKS.some((link) => link.href === WIKI_PAGE_HREF),
    true
  );
});
