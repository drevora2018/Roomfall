import assert from "node:assert/strict";
import test from "node:test";

import { calculateRoomClearHeal } from "../src/game.js";

test("room clear heal includes baseline recovery", () => {
  const result = calculateRoomClearHeal(
    {
      hp: 40,
      maxHp: 100,
    },
    [],
  );

  assert.equal(result.baseHeal, 8);
  assert.equal(result.perkHeal, 0);
  assert.equal(result.appliedHeal, 8);
  assert.equal(result.nextHp, 48);
});

test("Kill Switch adds 12 HP on top of the normal room clear heal", () => {
  const result = calculateRoomClearHeal(
    {
      hp: 70,
      maxHp: 100,
    },
    ["killSwitch"],
  );

  assert.equal(result.baseHeal, 8);
  assert.equal(result.perkHeal, 12);
  assert.equal(result.appliedHeal, 20);
  assert.equal(result.nextHp, 90);
});

test("room clear heal caps at max HP", () => {
  const result = calculateRoomClearHeal(
    {
      hp: 95,
      maxHp: 100,
    },
    ["killSwitch"],
  );

  assert.equal(result.appliedHeal, 5);
  assert.equal(result.nextHp, 100);
});
