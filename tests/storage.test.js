import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryStorage,
  loadMetaSave,
  loadRunSave,
  saveMetaSave,
  saveRunSave,
} from "../src/systems/storage.js";

test("meta and run saves round-trip with versioned shapes", () => {
  const storage = createMemoryStorage();

  saveMetaSave(storage, {
    skillShards: 9,
    unlockedSkills: { ballistics: 2 },
    highScore: 12,
    settings: { muted: true },
  });

  saveRunSave(storage, {
    seed: 55,
    roomIndex: 7,
    gold: 120,
    playerSnapshot: { hp: 48, maxHp: 100 },
    currentWeaponId: "smg",
    ownedPerks: ["killSwitch"],
    ownedBuffs: ["rapidGrease"],
    shopState: { rerolls: 1, offers: [] },
    bossProgress: 1,
  });

  assert.equal(loadMetaSave(storage).skillShards, 9);
  assert.equal(loadMetaSave(storage).settings.muted, true);
  assert.equal(loadRunSave(storage).roomIndex, 7);
  assert.equal(loadRunSave(storage).currentWeaponId, "smg");
});
