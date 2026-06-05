import { SKILL_TREE } from "../config/skills.js";

export function getSkillLevel(unlockedSkills, skillId) {
  return unlockedSkills?.[skillId] ?? 0;
}

export function canBuySkill(unlockedSkills, skill, skillShards) {
  const level = getSkillLevel(unlockedSkills, skill.id);
  if (level >= skill.maxLevel) {
    return false;
  }
  const cost = skill.costs[level];
  if (skillShards < cost) {
    return false;
  }
  return skill.prerequisites.every((skillId) => getSkillLevel(unlockedSkills, skillId) > 0);
}

export function getAggregatedSkillEffects(unlockedSkills = {}) {
  const totals = {
    damageMultiplier: 0,
    fireRateMultiplier: 0,
    flatSpeed: 0,
    goldMultiplier: 0,
    unlockCompanion: false,
    companionPower: 0,
    companionUplink: 0,
  };

  for (const skill of SKILL_TREE) {
    const level = getSkillLevel(unlockedSkills, skill.id);
    if (!level) {
      continue;
    }
    for (const [key, value] of Object.entries(skill.effect)) {
      if (typeof value === "boolean") {
        totals[key] = totals[key] || value;
      } else {
        totals[key] += value * level;
      }
    }
  }

  return totals;
}

export function buySkill(metaSave, skillId) {
  const skill = SKILL_TREE.find((entry) => entry.id === skillId);
  if (!skill) {
    return { ok: false, reason: "Missing skill." };
  }
  if (!canBuySkill(metaSave.unlockedSkills, skill, metaSave.skillShards)) {
    return { ok: false, reason: "Requirements not met." };
  }

  const level = getSkillLevel(metaSave.unlockedSkills, skillId);
  const cost = skill.costs[level];
  return {
    ok: true,
    metaSave: {
      ...metaSave,
      skillShards: metaSave.skillShards - cost,
      unlockedSkills: {
        ...metaSave.unlockedSkills,
        [skillId]: level + 1,
      },
    },
  };
}
