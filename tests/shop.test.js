import assert from "node:assert/strict";
import test from "node:test";

import { createShopState, getRerollCost } from "../src/systems/shop.js";

test("shop rolls stable category mix and reroll costs scale", () => {
  const shop = createShopState({
    seed: 99,
    roomIndex: 4,
    rerolls: 0,
    currentWeaponId: "pistol",
    ownedPerks: [],
    budget: 30,
  });

  assert.equal(shop.offers.length, 4);
  assert.deepEqual(
    shop.offers.map((offer) => offer.type),
    ["weapon", "perk", "buff", "buff"],
  );
  assert.ok(shop.offers.some((offer) => offer.type !== "weapon" && offer.cost <= 30));
  assert.equal(getRerollCost(0), 18);
  assert.equal(getRerollCost(3), 51);
});
