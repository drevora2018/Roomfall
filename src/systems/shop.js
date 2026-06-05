import { BUFFS, PERKS } from "../config/perks.js";
import { SHOP_WEAPON_IDS, WEAPONS } from "../config/weapons.js";
import { createRng, deriveSeed } from "./rng.js";

export function getRerollCost(rerolls) {
  return 18 + rerolls * 11;
}

function chooseUnique(rng, ids, count) {
  const remaining = [...ids];
  const chosen = [];
  while (remaining.length && chosen.length < count) {
    const index = rng.int(0, remaining.length - 1);
    chosen.push(remaining.splice(index, 1)[0]);
  }
  return chosen;
}

export function createShopState({
  seed,
  roomIndex,
  rerolls,
  currentWeaponId,
  ownedPerks = [],
  budget = Number.POSITIVE_INFINITY,
}) {
  const rng = createRng(deriveSeed(seed, "shop", roomIndex, rerolls, currentWeaponId));
  const weaponPool = SHOP_WEAPON_IDS.filter((id) => id !== currentWeaponId);
  const perkPool = Object.keys(PERKS).filter((id) => !ownedPerks.includes(id));
  const buffPool = Object.keys(BUFFS);

  const weaponId = weaponPool.length ? rng.pick(weaponPool) : currentWeaponId;
  const perkId = perkPool.length ? rng.pick(perkPool) : rng.pick(Object.keys(PERKS));
  const [buffA, buffB] = chooseUnique(rng, buffPool, 2);

  const offers = [
    { slot: "weapon", type: "weapon", itemId: weaponId },
    { slot: "perk", type: "perk", itemId: perkId },
    { slot: "buff-a", type: "buff", itemId: buffA },
    { slot: "buff-b", type: "buff", itemId: buffB ?? buffA },
  ].map((offer) => {
    if (offer.type === "weapon") {
      const item = WEAPONS[offer.itemId];
      return {
        ...offer,
        name: item.name,
        description: item.description,
        cost: item.cost,
        rarity: item.rarity,
      };
    }
    if (offer.type === "perk") {
      const item = PERKS[offer.itemId];
      return {
        ...offer,
        name: item.name,
        description: item.description,
        cost: item.cost,
        rarity: "perk",
      };
    }
    const item = BUFFS[offer.itemId];
    return {
      ...offer,
      name: item.name,
      description: item.description,
      cost: item.cost,
      rarity: "buff",
    };
  });

  const affordableSupportOffer = offers.find(
    (offer) => offer.type !== "weapon" && offer.cost <= budget,
  );
  if (!affordableSupportOffer && Number.isFinite(budget)) {
    const cheapestBuffId = Object.entries(BUFFS).sort((left, right) => left[1].cost - right[1].cost)[0][0];
    const cheapestBuff = BUFFS[cheapestBuffId];
    offers[2] = {
      slot: "buff-a",
      type: "buff",
      itemId: cheapestBuffId,
      name: cheapestBuff.name,
      description: cheapestBuff.description,
      cost: cheapestBuff.cost,
      rarity: "buff",
    };
  }

  return {
    rerolls,
    offers,
  };
}

export function applyShopPurchase(runState, offer) {
  if (!offer) {
    return { ok: false, reason: "Offer missing." };
  }
  if (runState.gold < offer.cost) {
    return { ok: false, reason: "Not enough Gold." };
  }

  if (offer.type === "weapon") {
    return {
      ok: true,
      runState: {
        ...runState,
        gold: runState.gold - offer.cost,
        currentWeaponId: offer.itemId,
      },
    };
  }

  if (offer.type === "perk") {
    if (runState.ownedPerks.includes(offer.itemId)) {
      return { ok: false, reason: "Perk already owned." };
    }
    return {
      ok: true,
      runState: {
        ...runState,
        gold: runState.gold - offer.cost,
        ownedPerks: [...runState.ownedPerks, offer.itemId],
      },
    };
  }

  return {
    ok: true,
    runState: {
      ...runState,
      gold: runState.gold - offer.cost,
      ownedBuffs: [...runState.ownedBuffs, offer.itemId],
    },
  };
}
