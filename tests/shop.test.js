import assert from "node:assert/strict";
import test from "node:test";

import { PERKS } from "../src/config/perks.js";
import { createShopState, getRerollCost, getShopCostMultiplier } from "../src/systems/shop.js";

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
  assert.equal(getRerollCost(0, 1), 18);
  assert.equal(getRerollCost(3, 1), 48);
  assert.ok(getRerollCost(0, 7) > getRerollCost(0, 3));
  assert.ok(getShopCostMultiplier(7, "perk") > getShopCostMultiplier(3, "perk"));
});

test("shop exhausts the perk slot once every unique perk is already owned", () => {
  const ownedPerks = Object.keys(PERKS);
  const shop = createShopState({
    seed: 1234,
    roomIndex: 8,
    rerolls: 1,
    currentWeaponId: "shotgun",
    ownedPerks,
    budget: 400,
  });

  assert.equal(shop.offers[1].type, "soldOut");
  assert.equal(shop.offers[1].cost, 0);
  assert.equal(shop.offers[1].name, "Perk Slot Exhausted");
});

test("late-room weapon prices stay below the previous runaway curve", () => {
  const shop = createShopState({
    seed: 55,
    roomIndex: 35,
    rerolls: 0,
    currentWeaponId: "shotgun",
    ownedPerks: [],
    budget: 562,
  });

  assert.equal(shop.offers[0].itemId, "smg");
  assert.ok(shop.offers[0].cost < 1000);
  assert.ok(shop.offers[0].cost > 800);
  assert.ok(getRerollCost(0, 35) < 250);
});

test("early-room affordability fallback does not duplicate buff offers", () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    const shop = createShopState({
      seed,
      roomIndex: 6,
      rerolls: 0,
      currentWeaponId: "pistol",
      ownedPerks: [],
      budget: 20,
    });

    const buffIds = shop.offers.filter((offer) => offer.type === "buff").map((offer) => offer.itemId);
    assert.equal(new Set(buffIds).size, buffIds.length);
  }
});
