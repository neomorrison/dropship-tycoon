import type { GameState } from './types'
/** Deterministic id from the game's sequence counter. */
export function uid(s: GameState, prefix: string): string {
  s.seq = (s.seq || 0) + 1
  return `${prefix}_${s.seq.toString(36)}`
}
