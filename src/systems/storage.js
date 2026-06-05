import { SAVE_VERSION, STORAGE_KEYS } from "../config/constants.js";

export function createDefaultMetaSave() {
  return {
    version: SAVE_VERSION,
    skillShards: 0,
    unlockedSkills: {},
    highScore: 0,
    settings: {
      muted: false,
    },
  };
}

export function createDefaultRunSave() {
  return {
    version: SAVE_VERSION,
    seed: 0,
    roomIndex: 1,
    gold: 0,
    playerSnapshot: null,
    currentWeaponId: "pistol",
    ownedPerks: [],
    ownedBuffs: [],
    shopState: null,
    bossProgress: 0,
  };
}

export function loadSave(storage, key, fallbackFactory) {
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallbackFactory();
    }
    const parsed = JSON.parse(raw);
    if (parsed.version !== SAVE_VERSION) {
      return fallbackFactory();
    }
    return { ...fallbackFactory(), ...parsed };
  } catch {
    return fallbackFactory();
  }
}

export function saveValue(storage, key, value) {
  storage.setItem(key, JSON.stringify({ ...value, version: SAVE_VERSION }));
}

export function loadMetaSave(storage) {
  return loadSave(storage, STORAGE_KEYS.meta, createDefaultMetaSave);
}

export function loadRunSave(storage) {
  return loadSave(storage, STORAGE_KEYS.run, createDefaultRunSave);
}

export function saveMetaSave(storage, value) {
  saveValue(storage, STORAGE_KEYS.meta, value);
}

export function saveRunSave(storage, value) {
  saveValue(storage, STORAGE_KEYS.run, value);
}

export function clearRunSave(storage) {
  storage.removeItem(STORAGE_KEYS.run);
}

export function clearMetaSave(storage) {
  storage.removeItem(STORAGE_KEYS.meta);
}

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}
