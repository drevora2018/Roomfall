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
