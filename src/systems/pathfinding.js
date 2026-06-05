function getPF() {
  return globalThis.PF ?? null;
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
    finder: new PF.JumpPointFinder({
      diagonalMovement: PF.DiagonalMovement.IfAtMostOneObstacle,
    }),
  };
}

export function findNavigationPath(context, start, goal) {
  const PF = getPF();
  if (!PF || !context) {
    return [];
  }

  const grid = new PF.Grid(context.matrix);
  return context.finder.findPath(start.x, start.y, goal.x, goal.y, grid);
}
