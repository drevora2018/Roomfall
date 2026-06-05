import assert from "node:assert/strict";
import test from "node:test";

import { getCompanionScalar, getEnemyScalars, getPlayerRoomScalars } from "../src/systems/scaling.js";

test("player scaling matches documented formulas", () => {
  assert.deepEqual(getPlayerRoomScalars(1), {
    damage: 1,
    hp: 1,
    fireRate: 1,
  });
  assert.deepEqual(getPlayerRoomScalars(5), {
    damage: 1.2,
    hp: 1.16,
    fireRate: 1.1,
  });
  assert.deepEqual(getPlayerRoomScalars(10), {
    damage: 1.45,
    hp: 1.3599999999999999,
    fireRate: 1.225,
  });
});

test("enemy scaling outpaces player with milestone bumps", () => {
  assert.deepEqual(getEnemyScalars(1), {
    hp: 1,
    damage: 1,
    speed: 1,
  });
  assert.deepEqual(getEnemyScalars(10), {
    hp: 1.565,
    damage: 1.452,
    speed: 1.09,
  });
  assert.deepEqual(getEnemyScalars(20), {
    hp: 2.215,
    damage: 1.972,
    speed: 1.19,
  });
  assert.equal(getCompanionScalar(20), 1.608);
});
