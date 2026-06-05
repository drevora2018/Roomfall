export const ROOM_GEN_CONFIG = {
  tileSize: 48,
  footprintWeights: {
    rectangle: 4,
    wide: 3,
    tall: 3,
    lShape: 2,
  },
  sizeRanges: {
    rectangle: { width: [14, 18], height: [10, 14] },
    wide: { width: [18, 22], height: [10, 12] },
    tall: { width: [12, 15], height: [14, 18] },
    lShape: { width: [16, 20], height: [12, 16] },
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
