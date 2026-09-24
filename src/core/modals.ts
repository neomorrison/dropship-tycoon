// Decision modals (Game Dev Tycoon-style popups). Any module can push one; the module
// that owns the modal kind registers a handler that applies the chosen effect.
// The engine auto-pauses while s.events.modals is non-empty; the shell renders them.
import type { GameModal, GameState } from './types'
import { uid } from './ids'

type Handler = (s: GameState, modal: GameModal, choiceId: string) => void
const handlers = new Map<string, Handler>()

/** Register at module import time: registerModalHandler('ad_account_ban', (s, m, choice) => {...}) */
export function registerModalHandler(kind: string, fn: Handler) {
  handlers.set(kind, fn)
}

export function pushModal(s: GameState, m: Omit<GameModal, 'id'>): string {
  const id = uid(s, 'modal')
  s.events.modals.push({ ...m, id })
  return id
}

/** UI calls this (inside act) when the player clicks a choice. */
export function resolveModal(s: GameState, modalId: string, choiceId: string) {
  const idx = s.events.modals.findIndex(m => m.id === modalId)
  if (idx < 0) return
  const modal = s.events.modals[idx]
  s.events.modals.splice(idx, 1)
  const h = handlers.get(modal.kind)
  if (h) h(s, modal, choiceId)
}
