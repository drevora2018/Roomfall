import assert from "node:assert/strict";
import test from "node:test";

import { createNavigationContext, findNavigationPath } from "../src/systems/pathfinding.js";

test("pathfinding adapter works with browser-style PF export lacking DiagonalMovement", () => {
  const originalPF = globalThis.PF;
  let receivedOptions = null;

  globalThis.PF = {
    JumpPointFinder: class {
      constructor(options) {
        receivedOptions = options;
      }
    },
  };

  const context = createNavigationContext({
    width: 3,
    height: 2,
    mask: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    blocked: [
      [0, 1, 0],
      [0, 0, 0],
    ],
  });

  assert.deepEqual(receivedOptions, {});
  assert.deepEqual(context.matrix, [
    [0, 1, 0],
    [0, 0, 0],
  ]);

  globalThis.PF = originalPF;
});

test("pathfinding adapter returns empty path for invalid coordinates instead of throwing", () => {
  const originalPF = globalThis.PF;

  globalThis.PF = {
    Grid: class {
      constructor(matrix) {
        this.matrix = matrix;
      }
    },
    JumpPointFinder: class {
      findPath() {
        throw new Error("should not run for invalid coordinates");
      }
    },
  };

  const context = createNavigationContext({
    width: 2,
    height: 2,
    mask: [
      [1, 1],
      [1, 1],
    ],
    blocked: [
      [0, 0],
      [0, 0],
    ],
  });

  assert.deepEqual(findNavigationPath(context, { x: NaN, y: 0 }, { x: 1, y: 1 }), []);
  assert.deepEqual(findNavigationPath(context, { x: 0, y: 0 }, { x: 2, y: 1 }), []);

  globalThis.PF = originalPF;
});
