export function hashSeed(input) {
  const text = String(input);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return {
    next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let result = Math.imul(state ^ (state >>> 15), 1 | state);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    float(min, max) {
      return this.next() * (max - min) + min;
    },
    pick(items) {
      return items[this.int(0, items.length - 1)];
    },
    pickWeighted(entries) {
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = this.float(0, total);
      for (const entry of entries) {
        roll -= entry.weight;
        if (roll <= 0) {
          return entry.value;
        }
      }
      return entries[entries.length - 1].value;
    },
  };
}

export function deriveSeed(...parts) {
  return hashSeed(parts.join(":"));
}
