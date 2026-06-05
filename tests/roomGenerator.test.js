import assert from "node:assert/strict";
import test from "node:test";

import { generateRoom, validateRoomConnectivity } from "../src/systems/roomGenerator.js";

test("generated rooms stay connected across several seeds and milestones", () => {
  const cases = [
    { seed: 1, roomIndex: 1, isBoss: false },
    { seed: 42, roomIndex: 3, isBoss: false },
    { seed: 84, roomIndex: 5, isBoss: true },
    { seed: 128, roomIndex: 11, isBoss: false },
  ];

  for (const entry of cases) {
    const room = generateRoom(entry);
    assert.equal(validateRoomConnectivity(room), true);
    assert.ok(room.enemySpawns.length > 0);
    assert.equal(room.mask[room.spawn.y][room.spawn.x], 1);
  }
});

test("generation now leans away from square arenas and keeps boss spawns valid", () => {
  const rooms = Array.from({ length: 12 }, (_, index) =>
    generateRoom({ seed: 500 + index, roomIndex: index + 2, isBoss: false }),
  );
  const nonSquareRooms = rooms.filter(
    (room) => room.type !== "rectangle" || Math.abs(room.width - room.height) >= 4,
  );
  const bossRoom = generateRoom({ seed: 999, roomIndex: 10, isBoss: true });

  assert.ok(nonSquareRooms.length >= 8);
  assert.equal(bossRoom.enemySpawns.length, 1);
  assert.equal(validateRoomConnectivity(bossRoom), true);
});
