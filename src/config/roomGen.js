export const ROOM_GEN_CONFIG = {
  tileSize: 48,
  footprintWeights: {
    rectangle: 1,
    wide: 4,
    tall: 4,
    lShape: 5,
  },
  sizeRanges: {
    rectangle: { width: [14, 20], height: [9, 13] },
    wide: { width: [20, 26], height: [8, 11] },
    tall: { width: [8, 11], height: [18, 24] },
    lShape: { width: [18, 24], height: [13, 18] },
    boss: { width: 22, height: 16 },
  },
  obstacleDensity: {
    min: 0.05,
    max: 0.1,
  },
  obstacleClusterSize: [1, 3],
  maxPlacementAttempts: 40,
  minimumSpawnDistance: 6,
  safeSpawnRadius: 2,
};
