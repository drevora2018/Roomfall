import { BUFFS, PERKS } from "../config/perks.js";
import { SHOP_WEAPON_IDS, WEAPONS } from "../config/weapons.js";
import { createRng, deriveSeed } from "./rng.js";

export function getShopCostMultiplier(roomIndex, type) {
  const roomFactor = Math.max(0, roomIndex - 1);
  const base = 1 + roomFactor * 0.06 + roomFactor * roomFactor * 0.008;
  const slotBonus = type === "weapon" ? 0.18 : type === "perk" ? 0.08 : 0;
  return base + slotBonus;
}

function scaleOfferCost(baseCost, roomIndex, type) {
  return Math.max(1, Math.round(baseCost * getShopCostMultiplier(roomIndex, type)));
}

export function getRerollCost(rerolls, roomIndex = 1) {
  const roomFactor = Math.max(0, roomIndex - 1);
  return Math.round(18 + rerolls * 10 + roomFactor * 2.5 + roomFactor * roomFactor * 0.1);
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
  const perkId = perkPool.length ? rng.pick(perkPool) : null;
  const [buffA, buffB] = chooseUnique(rng, buffPool, 2);

  const offers = [
    { slot: "weapon", type: "weapon", itemId: weaponId },
    perkId
      ? { slot: "perk", type: "perk", itemId: perkId }
      : { slot: "perk", type: "soldOut", itemId: null },
    { slot: "buff-a", type: "buff", itemId: buffA },
    { slot: "buff-b", type: "buff", itemId: buffB ?? buffA },
  ].map((offer) => {
    if (offer.type === "weapon") {
      const item = WEAPONS[offer.itemId];
      return {
        ...offer,
        name: item.name,
        description: item.description,
        cost: scaleOfferCost(item.cost, roomIndex, offer.type),
        rarity: item.rarity,
        detailLabel: "Weapon",
      };
    }
    if (offer.type === "perk") {
      const item = PERKS[offer.itemId];
      return {
        ...offer,
        name: item.name,
        description: item.description,
        cost: scaleOfferCost(item.cost, roomIndex, offer.type),
        rarity: "perk",
        stackRule: item.stackRule,
        detailLabel: "Unique",
      };
    }
    if (offer.type === "soldOut") {
      return {
        ...offer,
        name: "Perk Slot Exhausted",
        description: "All unique perks for this run have already been purchased.",
        cost: 0,
        rarity: "sold-out",
        detailLabel: "Exhausted",
      };
    }
    const item = BUFFS[offer.itemId];
    return {
      ...offer,
      name: item.name,
      description: item.description,
      cost: scaleOfferCost(item.cost, roomIndex, offer.type),
      rarity: "buff",
      stackRule: item.stackRule,
      detailLabel: "Stacking",
    };
  });

  const affordableSupportOffer = offers.find(
    (offer) => offer.type !== "weapon" && offer.type !== "soldOut" && offer.cost <= budget,
  );
  if (!affordableSupportOffer && Number.isFinite(budget) && budget > 0 && roomIndex <= 6) {
    const sortedBuffIds = Object.entries(BUFFS)
      .sort((left, right) => left[1].cost - right[1].cost)
      .map(([id]) => id);
    const otherBuffId = offers[3]?.itemId ?? null;
    const cheapestBuffId = sortedBuffIds.find((id) => id !== otherBuffId) ?? sortedBuffIds[0];
    const cheapestBuff = BUFFS[cheapestBuffId];
    const scaledCost = scaleOfferCost(cheapestBuff.cost, roomIndex, "buff");
    offers[2] = {
      slot: "buff-a",
      type: "buff",
      itemId: cheapestBuffId,
      name: cheapestBuff.name,
      description: cheapestBuff.description,
      cost: budget > 0 ? Math.min(scaledCost, Math.max(1, Math.floor(budget))) : scaledCost,
      rarity: "buff",
      stackRule: cheapestBuff.stackRule,
      detailLabel: "Starter Relief",
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
  if (offer.type === "soldOut") {
    return { ok: false, reason: "That slot is exhausted for this run." };
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
