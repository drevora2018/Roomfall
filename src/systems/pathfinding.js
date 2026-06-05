function getPF() {
  return globalThis.PF ?? null;
}

function isValidTile(context, point) {
  return (
    Number.isInteger(point?.x) &&
    Number.isInteger(point?.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.y < context.matrix.length &&
    point.x < context.matrix[0].length
  );
}

export function createNavigationContext(room) {
  const PF = getPF();
  if (!PF || !room) {
    return null;
  }

  const matrix = Array.from({ length: room.height }, (_, y) =>
    Array.from({ length: room.width }, (_, x) =>
      room.mask[y][x] === 1 && room.blocked[y][x] === 0 ? 0 : 1,
    ),
  );

  return {
    matrix,
    // The browser bundle exposed on GitHub Pages does not export DiagonalMovement,
    // but its JumpPointFinder defaults to "IfAtMostOneObstacle" when no option is given.
    finder: new PF.JumpPointFinder({}),
  };
}

export function findNavigationPath(context, start, goal) {
  const PF = getPF();
  if (!PF || !context) {
    return [];
  }

  if (!isValidTile(context, start) || !isValidTile(context, goal)) {
    return [];
  }

  try {
    const grid = new PF.Grid(context.matrix);
    return context.finder.findPath(start.x, start.y, goal.x, goal.y, grid);
  } catch {
    return [];
  }
}
