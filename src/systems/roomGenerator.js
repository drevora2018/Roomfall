import { ROOM_GEN_CONFIG } from "../config/roomGen.js";
import { createRng, deriveSeed } from "./rng.js";

function createGrid(width, height, fill = 0) {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function chooseWeightedFootprint(rng) {
  return rng.pickWeighted(
    Object.entries(ROOM_GEN_CONFIG.footprintWeights).map(([value, weight]) => ({ value, weight })),
  );
}

function getRangeValue(rng, [min, max]) {
  return rng.int(min, max);
}

function buildFloorMask(type, width, height, rng) {
  const mask = createGrid(width, height, 1);
  if (type !== "lShape") {
    return mask;
  }

  const cutWidth = Math.floor(width * rng.float(0.28, 0.42));
  const cutHeight = Math.floor(height * rng.float(0.28, 0.45));
  const corner = rng.pick(["top-left", "top-right", "bottom-left", "bottom-right"]);

  for (let y = 0; y < cutHeight; y += 1) {
    for (let x = 0; x < cutWidth; x += 1) {
      const xPos = corner.includes("right") ? width - 1 - x : x;
      const yPos = corner.includes("bottom") ? height - 1 - y : y;
      mask[yPos][xPos] = 0;
    }
  }

  return mask;
}

function getFloorCells(mask) {
  const cells = [];
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[0].length; x += 1) {
      if (mask[y][x] === 1) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function cellSupportsRadius(mask, blocked, cell, radius = 0.45) {
  const centerX = cell.x + 0.5;
  const centerY = cell.y + 0.5;
  const samples = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, radius * 0.7],
    [radius * 0.7, -radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ];

  return samples.every(([dx, dy]) => {
    const x = Math.floor(centerX + dx);
    const y = Math.floor(centerY + dy);
    return withinBounds(mask, x, y) && mask[y][x] === 1 && blocked[y][x] === 0;
  });
}

function withinBounds(mask, x, y) {
  return y >= 0 && y < mask.length && x >= 0 && x < mask[0].length;
}

function floodFillReachable(mask, blocked, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const cell = queue.shift();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      const key = `${next.x},${next.y}`;
      if (!withinBounds(mask, next.x, next.y) || seen.has(key)) {
        continue;
      }
      if (mask[next.y][next.x] !== 1 || blocked[next.y][next.x] === 1) {
        continue;
      }
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

function pickSpawn(mask, rng) {
  const floor = getFloorCells(mask);
  const ideal = {
    x: Math.floor(mask[0].length * 0.28),
    y: Math.floor(mask.length * 0.52),
  };
  return floor.reduce((best, cell) => {
    const distance = Math.hypot(cell.x - ideal.x, cell.y - ideal.y);
    return !best || distance < best.distance ? { ...cell, distance } : best;
  }, null);
}

function isInsideReserve(x, y, reservedCells) {
  return reservedCells.some((entry) => Math.hypot(x - entry.cell.x, y - entry.cell.y) <= entry.radius);
}

function placeObstacles(mask, spawn, rng, isBoss = false, reservedCells = []) {
  const blocked = createGrid(mask[0].length, mask.length, 0);
  const floorCells = getFloorCells(mask);
  const density = rng.float(ROOM_GEN_CONFIG.obstacleDensity.min, ROOM_GEN_CONFIG.obstacleDensity.max);
  const target = Math.floor(floorCells.length * density);
  let placed = 0;

  for (let attempt = 0; attempt < ROOM_GEN_CONFIG.maxPlacementAttempts && placed < target; attempt += 1) {
    const origin = rng.pick(floorCells);
    const clusterSize = rng.int(
      ROOM_GEN_CONFIG.obstacleClusterSize[0],
      ROOM_GEN_CONFIG.obstacleClusterSize[1],
    );
    const positions = [];

    for (let index = 0; index < clusterSize; index += 1) {
      const x = origin.x + rng.int(-1, 1);
      const y = origin.y + rng.int(-1, 1);
      if (!withinBounds(mask, x, y) || mask[y][x] !== 1 || blocked[y][x] === 1) {
        continue;
      }
      if (Math.hypot(x - spawn.x, y - spawn.y) <= ROOM_GEN_CONFIG.safeSpawnRadius) {
        continue;
      }
      if (isInsideReserve(x, y, reservedCells)) {
        continue;
      }
      positions.push({ x, y });
      blocked[y][x] = 1;
    }

    const reachable = floodFillReachable(mask, blocked, spawn);
    const availableFloor = floorCells.filter((cell) => blocked[cell.y][cell.x] === 0);
    if (reachable.size !== availableFloor.length) {
      for (const cell of positions) {
        blocked[cell.y][cell.x] = 0;
      }
      continue;
    }

    placed += positions.length;
  }

  return blocked;
}

function pickEnemySpawns(mask, blocked, spawn, rng, radius = 0.4) {
  const floorCells = getFloorCells(mask).filter((cell) => blocked[cell.y][cell.x] === 0);
  const openCells = getFloorCells(mask)
    .filter((cell) => blocked[cell.y][cell.x] === 0)
    .filter((cell) => cellSupportsRadius(mask, blocked, cell, radius));
  const candidates = openCells
    .filter((cell) => Math.hypot(cell.x - spawn.x, cell.y - spawn.y) >= ROOM_GEN_CONFIG.minimumSpawnDistance);
  const fallbackCells = floorCells.filter(
    (cell) => Math.hypot(cell.x - spawn.x, cell.y - spawn.y) >= ROOM_GEN_CONFIG.minimumSpawnDistance - 2,
  );
  const pool = candidates.length ? candidates : openCells.length ? openCells : fallbackCells;

  const count = Math.min(pool.length, 10);
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function pickBossSpawn(mask, blocked, spawn, rng) {
  const candidates = getFloorCells(mask)
    .filter((cell) => Math.hypot(cell.x - spawn.x, cell.y - spawn.y) >= ROOM_GEN_CONFIG.minimumSpawnDistance + 2)
    .filter((cell) => cellSupportsRadius(mask, blocked, cell, 0.9));

  if (!candidates.length) {
    return { x: mask[0].length - 4, y: Math.floor(mask.length / 2) };
  }

  return candidates.reduce((best, cell) => {
    const score =
      Math.hypot(cell.x - spawn.x, cell.y - spawn.y) +
      rng.float(0, 1.5);
    return !best || score > best.score ? { ...cell, score } : best;
  }, null);
}

function pickBossAnchor(mask, spawn, rng) {
  const candidates = getFloorCells(mask).filter(
    (cell) => Math.hypot(cell.x - spawn.x, cell.y - spawn.y) >= ROOM_GEN_CONFIG.minimumSpawnDistance + 2,
  );

  if (!candidates.length) {
    return { x: mask[0].length - 4, y: Math.floor(mask.length / 2) };
  }

  return candidates.reduce((best, cell) => {
    const score = Math.hypot(cell.x - spawn.x, cell.y - spawn.y) + rng.float(0, 1.5);
    return !best || score > best.score ? { ...cell, score } : best;
  }, null);
}

export function validateRoomConnectivity(room) {
  const reachable = floodFillReachable(room.mask, room.blocked, room.spawn);
  const floorCount = getFloorCells(room.mask).filter((cell) => room.blocked[cell.y][cell.x] === 0).length;
  return reachable.size === floorCount;
}

export function generateRoom({ seed, roomIndex, isBoss = false }) {
  const rng = createRng(deriveSeed(seed, "room", roomIndex, isBoss ? "boss" : "normal"));
  const type = isBoss ? "boss" : chooseWeightedFootprint(rng);
  const ranges = ROOM_GEN_CONFIG.sizeRanges[type];
  const width = isBoss ? ranges.width : getRangeValue(rng, ranges.width);
  const height = isBoss ? ranges.height : getRangeValue(rng, ranges.height);

  let mask = buildFloorMask(type, width, height, rng);
  if (type === "boss") {
    mask = createGrid(width, height, 1);
  }
  const spawn = pickSpawn(mask, rng);
  const bossAnchor = isBoss ? pickBossAnchor(mask, spawn, rng) : null;
  const blocked = placeObstacles(
    mask,
    spawn,
    rng,
    isBoss,
    bossAnchor ? [{ cell: bossAnchor, radius: 2.25 }] : [],
  );
  const enemySpawns = isBoss
    ? [pickBossSpawn(mask, blocked, spawn, rng) ?? bossAnchor]
    : pickEnemySpawns(mask, blocked, spawn, rng, 0.46);

  return {
    type,
    width,
    height,
    mask,
    blocked,
    spawn,
    enemySpawns,
    seed: deriveSeed(seed, "room", roomIndex),
    isBoss,
  };
}
