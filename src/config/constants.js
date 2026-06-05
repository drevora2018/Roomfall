export const SAVE_VERSION = 1;

export const GAME_CONSTANTS = {
  canvasBackground: "#090d14",
  basePlayerHp: 100,
  basePlayerSpeed: 3.2,
  basePlayerInvuln: 0.45,
  pickupRadius: 0.9,
  startGold: 35,
  roomClearGoldBonus: 10,
  roomClearShardReward: 1,
  bossShardBonus: 3,
  eliteChanceFloor: 3,
  enemyContactCooldown: 0.8,
  projectileLifetime: 2.2,
  boundaryHealRatio: 0.08,
  continueRoomGraceHeal: 6,
  companionOrbitRadius: 1.4,
  companionBaseDamage: 8,
  companionBaseFireInterval: 0.7,
  companionMaxHp: 50,
  roomTransitionDelay: 0.6,
};

export const STORAGE_KEYS = {
  meta: "roomfall.meta",
  run: "roomfall.run",
};

export const UI_TABS = ["shop", "skills", "stats"];
