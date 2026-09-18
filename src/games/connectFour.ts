// ── 4 gewinnt – reine Spiel-Logik (ohne IO, unit-testbar) ────────────────────
// Brett = flaches Array der Länge 42 (6 Zeilen × 7 Spalten). Index = row*COLS + col.
// Zeile 0 = oben, Zeile 5 = unten. 0 = leer, 1 = Rot, 2 = Gelb.

export type Cell = 0 | 1 | 2
export type Player = 1 | 2

export const COLS = 7
export const ROWS = 6
export const idx = (r: number, c: number): number => r * COLS + c
export function emptyBoard(): Cell[] { return new Array(ROWS * COLS).fill(0) as Cell[] }

/** Legt einen Stein in die unterste freie Zeile der Spalte. null, wenn Spalte voll/ungültig. */
export function dropPiece(board: Cell[], col: number, player: Player): { board: Cell[]; row: number } | null {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return null
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[idx(r, col)] === 0) {
      const next = board.slice() as Cell[]
      next[idx(r, col)] = player
      return { board: next, row: r }
    }
  }
  return null
}

/** Spalten, in die noch ein Stein passt (oberste Zelle frei). */
export function legalColumns(board: Cell[]): number[] {
  const out: number[] = []
  for (let c = 0; c < COLS; c++) if (board[idx(0, c)] === 0) out.push(c)
  return out
}

export function isDraw(board: Cell[]): boolean {
  return board.every(c => c !== 0)
}

// Richtungen: →, ↓, ↘, ↙ (die übrigen vier sind Spiegelungen davon)
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]]

/** Erster gefundener Vierer. `line` = die 4 Zellindizes (für die Hervorhebung). */
export function checkWinner(board: Cell[]): { player: Player; line: number[] } | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[idx(r, c)]
      if (p === 0) continue
      for (const [dr, dc] of DIRS) {
        const line = [idx(r, c)]
        let rr = r + dr, cc = c + dc
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[idx(rr, cc)] === p) {
          line.push(idx(rr, cc))
          if (line.length === 4) return { player: p as Player, line }
          rr += dr; cc += dc
        }
      }
    }
  }
  return null
}
