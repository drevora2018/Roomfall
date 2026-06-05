import { SCALING_CONFIG } from "../config/scaling.js";

export function getRoomFactor(roomIndex) {
  return Math.max(0, roomIndex - 1);
}

export function getMilestoneSteps(roomIndex) {
  return Math.floor(getRoomFactor(roomIndex) / SCALING_CONFIG.milestoneSize);
}

export function getPlayerRoomScalars(roomIndex) {
  const r = getRoomFactor(roomIndex);
  return {
    damage: 1 + SCALING_CONFIG.playerDamagePerRoom * r,
    hp: 1 + SCALING_CONFIG.playerHpPerRoom * r,
    fireRate: 1 + SCALING_CONFIG.playerFireRatePerRoom * r,
  };
}

export function getCompanionScalar(roomIndex) {
  return 1 + SCALING_CONFIG.companionPerRoom * getRoomFactor(roomIndex);
}

export function getEnemyScalars(roomIndex) {
  const r = getRoomFactor(roomIndex);
  const milestones = getMilestoneSteps(roomIndex);
  return {
    hp: 1 + SCALING_CONFIG.enemyHpPerRoom * r + SCALING_CONFIG.enemyHpMilestone * milestones,
    damage:
      1 +
      SCALING_CONFIG.enemyDamagePerRoom * r +
      SCALING_CONFIG.enemyDamageMilestone * milestones,
    speed: 1 + SCALING_CONFIG.enemySpeedPerRoom * r,
  };
}

export function describeScalingMath() {
  return [
    "Player damage scalar: 1 + 0.03r",
    "Player max HP scalar: 1 + 0.025r",
    "Player fire rate scalar: 1 + 0.012r",
    "Companion power scalar: 1 + 0.02r",
    "Enemy HP scalar: 1 + 0.06r + 0.025 * floor(r / 5)",
    "Enemy damage scalar: 1 + 0.048r + 0.02 * floor(r / 5)",
    "Enemy move speed scalar: 1 + 0.01r",
  ];
}
