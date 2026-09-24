// Shell-level actions shared by HUD, scene, side panel, settings and title screen.
import type { ActivityKind, Activity, GameState } from '../../core/types'
import { act, useGame } from '../../core/store'
import { useUI } from '../../core/ui'
import { saveGame } from '../../core/save'
import { cancelActivity, canDoActivity, enqueueActivity } from '../../sim/life'
import { sfx } from '../audio'

/** canDoActivity guarded against a half-implemented life module. */
export function checkActivity(s: GameState, kind: ActivityKind): { ok: boolean; reason?: string } {
  try {
    return canDoActivity(s, kind) ?? { ok: true }
  } catch {
    return { ok: true }
  }
}

/** Queue an activity (or start it if idle). Plays feedback. Returns the id or null. */
export function doActivity(
  kind: ActivityKind,
  opts?: { payload?: Activity['payload']; label?: string; durationMin?: number; front?: boolean },
): string | null {
  let id = null as string | null
  act(s => {
    id = enqueueActivity(s, kind, opts)
  })
  if (id) sfx.click()
  else sfx.error()
  return id
}

export function cancelAct(activityId: string) {
  act(s => cancelActivity(s, activityId))
  sfx.click()
}

export function setComputerOpen(open: boolean) {
  const u = useUI.getState()
  if (u.computerOpen === open) return
  u.set({ computerOpen: open })
  sfx.whoosh()
}

/** Load a game state into the store and switch to the game screen. */
export function enterGame(state: GameState, slot: number) {
  useGame.getState().load(state)
  useUI.getState().set({
    screen: 'game', slot, speed: 1, lastSpeed: 1, computerOpen: false, tabs: [], activeTab: null, overlay: null, hourFrac: 0,
  })
}

/** Save (best effort) then return to the title screen. */
export async function quitToTitle() {
  const u = useUI.getState()
  const s = useGame.getState().state
  if (s) {
    try {
      await saveGame(u.slot, s)
    } catch (e) {
      console.warn('save on quit failed', e)
    }
  }
  u.set({ screen: 'title', computerOpen: false, overlay: null, tabs: [], activeTab: null, speed: 1 })
  useGame.getState().load(null)
}
