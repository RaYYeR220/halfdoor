export const INF = 1e6;

/**
 * Min-cost assignment on a rectangular matrix (O(n^2 m)). Returns the column chosen for each row,
 * or -1 when the row got no feasible column (every cell >= INF, or more rows than columns).
 * Feasible cells are maximised first, because each INF cell costs more than any real total.
 */
export function hungarian(cost: number[][]): number[] {
  const rows = cost.length;
  if (rows === 0) return [];
  const cols = cost[0].length;
  if (cols === 0) return cost.map(() => -1);
  if (rows > cols) {
    const t = cost[0].map((_, j) => cost.map((r) => r[j]));
    const rowOfCol = hungarian(t); // for each original column, the original row it serves
    const out = cost.map(() => -1);
    rowOfCol.forEach((row, col) => { if (row >= 0) out[row] = col; });
    return out;
  }
  // 1-indexed potentials form (rows <= cols).
  const u = new Array<number>(rows + 1).fill(0);
  const v = new Array<number>(cols + 1).fill(0);
  const p = new Array<number>(cols + 1).fill(0); // p[j] = row matched to column j
  const way = new Array<number>(cols + 1).fill(0);
  for (let i = 1; i <= rows; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(cols + 1).fill(Infinity);
    const used = new Array<boolean>(cols + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= cols; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= cols; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }
  const out = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= cols; j++) if (p[j] !== 0) out[p[j] - 1] = j - 1;
  return out.map((j, i) => (j >= 0 && cost[i][j] >= INF ? -1 : j));
}
