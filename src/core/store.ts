// Global game store. ALL state changes go through act() (immer draft).
//
// ⚠️ Zustand v5 selector rule: selectors must return STABLE references —
// a state slice (s.store.orders) or a primitive. Never build new arrays/objects
// inside a selector (e.g. s => s.ads.ads.filter(...)) — that re-renders forever.
// Select the slice, then derive with useMemo. For multiple fields use useShallow.
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { produce } from 'immer'
import type { GameState } from './types'

interface GameStore {
  state: GameState | null
  /** mutate the game state with an immer recipe */
  act: (recipe: (s: GameState) => void) => void
  load: (s: GameState | null) => void
}

export const useGame = create<GameStore>()((set, get) => ({
  state: null,
  act: recipe => {
    const cur = get().state
    if (!cur) return
    set({ state: produce(cur, recipe) })
  },
  load: s => set({ state: s }),
}))

/** Read-only access outside React (event handlers, engine). */
export const getGS = (): GameState => {
  const s = useGame.getState().state
  if (!s) throw new Error('No game loaded')
  return s
}
/** Mutate state from anywhere: act(s => { ... }) */
export const act = (recipe: (s: GameState) => void) => useGame.getState().act(recipe)

/** Subscribe to a slice of game state (component must only render while a game is loaded). */
export function useGS<T>(selector: (s: GameState) => T): T {
  return useGame(st => selector(st.state as GameState))
}
/** Subscribe to several fields: useGSShallow(s => ({ a: s.x, b: s.y })) */
export function useGSShallow<T extends object>(selector: (s: GameState) => T): T {
  return useGame(useShallow((st: GameStore) => selector(st.state as GameState)))
}
