// Real-time game loop: advances the sim by whole hours according to speed.
// 1x = 1.25 real seconds per in-game hour (30s per day). Sleeping fast-forwards 4x on top.
import { useEffect } from 'react'
import { useGame } from './store'
import { useUI } from './ui'
import { tickHour } from '../sim'
import { dayOf } from './time'
import { saveGame } from './save'

export const MS_PER_HOUR = 1250
const MAX_TICKS_PER_FRAME = 6

export function useGameLoop() {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let saving = false
    const frame = (now: number) => {
      const dt = Math.min(250, now - last)
      last = now
      const uiSt = useUI.getState()
      const gs = useGame.getState().state
      const blocked = !gs || uiSt.speed === 0 || uiSt.pauseLocks.length > 0 || (gs.events.modals.length > 0)
      if (!blocked && gs) {
        const sleeping = gs.player.activity?.kind === 'sleep'
        const mult = uiSt.speed * (sleeping ? 4 : 1)
        acc += dt * mult
        let ticks = 0
        const dayBefore = dayOf(gs.time.hour)
        while (acc >= MS_PER_HOUR && ticks < MAX_TICKS_PER_FRAME) {
          acc -= MS_PER_HOUR
          ticks++
          try {
            useGame.getState().act(tickHour)
          } catch (err) {
            console.error('[sim] tick failed', err)
            acc = 0
            break
          }
        }
        if (ticks === MAX_TICKS_PER_FRAME) acc = 0
        const after = useGame.getState().state
        if (after && dayOf(after.time.hour) !== dayBefore && !saving) {
          saving = true
          saveGame(uiSt.slot, after).catch(e => console.warn('autosave failed', e)).finally(() => (saving = false))
        }
        uiSt.set({ hourFrac: acc / MS_PER_HOUR })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
}
